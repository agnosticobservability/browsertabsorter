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
var applyValueTransform = (val, transform, pattern) => {
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
            val = applyValueTransform(val, rule.transform, rule.transformPattern);
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
            </select>

            <div class="regex-container" style="display:none; flex-basis: 100%; margin-top: 8px; padding: 8px; background: #f8f9fa; border: 1px dashed #ced4da; border-radius: 4px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                    <span style="font-weight: 500; font-size: 0.9em;">Pattern:</span>
                    <input type="text" class="transform-pattern" placeholder="e.g. ^(w+)-(d+)$" style="flex:1;">
                    <span title="Captures all groups and concatenates them. If no match, result is empty. Example: 'user-(d+)' extracts '123' from 'user-123'." style="cursor: help; color: #007bff; font-weight: bold; background: #e7f1ff; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 12px;">?</span>
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
    const testInput = div.querySelector(".regex-test-input");
    const testResult = div.querySelector(".regex-test-result");
    const toggleTransform = () => {
      if (transformSelect.value === "regex") {
        regexContainer.style.display = "block";
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
      } catch (e) {
        testResult.textContent = "(invalid regex)";
        testResult.style.color = "red";
      }
    };
    patternInput.addEventListener("input", () => {
      updateTest();
      updateBreadcrumb();
    });
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
        transformPattern: transform === "regex" ? transformPattern : void 0,
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
    addDnDListeners(row, container);
    container.appendChild(row);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC9sb2dnZXIudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZXh0cmFjdGlvbi9sb2dpYy50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9leHRyYWN0aW9uL2dlbmVyYVJlZ2lzdHJ5LnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3N0b3JhZ2UudHMiLCAiLi4vLi4vc3JjL3NoYXJlZC91dGlscy50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9wcmVmZXJlbmNlcy50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9leHRyYWN0aW9uL2luZGV4LnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2NvbnRleHRBbmFseXNpcy50cyIsICIuLi8uLi9zcmMvc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy91aS9jb21tb24udHMiLCAiLi4vLi4vc3JjL3VpL2RldnRvb2xzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBMb2dFbnRyeSwgTG9nTGV2ZWwsIFByZWZlcmVuY2VzIH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcblxuY29uc3QgUFJFRklYID0gXCJbVGFiU29ydGVyXVwiO1xuXG5jb25zdCBMRVZFTF9QUklPUklUWTogUmVjb3JkPExvZ0xldmVsLCBudW1iZXI+ID0ge1xuICBkZWJ1ZzogMCxcbiAgaW5mbzogMSxcbiAgd2FybjogMixcbiAgZXJyb3I6IDMsXG4gIGNyaXRpY2FsOiA0XG59O1xuXG5sZXQgY3VycmVudExldmVsOiBMb2dMZXZlbCA9IFwiaW5mb1wiO1xubGV0IGxvZ3M6IExvZ0VudHJ5W10gPSBbXTtcbmNvbnN0IE1BWF9MT0dTID0gMTAwMDtcbmNvbnN0IFNUT1JBR0VfS0VZID0gXCJzZXNzaW9uTG9nc1wiO1xuXG4vLyBTYWZlIGNvbnRleHQgY2hlY2tcbmNvbnN0IGlzU2VydmljZVdvcmtlciA9IHR5cGVvZiBzZWxmICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZW9mIChzZWxmIGFzIGFueSkuU2VydmljZVdvcmtlckdsb2JhbFNjb3BlICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZiBpbnN0YW5jZW9mIChzZWxmIGFzIGFueSkuU2VydmljZVdvcmtlckdsb2JhbFNjb3BlO1xubGV0IGlzU2F2aW5nID0gZmFsc2U7XG5sZXQgcGVuZGluZ1NhdmUgPSBmYWxzZTtcbmxldCBzYXZlVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG5cbmNvbnN0IGRvU2F2ZSA9ICgpID0+IHtcbiAgICBpZiAoIWlzU2VydmljZVdvcmtlciB8fCAhY2hyb21lPy5zdG9yYWdlPy5zZXNzaW9uIHx8IGlzU2F2aW5nKSB7XG4gICAgICAgIHBlbmRpbmdTYXZlID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlzU2F2aW5nID0gdHJ1ZTtcbiAgICBwZW5kaW5nU2F2ZSA9IGZhbHNlO1xuXG4gICAgY2hyb21lLnN0b3JhZ2Uuc2Vzc2lvbi5zZXQoeyBbU1RPUkFHRV9LRVldOiBsb2dzIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBpc1NhdmluZyA9IGZhbHNlO1xuICAgICAgICBpZiAocGVuZGluZ1NhdmUpIHtcbiAgICAgICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgICAgIH1cbiAgICB9KS5jYXRjaChlcnIgPT4ge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHNhdmUgbG9nc1wiLCBlcnIpO1xuICAgICAgICBpc1NhdmluZyA9IGZhbHNlO1xuICAgIH0pO1xufTtcblxuY29uc3Qgc2F2ZUxvZ3NUb1N0b3JhZ2UgPSAoKSA9PiB7XG4gICAgaWYgKHNhdmVUaW1lcikgY2xlYXJUaW1lb3V0KHNhdmVUaW1lcik7XG4gICAgc2F2ZVRpbWVyID0gc2V0VGltZW91dChkb1NhdmUsIDEwMDApO1xufTtcblxubGV0IHJlc29sdmVMb2dnZXJSZWFkeTogKCkgPT4gdm9pZDtcbmV4cG9ydCBjb25zdCBsb2dnZXJSZWFkeSA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuICAgIHJlc29sdmVMb2dnZXJSZWFkeSA9IHJlc29sdmU7XG59KTtcblxuZXhwb3J0IGNvbnN0IGluaXRMb2dnZXIgPSBhc3luYyAoKSA9PiB7XG4gICAgaWYgKGlzU2VydmljZVdvcmtlciAmJiBjaHJvbWU/LnN0b3JhZ2U/LnNlc3Npb24pIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLnNlc3Npb24uZ2V0KFNUT1JBR0VfS0VZKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHRbU1RPUkFHRV9LRVldICYmIEFycmF5LmlzQXJyYXkocmVzdWx0W1NUT1JBR0VfS0VZXSkpIHtcbiAgICAgICAgICAgICAgICBsb2dzID0gcmVzdWx0W1NUT1JBR0VfS0VZXTtcbiAgICAgICAgICAgICAgICBpZiAobG9ncy5sZW5ndGggPiBNQVhfTE9HUykgbG9ncyA9IGxvZ3Muc2xpY2UoMCwgTUFYX0xPR1MpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHJlc3RvcmUgbG9nc1wiLCBlKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAocmVzb2x2ZUxvZ2dlclJlYWR5KSByZXNvbHZlTG9nZ2VyUmVhZHkoKTtcbn07XG5cbmV4cG9ydCBjb25zdCBzZXRMb2dnZXJQcmVmZXJlbmNlcyA9IChwcmVmczogUHJlZmVyZW5jZXMpID0+IHtcbiAgaWYgKHByZWZzLmxvZ0xldmVsKSB7XG4gICAgY3VycmVudExldmVsID0gcHJlZnMubG9nTGV2ZWw7XG4gIH0gZWxzZSBpZiAocHJlZnMuZGVidWcpIHtcbiAgICBjdXJyZW50TGV2ZWwgPSBcImRlYnVnXCI7XG4gIH0gZWxzZSB7XG4gICAgY3VycmVudExldmVsID0gXCJpbmZvXCI7XG4gIH1cbn07XG5cbmNvbnN0IHNob3VsZExvZyA9IChsZXZlbDogTG9nTGV2ZWwpOiBib29sZWFuID0+IHtcbiAgcmV0dXJuIExFVkVMX1BSSU9SSVRZW2xldmVsXSA+PSBMRVZFTF9QUklPUklUWVtjdXJyZW50TGV2ZWxdO1xufTtcblxuY29uc3QgZm9ybWF0TWVzc2FnZSA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICByZXR1cm4gY29udGV4dCA/IGAke21lc3NhZ2V9IDo6ICR7SlNPTi5zdHJpbmdpZnkoY29udGV4dCl9YCA6IG1lc3NhZ2U7XG59O1xuXG5jb25zdCBhZGRMb2cgPSAobGV2ZWw6IExvZ0xldmVsLCBtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBpZiAoc2hvdWxkTG9nKGxldmVsKSkge1xuICAgICAgY29uc3QgZW50cnk6IExvZ0VudHJ5ID0ge1xuICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgICAgICBsZXZlbCxcbiAgICAgICAgICBtZXNzYWdlLFxuICAgICAgICAgIGNvbnRleHRcbiAgICAgIH07XG5cbiAgICAgIGlmIChpc1NlcnZpY2VXb3JrZXIpIHtcbiAgICAgICAgICBsb2dzLnVuc2hpZnQoZW50cnkpO1xuICAgICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICAgIGxvZ3MucG9wKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEluIG90aGVyIGNvbnRleHRzLCBzZW5kIHRvIFNXXG4gICAgICAgICAgaWYgKGNocm9tZT8ucnVudGltZT8uc2VuZE1lc3NhZ2UpIHtcbiAgICAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2dFbnRyeScsIHBheWxvYWQ6IGVudHJ5IH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgLy8gSWdub3JlIGlmIG1lc3NhZ2UgZmFpbHMgKGUuZy4gY29udGV4dCBpbnZhbGlkYXRlZClcbiAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICB9XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBhZGRMb2dFbnRyeSA9IChlbnRyeTogTG9nRW50cnkpID0+IHtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSB7XG4gICAgICAgIGxvZ3MudW5zaGlmdChlbnRyeSk7XG4gICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICBsb2dzLnBvcCgpO1xuICAgICAgICB9XG4gICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGdldExvZ3MgPSAoKSA9PiBbLi4ubG9nc107XG5leHBvcnQgY29uc3QgY2xlYXJMb2dzID0gKCkgPT4ge1xuICAgIGxvZ3MubGVuZ3RoID0gMDtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSBzYXZlTG9nc1RvU3RvcmFnZSgpO1xufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0RlYnVnID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImRlYnVnXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiZGVidWdcIikpIHtcbiAgICBjb25zb2xlLmRlYnVnKGAke1BSRUZJWH0gW0RFQlVHXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dJbmZvID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImluZm9cIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJpbmZvXCIpKSB7XG4gICAgY29uc29sZS5pbmZvKGAke1BSRUZJWH0gW0lORk9dICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ1dhcm4gPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwid2FyblwiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcIndhcm5cIikpIHtcbiAgICBjb25zb2xlLndhcm4oYCR7UFJFRklYfSBbV0FSTl0gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nRXJyb3IgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiZXJyb3JcIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJlcnJvclwiKSkge1xuICAgIGNvbnNvbGUuZXJyb3IoYCR7UFJFRklYfSBbRVJST1JdICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0NyaXRpY2FsID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImNyaXRpY2FsXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiY3JpdGljYWxcIikpIHtcbiAgICAvLyBDcml0aWNhbCBsb2dzIHVzZSBlcnJvciBjb25zb2xlIGJ1dCB3aXRoIGRpc3RpbmN0IHByZWZpeCBhbmQgbWF5YmUgc3R5bGluZyBpZiBzdXBwb3J0ZWRcbiAgICBjb25zb2xlLmVycm9yKGAke1BSRUZJWH0gW0NSSVRJQ0FMXSBcdUQ4M0RcdURFQTggJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuIiwgIi8vIGxvZ2ljLnRzXG4vLyBQdXJlIGZ1bmN0aW9ucyBmb3IgZXh0cmFjdGlvbiBsb2dpY1xuXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplVXJsKHVybFN0cjogc3RyaW5nKTogc3RyaW5nIHtcbiAgdHJ5IHtcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHVybFN0cik7XG4gICAgY29uc3QgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh1cmwuc2VhcmNoKTtcbiAgICBjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICAgIHBhcmFtcy5mb3JFYWNoKChfLCBrZXkpID0+IGtleXMucHVzaChrZXkpKTtcbiAgICBjb25zdCBob3N0bmFtZSA9IHVybC5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgJycpO1xuXG4gICAgY29uc3QgVFJBQ0tJTkcgPSBbL151dG1fLywgL15mYmNsaWQkLywgL15nY2xpZCQvLCAvXl9nYSQvLCAvXnJlZiQvLCAvXnljbGlkJC8sIC9eX2hzL107XG4gICAgY29uc3QgaXNZb3V0dWJlID0gaG9zdG5hbWUuZW5kc1dpdGgoJ3lvdXR1YmUuY29tJykgfHwgaG9zdG5hbWUuZW5kc1dpdGgoJ3lvdXR1LmJlJyk7XG4gICAgY29uc3QgaXNHb29nbGUgPSBob3N0bmFtZS5lbmRzV2l0aCgnZ29vZ2xlLmNvbScpO1xuXG4gICAgY29uc3Qga2VlcDogc3RyaW5nW10gPSBbXTtcbiAgICBpZiAoaXNZb3V0dWJlKSBrZWVwLnB1c2goJ3YnLCAnbGlzdCcsICd0JywgJ2MnLCAnY2hhbm5lbCcsICdwbGF5bGlzdCcpO1xuICAgIGlmIChpc0dvb2dsZSkga2VlcC5wdXNoKCdxJywgJ2lkJywgJ3NvdXJjZWlkJyk7XG5cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgICBpZiAoVFJBQ0tJTkcuc29tZShyID0+IHIudGVzdChrZXkpKSkge1xuICAgICAgICAgcGFyYW1zLmRlbGV0ZShrZXkpO1xuICAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoKGlzWW91dHViZSB8fCBpc0dvb2dsZSkgJiYgIWtlZXAuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgICAgcGFyYW1zLmRlbGV0ZShrZXkpO1xuICAgICAgfVxuICAgIH1cbiAgICB1cmwuc2VhcmNoID0gcGFyYW1zLnRvU3RyaW5nKCk7XG4gICAgcmV0dXJuIHVybC50b1N0cmluZygpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIHVybFN0cjtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VZb3VUdWJlVXJsKHVybFN0cjogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgdXJsID0gbmV3IFVSTCh1cmxTdHIpO1xuICAgICAgICBjb25zdCB2ID0gdXJsLnNlYXJjaFBhcmFtcy5nZXQoJ3YnKTtcbiAgICAgICAgY29uc3QgaXNTaG9ydHMgPSB1cmwucGF0aG5hbWUuaW5jbHVkZXMoJy9zaG9ydHMvJyk7XG4gICAgICAgIGxldCB2aWRlb0lkID1cbiAgICAgICAgICB2IHx8XG4gICAgICAgICAgKGlzU2hvcnRzID8gdXJsLnBhdGhuYW1lLnNwbGl0KCcvc2hvcnRzLycpWzFdIDogbnVsbCkgfHxcbiAgICAgICAgICAodXJsLmhvc3RuYW1lID09PSAneW91dHUuYmUnID8gdXJsLnBhdGhuYW1lLnJlcGxhY2UoJy8nLCAnJykgOiBudWxsKTtcblxuICAgICAgICBjb25zdCBwbGF5bGlzdElkID0gdXJsLnNlYXJjaFBhcmFtcy5nZXQoJ2xpc3QnKTtcbiAgICAgICAgY29uc3QgcGxheWxpc3RJbmRleCA9IHBhcnNlSW50KHVybC5zZWFyY2hQYXJhbXMuZ2V0KCdpbmRleCcpIHx8ICcwJywgMTApO1xuXG4gICAgICAgIHJldHVybiB7IHZpZGVvSWQsIGlzU2hvcnRzLCBwbGF5bGlzdElkLCBwbGF5bGlzdEluZGV4IH07XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4geyB2aWRlb0lkOiBudWxsLCBpc1Nob3J0czogZmFsc2UsIHBsYXlsaXN0SWQ6IG51bGwsIHBsYXlsaXN0SW5kZXg6IG51bGwgfTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RBdXRob3IoZW50aXR5OiBhbnkpOiBzdHJpbmcgfCBudWxsIHtcbiAgICBpZiAoIWVudGl0eSB8fCAhZW50aXR5LmF1dGhvcikgcmV0dXJuIG51bGw7XG4gICAgaWYgKHR5cGVvZiBlbnRpdHkuYXV0aG9yID09PSAnc3RyaW5nJykgcmV0dXJuIGVudGl0eS5hdXRob3I7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZW50aXR5LmF1dGhvcikpIHJldHVybiBlbnRpdHkuYXV0aG9yWzBdPy5uYW1lIHx8IG51bGw7XG4gICAgaWYgKHR5cGVvZiBlbnRpdHkuYXV0aG9yID09PSAnb2JqZWN0JykgcmV0dXJuIGVudGl0eS5hdXRob3IubmFtZSB8fCBudWxsO1xuICAgIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBleHRyYWN0S2V5d29yZHMoZW50aXR5OiBhbnkpOiBzdHJpbmdbXSB7XG4gICAgaWYgKCFlbnRpdHkgfHwgIWVudGl0eS5rZXl3b3JkcykgcmV0dXJuIFtdO1xuICAgIGlmICh0eXBlb2YgZW50aXR5LmtleXdvcmRzID09PSAnc3RyaW5nJykge1xuICAgICAgICByZXR1cm4gZW50aXR5LmtleXdvcmRzLnNwbGl0KCcsJykubWFwKChzOiBzdHJpbmcpID0+IHMudHJpbSgpKTtcbiAgICB9XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZW50aXR5LmtleXdvcmRzKSkgcmV0dXJuIGVudGl0eS5rZXl3b3JkcztcbiAgICByZXR1cm4gW107XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RCcmVhZGNydW1icyhqc29uTGQ6IGFueVtdKTogc3RyaW5nW10ge1xuICAgIGNvbnN0IGJyZWFkY3J1bWJMZCA9IGpzb25MZC5maW5kKGkgPT4gaSAmJiBpWydAdHlwZSddID09PSAnQnJlYWRjcnVtYkxpc3QnKTtcbiAgICBpZiAoIWJyZWFkY3J1bWJMZCB8fCAhQXJyYXkuaXNBcnJheShicmVhZGNydW1iTGQuaXRlbUxpc3RFbGVtZW50KSkgcmV0dXJuIFtdO1xuXG4gICAgY29uc3QgbGlzdCA9IGJyZWFkY3J1bWJMZC5pdGVtTGlzdEVsZW1lbnQuc29ydCgoYTogYW55LCBiOiBhbnkpID0+IChhLnBvc2l0aW9uIHx8IDApIC0gKGIucG9zaXRpb24gfHwgMCkpO1xuICAgIGNvbnN0IGJyZWFkY3J1bWJzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGxpc3QuZm9yRWFjaCgoaXRlbTogYW55KSA9PiB7XG4gICAgICAgIGlmIChpdGVtLm5hbWUpIGJyZWFkY3J1bWJzLnB1c2goaXRlbS5uYW1lKTtcbiAgICAgICAgZWxzZSBpZiAoaXRlbS5pdGVtICYmIGl0ZW0uaXRlbS5uYW1lKSBicmVhZGNydW1icy5wdXNoKGl0ZW0uaXRlbS5uYW1lKTtcbiAgICB9KTtcbiAgICByZXR1cm4gYnJlYWRjcnVtYnM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0SnNvbkxkRmllbGRzKGpzb25MZDogYW55W10pIHtcbiAgICAvLyBGaW5kIG1haW4gZW50aXR5XG4gICAgLy8gQWRkZWQgc2FmZXR5IGNoZWNrOiBpICYmIGlbJ0B0eXBlJ11cbiAgICBjb25zdCBtYWluRW50aXR5ID0ganNvbkxkLmZpbmQoaSA9PiBpICYmIChpWydAdHlwZSddID09PSAnQXJ0aWNsZScgfHwgaVsnQHR5cGUnXSA9PT0gJ1ZpZGVvT2JqZWN0JyB8fCBpWydAdHlwZSddID09PSAnTmV3c0FydGljbGUnKSkgfHwganNvbkxkWzBdO1xuXG4gICAgbGV0IGF1dGhvcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgbGV0IHB1Ymxpc2hlZEF0OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgbW9kaWZpZWRBdDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgbGV0IHRhZ3M6IHN0cmluZ1tdID0gW107XG5cbiAgICBpZiAobWFpbkVudGl0eSkge1xuICAgICAgICBhdXRob3IgPSBleHRyYWN0QXV0aG9yKG1haW5FbnRpdHkpO1xuICAgICAgICBwdWJsaXNoZWRBdCA9IG1haW5FbnRpdHkuZGF0ZVB1Ymxpc2hlZCB8fCBudWxsO1xuICAgICAgICBtb2RpZmllZEF0ID0gbWFpbkVudGl0eS5kYXRlTW9kaWZpZWQgfHwgbnVsbDtcbiAgICAgICAgdGFncyA9IGV4dHJhY3RLZXl3b3JkcyhtYWluRW50aXR5KTtcbiAgICB9XG5cbiAgICBjb25zdCBicmVhZGNydW1icyA9IGV4dHJhY3RCcmVhZGNydW1icyhqc29uTGQpO1xuXG4gICAgcmV0dXJuIHsgYXV0aG9yLCBwdWJsaXNoZWRBdCwgbW9kaWZpZWRBdCwgdGFncywgYnJlYWRjcnVtYnMgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RZb3VUdWJlQ2hhbm5lbEZyb21IdG1sKGh0bWw6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuICAvLyAxLiBUcnkgSlNPTi1MRFxuICAvLyBMb29rIGZvciA8c2NyaXB0IHR5cGU9XCJhcHBsaWNhdGlvbi9sZCtqc29uXCI+Li4uPC9zY3JpcHQ+XG4gIC8vIFdlIG5lZWQgdG8gbG9vcCBiZWNhdXNlIHRoZXJlIG1pZ2h0IGJlIG11bHRpcGxlIHNjcmlwdHNcbiAgY29uc3Qgc2NyaXB0UmVnZXggPSAvPHNjcmlwdFxccyt0eXBlPVtcIiddYXBwbGljYXRpb25cXC9sZFxcK2pzb25bXCInXVtePl0qPihbXFxzXFxTXSo/KTxcXC9zY3JpcHQ+L2dpO1xuICBsZXQgbWF0Y2g7XG4gIHdoaWxlICgobWF0Y2ggPSBzY3JpcHRSZWdleC5leGVjKGh0bWwpKSAhPT0gbnVsbCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBqc29uID0gSlNPTi5wYXJzZShtYXRjaFsxXSk7XG4gICAgICAgICAgY29uc3QgYXJyYXkgPSBBcnJheS5pc0FycmF5KGpzb24pID8ganNvbiA6IFtqc29uXTtcbiAgICAgICAgICBjb25zdCBmaWVsZHMgPSBleHRyYWN0SnNvbkxkRmllbGRzKGFycmF5KTtcbiAgICAgICAgICBpZiAoZmllbGRzLmF1dGhvcikgcmV0dXJuIGZpZWxkcy5hdXRob3I7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgLy8gaWdub3JlIHBhcnNlIGVycm9yc1xuICAgICAgfVxuICB9XG5cbiAgLy8gMi4gVHJ5IDxsaW5rIGl0ZW1wcm9wPVwibmFtZVwiIGNvbnRlbnQ9XCIuLi5cIj4gKFlvdVR1YmUgb2Z0ZW4gcHV0cyBjaGFubmVsIG5hbWUgaGVyZSBpbiBzb21lIGNvbnRleHRzKVxuICAvLyBPciA8bWV0YSBpdGVtcHJvcD1cImNoYW5uZWxJZFwiIGNvbnRlbnQ9XCIuLi5cIj4gLT4gYnV0IHRoYXQncyBJRC5cbiAgLy8gPGxpbmsgaXRlbXByb3A9XCJuYW1lXCIgY29udGVudD1cIkNoYW5uZWwgTmFtZVwiPlxuICAvLyA8c3BhbiBpdGVtcHJvcD1cImF1dGhvclwiIGl0ZW1zY29wZSBpdGVtdHlwZT1cImh0dHA6Ly9zY2hlbWEub3JnL1BlcnNvblwiPjxsaW5rIGl0ZW1wcm9wPVwibmFtZVwiIGNvbnRlbnQ9XCJDaGFubmVsIE5hbWVcIj48L3NwYW4+XG4gIGNvbnN0IGxpbmtOYW1lUmVnZXggPSAvPGxpbmtcXHMraXRlbXByb3A9W1wiJ11uYW1lW1wiJ11cXHMrY29udGVudD1bXCInXShbXlwiJ10rKVtcIiddXFxzKlxcLz8+L2k7XG4gIGNvbnN0IGxpbmtNYXRjaCA9IGxpbmtOYW1lUmVnZXguZXhlYyhodG1sKTtcbiAgaWYgKGxpbmtNYXRjaCAmJiBsaW5rTWF0Y2hbMV0pIHJldHVybiBkZWNvZGVIdG1sRW50aXRpZXMobGlua01hdGNoWzFdKTtcblxuICAvLyAzLiBUcnkgbWV0YSBhdXRob3JcbiAgY29uc3QgbWV0YUF1dGhvclJlZ2V4ID0gLzxtZXRhXFxzK25hbWU9W1wiJ11hdXRob3JbXCInXVxccytjb250ZW50PVtcIiddKFteXCInXSspW1wiJ11cXHMqXFwvPz4vaTtcbiAgY29uc3QgbWV0YU1hdGNoID0gbWV0YUF1dGhvclJlZ2V4LmV4ZWMoaHRtbCk7XG4gIGlmIChtZXRhTWF0Y2ggJiYgbWV0YU1hdGNoWzFdKSB7XG4gICAgICAvLyBZb3VUdWJlIG1ldGEgYXV0aG9yIGlzIG9mdGVuIFwiQ2hhbm5lbCBOYW1lXCJcbiAgICAgIHJldHVybiBkZWNvZGVIdG1sRW50aXRpZXMobWV0YU1hdGNoWzFdKTtcbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdFlvdVR1YmVHZW5yZUZyb21IdG1sKGh0bWw6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuICAvLyAxLiBUcnkgPG1ldGEgaXRlbXByb3A9XCJnZW5yZVwiIGNvbnRlbnQ9XCIuLi5cIj5cbiAgY29uc3QgbWV0YUdlbnJlUmVnZXggPSAvPG1ldGFcXHMraXRlbXByb3A9W1wiJ11nZW5yZVtcIiddXFxzK2NvbnRlbnQ9W1wiJ10oW15cIiddKylbXCInXVxccypcXC8/Pi9pO1xuICBjb25zdCBtZXRhTWF0Y2ggPSBtZXRhR2VucmVSZWdleC5leGVjKGh0bWwpO1xuICBpZiAobWV0YU1hdGNoICYmIG1ldGFNYXRjaFsxXSkge1xuICAgICAgcmV0dXJuIGRlY29kZUh0bWxFbnRpdGllcyhtZXRhTWF0Y2hbMV0pO1xuICB9XG5cbiAgLy8gMi4gVHJ5IEpTT04gXCJjYXRlZ29yeVwiIGluIHNjcmlwdHNcbiAgLy8gXCJjYXRlZ29yeVwiOlwiR2FtaW5nXCJcbiAgY29uc3QgY2F0ZWdvcnlSZWdleCA9IC9cImNhdGVnb3J5XCJcXHMqOlxccypcIihbXlwiXSspXCIvO1xuICBjb25zdCBjYXRNYXRjaCA9IGNhdGVnb3J5UmVnZXguZXhlYyhodG1sKTtcbiAgaWYgKGNhdE1hdGNoICYmIGNhdE1hdGNoWzFdKSB7XG4gICAgICByZXR1cm4gZGVjb2RlSHRtbEVudGl0aWVzKGNhdE1hdGNoWzFdKTtcbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBkZWNvZGVIdG1sRW50aXRpZXModGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKCF0ZXh0KSByZXR1cm4gdGV4dDtcblxuICBjb25zdCBlbnRpdGllczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAnJmFtcDsnOiAnJicsXG4gICAgJyZsdDsnOiAnPCcsXG4gICAgJyZndDsnOiAnPicsXG4gICAgJyZxdW90Oyc6ICdcIicsXG4gICAgJyYjMzk7JzogXCInXCIsXG4gICAgJyZhcG9zOyc6IFwiJ1wiLFxuICAgICcmbmJzcDsnOiAnICdcbiAgfTtcblxuICByZXR1cm4gdGV4dC5yZXBsYWNlKC8mKFthLXowLTldK3wjWzAtOV17MSw2fXwjeFswLTlhLWZBLUZdezEsNn0pOy9pZywgKG1hdGNoKSA9PiB7XG4gICAgICBjb25zdCBsb3dlciA9IG1hdGNoLnRvTG93ZXJDYXNlKCk7XG4gICAgICBpZiAoZW50aXRpZXNbbG93ZXJdKSByZXR1cm4gZW50aXRpZXNbbG93ZXJdO1xuICAgICAgaWYgKGVudGl0aWVzW21hdGNoXSkgcmV0dXJuIGVudGl0aWVzW21hdGNoXTtcblxuICAgICAgaWYgKGxvd2VyLnN0YXJ0c1dpdGgoJyYjeCcpKSB7XG4gICAgICAgICAgdHJ5IHsgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUocGFyc2VJbnQobG93ZXIuc2xpY2UoMywgLTEpLCAxNikpOyB9IGNhdGNoIHsgcmV0dXJuIG1hdGNoOyB9XG4gICAgICB9XG4gICAgICBpZiAobG93ZXIuc3RhcnRzV2l0aCgnJiMnKSkge1xuICAgICAgICAgIHRyeSB7IHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnNlSW50KGxvd2VyLnNsaWNlKDIsIC0xKSwgMTApKTsgfSBjYXRjaCB7IHJldHVybiBtYXRjaDsgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG1hdGNoO1xuICB9KTtcbn1cbiIsICJcbmV4cG9ydCBjb25zdCBHRU5FUkFfUkVHSVNUUlk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIC8vIFNlYXJjaFxuICAnZ29vZ2xlLmNvbSc6ICdTZWFyY2gnLFxuICAnYmluZy5jb20nOiAnU2VhcmNoJyxcbiAgJ2R1Y2tkdWNrZ28uY29tJzogJ1NlYXJjaCcsXG4gICd5YWhvby5jb20nOiAnU2VhcmNoJyxcbiAgJ2JhaWR1LmNvbSc6ICdTZWFyY2gnLFxuICAneWFuZGV4LmNvbSc6ICdTZWFyY2gnLFxuICAna2FnaS5jb20nOiAnU2VhcmNoJyxcbiAgJ2Vjb3NpYS5vcmcnOiAnU2VhcmNoJyxcblxuICAvLyBTb2NpYWxcbiAgJ2ZhY2Vib29rLmNvbSc6ICdTb2NpYWwnLFxuICAndHdpdHRlci5jb20nOiAnU29jaWFsJyxcbiAgJ3guY29tJzogJ1NvY2lhbCcsXG4gICdpbnN0YWdyYW0uY29tJzogJ1NvY2lhbCcsXG4gICdsaW5rZWRpbi5jb20nOiAnU29jaWFsJyxcbiAgJ3JlZGRpdC5jb20nOiAnU29jaWFsJyxcbiAgJ3Rpa3Rvay5jb20nOiAnU29jaWFsJyxcbiAgJ3BpbnRlcmVzdC5jb20nOiAnU29jaWFsJyxcbiAgJ3NuYXBjaGF0LmNvbSc6ICdTb2NpYWwnLFxuICAndHVtYmxyLmNvbSc6ICdTb2NpYWwnLFxuICAndGhyZWFkcy5uZXQnOiAnU29jaWFsJyxcbiAgJ2JsdWVza3kuYXBwJzogJ1NvY2lhbCcsXG4gICdtYXN0b2Rvbi5zb2NpYWwnOiAnU29jaWFsJyxcblxuICAvLyBWaWRlb1xuICAneW91dHViZS5jb20nOiAnVmlkZW8nLFxuICAneW91dHUuYmUnOiAnVmlkZW8nLFxuICAndmltZW8uY29tJzogJ1ZpZGVvJyxcbiAgJ3R3aXRjaC50dic6ICdWaWRlbycsXG4gICduZXRmbGl4LmNvbSc6ICdWaWRlbycsXG4gICdodWx1LmNvbSc6ICdWaWRlbycsXG4gICdkaXNuZXlwbHVzLmNvbSc6ICdWaWRlbycsXG4gICdkYWlseW1vdGlvbi5jb20nOiAnVmlkZW8nLFxuICAncHJpbWV2aWRlby5jb20nOiAnVmlkZW8nLFxuICAnaGJvbWF4LmNvbSc6ICdWaWRlbycsXG4gICdtYXguY29tJzogJ1ZpZGVvJyxcbiAgJ3BlYWNvY2t0di5jb20nOiAnVmlkZW8nLFxuXG4gIC8vIERldmVsb3BtZW50XG4gICdnaXRodWIuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2dpdGxhYi5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnc3RhY2tvdmVyZmxvdy5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnbnBtanMuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ3B5cGkub3JnJzogJ0RldmVsb3BtZW50JyxcbiAgJ2RldmVsb3Blci5tb3ppbGxhLm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICd3M3NjaG9vbHMuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2dlZWtzZm9yZ2Vla3Mub3JnJzogJ0RldmVsb3BtZW50JyxcbiAgJ2ppcmEuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2F0bGFzc2lhbi5uZXQnOiAnRGV2ZWxvcG1lbnQnLCAvLyBvZnRlbiBqaXJhXG4gICdiaXRidWNrZXQub3JnJzogJ0RldmVsb3BtZW50JyxcbiAgJ2Rldi50byc6ICdEZXZlbG9wbWVudCcsXG4gICdoYXNobm9kZS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnbWVkaXVtLmNvbSc6ICdEZXZlbG9wbWVudCcsIC8vIEdlbmVyYWwgYnV0IG9mdGVuIGRldlxuICAndmVyY2VsLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICduZXRsaWZ5LmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdoZXJva3UuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2F3cy5hbWF6b24uY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2NvbnNvbGUuYXdzLmFtYXpvbi5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnY2xvdWQuZ29vZ2xlLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdhenVyZS5taWNyb3NvZnQuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ3BvcnRhbC5henVyZS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnZG9ja2VyLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdrdWJlcm5ldGVzLmlvJzogJ0RldmVsb3BtZW50JyxcblxuICAvLyBOZXdzXG4gICdjbm4uY29tJzogJ05ld3MnLFxuICAnYmJjLmNvbSc6ICdOZXdzJyxcbiAgJ255dGltZXMuY29tJzogJ05ld3MnLFxuICAnd2FzaGluZ3RvbnBvc3QuY29tJzogJ05ld3MnLFxuICAndGhlZ3VhcmRpYW4uY29tJzogJ05ld3MnLFxuICAnZm9yYmVzLmNvbSc6ICdOZXdzJyxcbiAgJ2Jsb29tYmVyZy5jb20nOiAnTmV3cycsXG4gICdyZXV0ZXJzLmNvbSc6ICdOZXdzJyxcbiAgJ3dzai5jb20nOiAnTmV3cycsXG4gICdjbmJjLmNvbSc6ICdOZXdzJyxcbiAgJ2h1ZmZwb3N0LmNvbSc6ICdOZXdzJyxcbiAgJ25ld3MuZ29vZ2xlLmNvbSc6ICdOZXdzJyxcbiAgJ2ZveG5ld3MuY29tJzogJ05ld3MnLFxuICAnbmJjbmV3cy5jb20nOiAnTmV3cycsXG4gICdhYmNuZXdzLmdvLmNvbSc6ICdOZXdzJyxcbiAgJ3VzYXRvZGF5LmNvbSc6ICdOZXdzJyxcblxuICAvLyBTaG9wcGluZ1xuICAnYW1hem9uLmNvbSc6ICdTaG9wcGluZycsXG4gICdlYmF5LmNvbSc6ICdTaG9wcGluZycsXG4gICd3YWxtYXJ0LmNvbSc6ICdTaG9wcGluZycsXG4gICdldHN5LmNvbSc6ICdTaG9wcGluZycsXG4gICd0YXJnZXQuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2Jlc3RidXkuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2FsaWV4cHJlc3MuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3Nob3BpZnkuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3RlbXUuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3NoZWluLmNvbSc6ICdTaG9wcGluZycsXG4gICd3YXlmYWlyLmNvbSc6ICdTaG9wcGluZycsXG4gICdjb3N0Y28uY29tJzogJ1Nob3BwaW5nJyxcblxuICAvLyBDb21tdW5pY2F0aW9uXG4gICdtYWlsLmdvb2dsZS5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICdvdXRsb29rLmxpdmUuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnc2xhY2suY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnZGlzY29yZC5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICd6b29tLnVzJzogJ0NvbW11bmljYXRpb24nLFxuICAndGVhbXMubWljcm9zb2Z0LmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3doYXRzYXBwLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3RlbGVncmFtLm9yZyc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ21lc3Nlbmdlci5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICdza3lwZS5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG5cbiAgLy8gRmluYW5jZVxuICAncGF5cGFsLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2NoYXNlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2JhbmtvZmFtZXJpY2EuY29tJzogJ0ZpbmFuY2UnLFxuICAnd2VsbHNmYXJnby5jb20nOiAnRmluYW5jZScsXG4gICdhbWVyaWNhbmV4cHJlc3MuY29tJzogJ0ZpbmFuY2UnLFxuICAnc3RyaXBlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2NvaW5iYXNlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2JpbmFuY2UuY29tJzogJ0ZpbmFuY2UnLFxuICAna3Jha2VuLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3JvYmluaG9vZC5jb20nOiAnRmluYW5jZScsXG4gICdmaWRlbGl0eS5jb20nOiAnRmluYW5jZScsXG4gICd2YW5ndWFyZC5jb20nOiAnRmluYW5jZScsXG4gICdzY2h3YWIuY29tJzogJ0ZpbmFuY2UnLFxuICAnbWludC5pbnR1aXQuY29tJzogJ0ZpbmFuY2UnLFxuXG4gIC8vIEVkdWNhdGlvblxuICAnd2lraXBlZGlhLm9yZyc6ICdFZHVjYXRpb24nLFxuICAnY291cnNlcmEub3JnJzogJ0VkdWNhdGlvbicsXG4gICd1ZGVteS5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2VkeC5vcmcnOiAnRWR1Y2F0aW9uJyxcbiAgJ2toYW5hY2FkZW15Lm9yZyc6ICdFZHVjYXRpb24nLFxuICAncXVpemxldC5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2R1b2xpbmdvLmNvbSc6ICdFZHVjYXRpb24nLFxuICAnY2FudmFzLmluc3RydWN0dXJlLmNvbSc6ICdFZHVjYXRpb24nLFxuICAnYmxhY2tib2FyZC5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ21pdC5lZHUnOiAnRWR1Y2F0aW9uJyxcbiAgJ2hhcnZhcmQuZWR1JzogJ0VkdWNhdGlvbicsXG4gICdzdGFuZm9yZC5lZHUnOiAnRWR1Y2F0aW9uJyxcbiAgJ2FjYWRlbWlhLmVkdSc6ICdFZHVjYXRpb24nLFxuICAncmVzZWFyY2hnYXRlLm5ldCc6ICdFZHVjYXRpb24nLFxuXG4gIC8vIERlc2lnblxuICAnZmlnbWEuY29tJzogJ0Rlc2lnbicsXG4gICdjYW52YS5jb20nOiAnRGVzaWduJyxcbiAgJ2JlaGFuY2UubmV0JzogJ0Rlc2lnbicsXG4gICdkcmliYmJsZS5jb20nOiAnRGVzaWduJyxcbiAgJ2Fkb2JlLmNvbSc6ICdEZXNpZ24nLFxuICAndW5zcGxhc2guY29tJzogJ0Rlc2lnbicsXG4gICdwZXhlbHMuY29tJzogJ0Rlc2lnbicsXG4gICdwaXhhYmF5LmNvbSc6ICdEZXNpZ24nLFxuICAnc2h1dHRlcnN0b2NrLmNvbSc6ICdEZXNpZ24nLFxuXG4gIC8vIFByb2R1Y3Rpdml0eVxuICAnZG9jcy5nb29nbGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdzaGVldHMuZ29vZ2xlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnc2xpZGVzLmdvb2dsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2RyaXZlLmdvb2dsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ25vdGlvbi5zbyc6ICdQcm9kdWN0aXZpdHknLFxuICAndHJlbGxvLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnYXNhbmEuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdtb25kYXkuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdhaXJ0YWJsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2V2ZXJub3RlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnZHJvcGJveC5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2NsaWNrdXAuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdsaW5lYXIuYXBwJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdtaXJvLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnbHVjaWRjaGFydC5jb20nOiAnUHJvZHVjdGl2aXR5JyxcblxuICAvLyBBSVxuICAnb3BlbmFpLmNvbSc6ICdBSScsXG4gICdjaGF0Z3B0LmNvbSc6ICdBSScsXG4gICdhbnRocm9waWMuY29tJzogJ0FJJyxcbiAgJ21pZGpvdXJuZXkuY29tJzogJ0FJJyxcbiAgJ2h1Z2dpbmdmYWNlLmNvJzogJ0FJJyxcbiAgJ2JhcmQuZ29vZ2xlLmNvbSc6ICdBSScsXG4gICdnZW1pbmkuZ29vZ2xlLmNvbSc6ICdBSScsXG4gICdjbGF1ZGUuYWknOiAnQUknLFxuICAncGVycGxleGl0eS5haSc6ICdBSScsXG4gICdwb2UuY29tJzogJ0FJJyxcblxuICAvLyBNdXNpYy9BdWRpb1xuICAnc3BvdGlmeS5jb20nOiAnTXVzaWMnLFxuICAnc291bmRjbG91ZC5jb20nOiAnTXVzaWMnLFxuICAnbXVzaWMuYXBwbGUuY29tJzogJ011c2ljJyxcbiAgJ3BhbmRvcmEuY29tJzogJ011c2ljJyxcbiAgJ3RpZGFsLmNvbSc6ICdNdXNpYycsXG4gICdiYW5kY2FtcC5jb20nOiAnTXVzaWMnLFxuICAnYXVkaWJsZS5jb20nOiAnTXVzaWMnLFxuXG4gIC8vIEdhbWluZ1xuICAnc3RlYW1wb3dlcmVkLmNvbSc6ICdHYW1pbmcnLFxuICAncm9ibG94LmNvbSc6ICdHYW1pbmcnLFxuICAnZXBpY2dhbWVzLmNvbSc6ICdHYW1pbmcnLFxuICAneGJveC5jb20nOiAnR2FtaW5nJyxcbiAgJ3BsYXlzdGF0aW9uLmNvbSc6ICdHYW1pbmcnLFxuICAnbmludGVuZG8uY29tJzogJ0dhbWluZycsXG4gICdpZ24uY29tJzogJ0dhbWluZycsXG4gICdnYW1lc3BvdC5jb20nOiAnR2FtaW5nJyxcbiAgJ2tvdGFrdS5jb20nOiAnR2FtaW5nJyxcbiAgJ3BvbHlnb24uY29tJzogJ0dhbWluZydcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRHZW5lcmEoaG9zdG5hbWU6IHN0cmluZywgY3VzdG9tUmVnaXN0cnk/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogc3RyaW5nIHwgbnVsbCB7XG4gIGlmICghaG9zdG5hbWUpIHJldHVybiBudWxsO1xuXG4gIC8vIDAuIENoZWNrIGN1c3RvbSByZWdpc3RyeSBmaXJzdFxuICBpZiAoY3VzdG9tUmVnaXN0cnkpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gaG9zdG5hbWUuc3BsaXQoJy4nKTtcbiAgICAgIC8vIENoZWNrIGZ1bGwgaG9zdG5hbWUgYW5kIHByb2dyZXNzaXZlbHkgc2hvcnRlciBzdWZmaXhlc1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXJ0cy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgICBjb25zdCBkb21haW4gPSBwYXJ0cy5zbGljZShpKS5qb2luKCcuJyk7XG4gICAgICAgICAgaWYgKGN1c3RvbVJlZ2lzdHJ5W2RvbWFpbl0pIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGN1c3RvbVJlZ2lzdHJ5W2RvbWFpbl07XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9XG5cbiAgLy8gMS4gRXhhY3QgbWF0Y2hcbiAgaWYgKEdFTkVSQV9SRUdJU1RSWVtob3N0bmFtZV0pIHtcbiAgICByZXR1cm4gR0VORVJBX1JFR0lTVFJZW2hvc3RuYW1lXTtcbiAgfVxuXG4gIC8vIDIuIFN1YmRvbWFpbiBjaGVjayAoc3RyaXBwaW5nIHN1YmRvbWFpbnMpXG4gIC8vIGUuZy4gXCJjb25zb2xlLmF3cy5hbWF6b24uY29tXCIgLT4gXCJhd3MuYW1hem9uLmNvbVwiIC0+IFwiYW1hem9uLmNvbVwiXG4gIGNvbnN0IHBhcnRzID0gaG9zdG5hbWUuc3BsaXQoJy4nKTtcblxuICAvLyBUcnkgbWF0Y2hpbmcgcHJvZ3Jlc3NpdmVseSBzaG9ydGVyIHN1ZmZpeGVzXG4gIC8vIGUuZy4gYS5iLmMuY29tIC0+IGIuYy5jb20gLT4gYy5jb21cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXJ0cy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgIGNvbnN0IGRvbWFpbiA9IHBhcnRzLnNsaWNlKGkpLmpvaW4oJy4nKTtcbiAgICAgIGlmIChHRU5FUkFfUkVHSVNUUllbZG9tYWluXSkge1xuICAgICAgICAgIHJldHVybiBHRU5FUkFfUkVHSVNUUllbZG9tYWluXTtcbiAgICAgIH1cbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuIiwgImV4cG9ydCBjb25zdCBnZXRTdG9yZWRWYWx1ZSA9IGFzeW5jIDxUPihrZXk6IHN0cmluZyk6IFByb21pc2U8VCB8IG51bGw+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KGtleSwgKGl0ZW1zKSA9PiB7XG4gICAgICByZXNvbHZlKChpdGVtc1trZXldIGFzIFQpID8/IG51bGwpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBzZXRTdG9yZWRWYWx1ZSA9IGFzeW5jIDxUPihrZXk6IHN0cmluZywgdmFsdWU6IFQpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgW2tleV06IHZhbHVlIH0sICgpID0+IHJlc29sdmUoKSk7XG4gIH0pO1xufTtcbiIsICJpbXBvcnQgeyBQcmVmZXJlbmNlcywgU29ydGluZ1N0cmF0ZWd5LCBUYWJNZXRhZGF0YSB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCBtYXBDaHJvbWVUYWIgPSAodGFiOiBjaHJvbWUudGFicy5UYWIpOiBUYWJNZXRhZGF0YSB8IG51bGwgPT4ge1xuICBpZiAoIXRhYi5pZCB8fCB0YWIuaWQgPT09IGNocm9tZS50YWJzLlRBQl9JRF9OT05FIHx8ICF0YWIud2luZG93SWQpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIGlkOiB0YWIuaWQsXG4gICAgd2luZG93SWQ6IHRhYi53aW5kb3dJZCxcbiAgICB0aXRsZTogdGFiLnRpdGxlIHx8IFwiVW50aXRsZWRcIixcbiAgICB1cmw6IHRhYi51cmwgfHwgXCJhYm91dDpibGFua1wiLFxuICAgIHBpbm5lZDogQm9vbGVhbih0YWIucGlubmVkKSxcbiAgICBsYXN0QWNjZXNzZWQ6IHRhYi5sYXN0QWNjZXNzZWQsXG4gICAgb3BlbmVyVGFiSWQ6IHRhYi5vcGVuZXJUYWJJZCA/PyB1bmRlZmluZWQsXG4gICAgZmF2SWNvblVybDogdGFiLmZhdkljb25VcmwsXG4gICAgZ3JvdXBJZDogdGFiLmdyb3VwSWQsXG4gICAgaW5kZXg6IHRhYi5pbmRleCxcbiAgICBhY3RpdmU6IHRhYi5hY3RpdmUsXG4gICAgc3RhdHVzOiB0YWIuc3RhdHVzLFxuICAgIHNlbGVjdGVkOiB0YWIuaGlnaGxpZ2h0ZWRcbiAgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRTdG9yZWRQcmVmZXJlbmNlcyA9IGFzeW5jICgpOiBQcm9taXNlPFByZWZlcmVuY2VzIHwgbnVsbD4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXCJwcmVmZXJlbmNlc1wiLCAoaXRlbXMpID0+IHtcbiAgICAgIHJlc29sdmUoKGl0ZW1zW1wicHJlZmVyZW5jZXNcIl0gYXMgUHJlZmVyZW5jZXMpID8/IG51bGwpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBhc0FycmF5ID0gPFQ+KHZhbHVlOiB1bmtub3duKTogVFtdID0+IHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHJldHVybiB2YWx1ZSBhcyBUW107XG4gICAgcmV0dXJuIFtdO1xufTtcbiIsICJpbXBvcnQgeyBDdXN0b21TdHJhdGVneSwgUHJlZmVyZW5jZXMsIFNvcnRpbmdTdHJhdGVneSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFN0b3JlZFZhbHVlLCBzZXRTdG9yZWRWYWx1ZSB9IGZyb20gXCIuL3N0b3JhZ2UuanNcIjtcbmltcG9ydCB7IHNldExvZ2dlclByZWZlcmVuY2VzLCBsb2dEZWJ1ZyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5jb25zdCBQUkVGRVJFTkNFU19LRVkgPSBcInByZWZlcmVuY2VzXCI7XG5cbmV4cG9ydCBjb25zdCBkZWZhdWx0UHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzID0ge1xuICBzb3J0aW5nOiBbXCJwaW5uZWRcIiwgXCJyZWNlbmN5XCJdLFxuICBkZWJ1ZzogZmFsc2UsXG4gIGxvZ0xldmVsOiBcImluZm9cIixcbiAgdGhlbWU6IFwiZGFya1wiLFxuICBjdXN0b21HZW5lcmE6IHt9XG59O1xuXG5jb25zdCBub3JtYWxpemVTb3J0aW5nID0gKHNvcnRpbmc6IHVua25vd24pOiBTb3J0aW5nU3RyYXRlZ3lbXSA9PiB7XG4gIGlmIChBcnJheS5pc0FycmF5KHNvcnRpbmcpKSB7XG4gICAgcmV0dXJuIHNvcnRpbmcuZmlsdGVyKCh2YWx1ZSk6IHZhbHVlIGlzIFNvcnRpbmdTdHJhdGVneSA9PiB0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIpO1xuICB9XG4gIGlmICh0eXBlb2Ygc29ydGluZyA9PT0gXCJzdHJpbmdcIikge1xuICAgIHJldHVybiBbc29ydGluZ107XG4gIH1cbiAgcmV0dXJuIFsuLi5kZWZhdWx0UHJlZmVyZW5jZXMuc29ydGluZ107XG59O1xuXG5jb25zdCBub3JtYWxpemVTdHJhdGVnaWVzID0gKHN0cmF0ZWdpZXM6IHVua25vd24pOiBDdXN0b21TdHJhdGVneVtdID0+IHtcbiAgICBjb25zdCBhcnIgPSBhc0FycmF5PGFueT4oc3RyYXRlZ2llcykuZmlsdGVyKHMgPT4gdHlwZW9mIHMgPT09ICdvYmplY3QnICYmIHMgIT09IG51bGwpO1xuICAgIHJldHVybiBhcnIubWFwKHMgPT4gKHtcbiAgICAgICAgLi4ucyxcbiAgICAgICAgZ3JvdXBpbmdSdWxlczogYXNBcnJheShzLmdyb3VwaW5nUnVsZXMpLFxuICAgICAgICBzb3J0aW5nUnVsZXM6IGFzQXJyYXkocy5zb3J0aW5nUnVsZXMpLFxuICAgICAgICBncm91cFNvcnRpbmdSdWxlczogcy5ncm91cFNvcnRpbmdSdWxlcyA/IGFzQXJyYXkocy5ncm91cFNvcnRpbmdSdWxlcykgOiB1bmRlZmluZWQsXG4gICAgICAgIGZpbHRlcnM6IHMuZmlsdGVycyA/IGFzQXJyYXkocy5maWx0ZXJzKSA6IHVuZGVmaW5lZCxcbiAgICAgICAgZmlsdGVyR3JvdXBzOiBzLmZpbHRlckdyb3VwcyA/IGFzQXJyYXkocy5maWx0ZXJHcm91cHMpLm1hcCgoZzogYW55KSA9PiBhc0FycmF5KGcpKSA6IHVuZGVmaW5lZCxcbiAgICAgICAgcnVsZXM6IHMucnVsZXMgPyBhc0FycmF5KHMucnVsZXMpIDogdW5kZWZpbmVkXG4gICAgfSkpO1xufTtcblxuY29uc3Qgbm9ybWFsaXplUHJlZmVyZW5jZXMgPSAocHJlZnM/OiBQYXJ0aWFsPFByZWZlcmVuY2VzPiB8IG51bGwpOiBQcmVmZXJlbmNlcyA9PiB7XG4gIGNvbnN0IG1lcmdlZCA9IHsgLi4uZGVmYXVsdFByZWZlcmVuY2VzLCAuLi4ocHJlZnMgPz8ge30pIH07XG4gIHJldHVybiB7XG4gICAgLi4ubWVyZ2VkLFxuICAgIHNvcnRpbmc6IG5vcm1hbGl6ZVNvcnRpbmcobWVyZ2VkLnNvcnRpbmcpLFxuICAgIGN1c3RvbVN0cmF0ZWdpZXM6IG5vcm1hbGl6ZVN0cmF0ZWdpZXMobWVyZ2VkLmN1c3RvbVN0cmF0ZWdpZXMpXG4gIH07XG59O1xuXG5leHBvcnQgY29uc3QgbG9hZFByZWZlcmVuY2VzID0gYXN5bmMgKCk6IFByb21pc2U8UHJlZmVyZW5jZXM+ID0+IHtcbiAgY29uc3Qgc3RvcmVkID0gYXdhaXQgZ2V0U3RvcmVkVmFsdWU8UHJlZmVyZW5jZXM+KFBSRUZFUkVOQ0VTX0tFWSk7XG4gIGNvbnN0IG1lcmdlZCA9IG5vcm1hbGl6ZVByZWZlcmVuY2VzKHN0b3JlZCA/PyB1bmRlZmluZWQpO1xuICBzZXRMb2dnZXJQcmVmZXJlbmNlcyhtZXJnZWQpO1xuICByZXR1cm4gbWVyZ2VkO1xufTtcblxuZXhwb3J0IGNvbnN0IHNhdmVQcmVmZXJlbmNlcyA9IGFzeW5jIChwcmVmczogUGFydGlhbDxQcmVmZXJlbmNlcz4pOiBQcm9taXNlPFByZWZlcmVuY2VzPiA9PiB7XG4gIGxvZ0RlYnVnKFwiVXBkYXRpbmcgcHJlZmVyZW5jZXNcIiwgeyBrZXlzOiBPYmplY3Qua2V5cyhwcmVmcykgfSk7XG4gIGNvbnN0IGN1cnJlbnQgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgY29uc3QgbWVyZ2VkID0gbm9ybWFsaXplUHJlZmVyZW5jZXMoeyAuLi5jdXJyZW50LCAuLi5wcmVmcyB9KTtcbiAgYXdhaXQgc2V0U3RvcmVkVmFsdWUoUFJFRkVSRU5DRVNfS0VZLCBtZXJnZWQpO1xuICBzZXRMb2dnZXJQcmVmZXJlbmNlcyhtZXJnZWQpO1xuICByZXR1cm4gbWVyZ2VkO1xufTtcbiIsICJpbXBvcnQgeyBQYWdlQ29udGV4dCwgVGFiTWV0YWRhdGEgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBub3JtYWxpemVVcmwsIHBhcnNlWW91VHViZVVybCwgZXh0cmFjdFlvdVR1YmVDaGFubmVsRnJvbUh0bWwsIGV4dHJhY3RZb3VUdWJlR2VucmVGcm9tSHRtbCB9IGZyb20gXCIuL2xvZ2ljLmpzXCI7XG5pbXBvcnQgeyBnZXRHZW5lcmEgfSBmcm9tIFwiLi9nZW5lcmFSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgbG9hZFByZWZlcmVuY2VzIH0gZnJvbSBcIi4uL3ByZWZlcmVuY2VzLmpzXCI7XG5cbmludGVyZmFjZSBFeHRyYWN0aW9uUmVzcG9uc2Uge1xuICBkYXRhOiBQYWdlQ29udGV4dCB8IG51bGw7XG4gIGVycm9yPzogc3RyaW5nO1xuICBzdGF0dXM6XG4gICAgfCAnT0snXG4gICAgfCAnUkVTVFJJQ1RFRCdcbiAgICB8ICdJTkpFQ1RJT05fRkFJTEVEJ1xuICAgIHwgJ05PX1JFU1BPTlNFJ1xuICAgIHwgJ05PX0hPU1RfUEVSTUlTU0lPTidcbiAgICB8ICdGUkFNRV9BQ0NFU1NfREVOSUVEJztcbn1cblxuLy8gU2ltcGxlIGNvbmN1cnJlbmN5IGNvbnRyb2xcbmxldCBhY3RpdmVGZXRjaGVzID0gMDtcbmNvbnN0IE1BWF9DT05DVVJSRU5UX0ZFVENIRVMgPSA1OyAvLyBDb25zZXJ2YXRpdmUgbGltaXQgdG8gYXZvaWQgcmF0ZSBsaW1pdGluZ1xuY29uc3QgRkVUQ0hfUVVFVUU6ICgoKSA9PiB2b2lkKVtdID0gW107XG5cbmNvbnN0IGZldGNoV2l0aFRpbWVvdXQgPSBhc3luYyAodXJsOiBzdHJpbmcsIHRpbWVvdXQgPSAyMDAwKTogUHJvbWlzZTxSZXNwb25zZT4gPT4ge1xuICAgIGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG4gICAgY29uc3QgaWQgPSBzZXRUaW1lb3V0KCgpID0+IGNvbnRyb2xsZXIuYWJvcnQoKSwgdGltZW91dCk7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwsIHsgc2lnbmFsOiBjb250cm9sbGVyLnNpZ25hbCB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgIH0gZmluYWxseSB7XG4gICAgICAgIGNsZWFyVGltZW91dChpZCk7XG4gICAgfVxufTtcblxuY29uc3QgZW5xdWV1ZUZldGNoID0gYXN5bmMgPFQ+KGZuOiAoKSA9PiBQcm9taXNlPFQ+KTogUHJvbWlzZTxUPiA9PiB7XG4gICAgaWYgKGFjdGl2ZUZldGNoZXMgPj0gTUFYX0NPTkNVUlJFTlRfRkVUQ0hFUykge1xuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IEZFVENIX1FVRVVFLnB1c2gocmVzb2x2ZSkpO1xuICAgIH1cbiAgICBhY3RpdmVGZXRjaGVzKys7XG4gICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGF3YWl0IGZuKCk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgICAgYWN0aXZlRmV0Y2hlcy0tO1xuICAgICAgICBpZiAoRkVUQ0hfUVVFVUUubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc3QgbmV4dCA9IEZFVENIX1FVRVVFLnNoaWZ0KCk7XG4gICAgICAgICAgICBpZiAobmV4dCkgbmV4dCgpO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGV4dHJhY3RQYWdlQ29udGV4dCA9IGFzeW5jICh0YWI6IFRhYk1ldGFkYXRhIHwgY2hyb21lLnRhYnMuVGFiKTogUHJvbWlzZTxFeHRyYWN0aW9uUmVzcG9uc2U+ID0+IHtcbiAgdHJ5IHtcbiAgICBpZiAoIXRhYiB8fCAhdGFiLnVybCkge1xuICAgICAgICByZXR1cm4geyBkYXRhOiBudWxsLCBlcnJvcjogXCJUYWIgbm90IGZvdW5kIG9yIG5vIFVSTFwiLCBzdGF0dXM6ICdOT19SRVNQT05TRScgfTtcbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2Nocm9tZTovLycpIHx8XG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2VkZ2U6Ly8nKSB8fFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdhYm91dDonKSB8fFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdjaHJvbWUtZXh0ZW5zaW9uOi8vJykgfHxcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnY2hyb21lLWVycm9yOi8vJylcbiAgICApIHtcbiAgICAgICAgcmV0dXJuIHsgZGF0YTogbnVsbCwgZXJyb3I6IFwiUmVzdHJpY3RlZCBVUkwgc2NoZW1lXCIsIHN0YXR1czogJ1JFU1RSSUNURUQnIH07XG4gICAgfVxuXG4gICAgY29uc3QgcHJlZnMgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgICBsZXQgYmFzZWxpbmUgPSBidWlsZEJhc2VsaW5lQ29udGV4dCh0YWIgYXMgY2hyb21lLnRhYnMuVGFiLCBwcmVmcy5jdXN0b21HZW5lcmEpO1xuXG4gICAgLy8gRmV0Y2ggYW5kIGVucmljaCBmb3IgWW91VHViZSBpZiBhdXRob3IgaXMgbWlzc2luZyBhbmQgaXQgaXMgYSB2aWRlb1xuICAgIGNvbnN0IHRhcmdldFVybCA9IHRhYi51cmw7XG4gICAgY29uc3QgdXJsT2JqID0gbmV3IFVSTCh0YXJnZXRVcmwpO1xuICAgIGNvbnN0IGhvc3RuYW1lID0gdXJsT2JqLmhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCAnJyk7XG4gICAgaWYgKChob3N0bmFtZS5lbmRzV2l0aCgneW91dHViZS5jb20nKSB8fCBob3N0bmFtZS5lbmRzV2l0aCgneW91dHUuYmUnKSkgJiYgKCFiYXNlbGluZS5hdXRob3JPckNyZWF0b3IgfHwgYmFzZWxpbmUuZ2VucmUgPT09ICdWaWRlbycpKSB7XG4gICAgICAgICB0cnkge1xuICAgICAgICAgICAgIC8vIFdlIHVzZSBhIHF1ZXVlIHRvIHByZXZlbnQgZmxvb2RpbmcgcmVxdWVzdHNcbiAgICAgICAgICAgICBhd2FpdCBlbnF1ZXVlRmV0Y2goYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoV2l0aFRpbWVvdXQodGFyZ2V0VXJsKTtcbiAgICAgICAgICAgICAgICAgaWYgKHJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICAgICAgICAgICBjb25zdCBodG1sID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2hhbm5lbCA9IGV4dHJhY3RZb3VUdWJlQ2hhbm5lbEZyb21IdG1sKGh0bWwpO1xuICAgICAgICAgICAgICAgICAgICAgaWYgKGNoYW5uZWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICBiYXNlbGluZS5hdXRob3JPckNyZWF0b3IgPSBjaGFubmVsO1xuICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgY29uc3QgZ2VucmUgPSBleHRyYWN0WW91VHViZUdlbnJlRnJvbUh0bWwoaHRtbCk7XG4gICAgICAgICAgICAgICAgICAgICBpZiAoZ2VucmUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICBiYXNlbGluZS5nZW5yZSA9IGdlbnJlO1xuICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfSk7XG4gICAgICAgICB9IGNhdGNoIChmZXRjaEVycikge1xuICAgICAgICAgICAgIGxvZ0RlYnVnKFwiRmFpbGVkIHRvIGZldGNoIFlvdVR1YmUgcGFnZSBjb250ZW50XCIsIHsgZXJyb3I6IFN0cmluZyhmZXRjaEVycikgfSk7XG4gICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGRhdGE6IGJhc2VsaW5lLFxuICAgICAgc3RhdHVzOiAnT0snXG4gICAgfTtcblxuICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICBsb2dEZWJ1ZyhgRXh0cmFjdGlvbiBmYWlsZWQgZm9yIHRhYiAke3RhYi5pZH1gLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIGRhdGE6IG51bGwsXG4gICAgICBlcnJvcjogU3RyaW5nKGUpLFxuICAgICAgc3RhdHVzOiAnSU5KRUNUSU9OX0ZBSUxFRCdcbiAgICB9O1xuICB9XG59O1xuXG5jb25zdCBidWlsZEJhc2VsaW5lQ29udGV4dCA9ICh0YWI6IGNocm9tZS50YWJzLlRhYiwgY3VzdG9tR2VuZXJhPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IFBhZ2VDb250ZXh0ID0+IHtcbiAgY29uc3QgdXJsID0gdGFiLnVybCB8fCBcIlwiO1xuICBsZXQgaG9zdG5hbWUgPSBcIlwiO1xuICB0cnkge1xuICAgIGhvc3RuYW1lID0gbmV3IFVSTCh1cmwpLmhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCAnJyk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBob3N0bmFtZSA9IFwiXCI7XG4gIH1cblxuICAvLyBEZXRlcm1pbmUgT2JqZWN0IFR5cGUgZmlyc3RcbiAgbGV0IG9iamVjdFR5cGU6IFBhZ2VDb250ZXh0WydvYmplY3RUeXBlJ10gPSAndW5rbm93bic7XG4gIGxldCBhdXRob3JPckNyZWF0b3I6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG4gIGlmICh1cmwuaW5jbHVkZXMoJy9sb2dpbicpIHx8IHVybC5pbmNsdWRlcygnL3NpZ25pbicpKSB7XG4gICAgICBvYmplY3RUeXBlID0gJ2xvZ2luJztcbiAgfSBlbHNlIGlmIChob3N0bmFtZS5pbmNsdWRlcygneW91dHViZS5jb20nKSB8fCBob3N0bmFtZS5pbmNsdWRlcygneW91dHUuYmUnKSkge1xuICAgICAgY29uc3QgeyB2aWRlb0lkIH0gPSBwYXJzZVlvdVR1YmVVcmwodXJsKTtcbiAgICAgIGlmICh2aWRlb0lkKSBvYmplY3RUeXBlID0gJ3ZpZGVvJztcblxuICAgICAgLy8gVHJ5IHRvIGd1ZXNzIGNoYW5uZWwgZnJvbSBVUkwgaWYgcG9zc2libGVcbiAgICAgIGlmICh1cmwuaW5jbHVkZXMoJy9AJykpIHtcbiAgICAgICAgICBjb25zdCBwYXJ0cyA9IHVybC5zcGxpdCgnL0AnKTtcbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICBjb25zdCBoYW5kbGUgPSBwYXJ0c1sxXS5zcGxpdCgnLycpWzBdO1xuICAgICAgICAgICAgICBhdXRob3JPckNyZWF0b3IgPSAnQCcgKyBoYW5kbGU7XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh1cmwuaW5jbHVkZXMoJy9jLycpKSB7XG4gICAgICAgICAgY29uc3QgcGFydHMgPSB1cmwuc3BsaXQoJy9jLycpO1xuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIGF1dGhvck9yQ3JlYXRvciA9IGRlY29kZVVSSUNvbXBvbmVudChwYXJ0c1sxXS5zcGxpdCgnLycpWzBdKTtcbiAgICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHVybC5pbmNsdWRlcygnL3VzZXIvJykpIHtcbiAgICAgICAgICBjb25zdCBwYXJ0cyA9IHVybC5zcGxpdCgnL3VzZXIvJyk7XG4gICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgYXV0aG9yT3JDcmVhdG9yID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhcnRzWzFdLnNwbGl0KCcvJylbMF0pO1xuICAgICAgICAgIH1cbiAgICAgIH1cbiAgfSBlbHNlIGlmIChob3N0bmFtZSA9PT0gJ2dpdGh1Yi5jb20nICYmIHVybC5pbmNsdWRlcygnL3B1bGwvJykpIHtcbiAgICAgIG9iamVjdFR5cGUgPSAndGlja2V0JztcbiAgfSBlbHNlIGlmIChob3N0bmFtZSA9PT0gJ2dpdGh1Yi5jb20nICYmICF1cmwuaW5jbHVkZXMoJy9wdWxsLycpICYmIHVybC5zcGxpdCgnLycpLmxlbmd0aCA+PSA1KSB7XG4gICAgICAvLyByb3VnaCBjaGVjayBmb3IgcmVwb1xuICAgICAgb2JqZWN0VHlwZSA9ICdyZXBvJztcbiAgfVxuXG4gIC8vIERldGVybWluZSBHZW5yZVxuICAvLyBQcmlvcml0eSAxOiBTaXRlLXNwZWNpZmljIGV4dHJhY3Rpb24gKGRlcml2ZWQgZnJvbSBvYmplY3RUeXBlKVxuICBsZXQgZ2VucmU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICBpZiAob2JqZWN0VHlwZSA9PT0gJ3ZpZGVvJykgZ2VucmUgPSAnVmlkZW8nO1xuICBlbHNlIGlmIChvYmplY3RUeXBlID09PSAncmVwbycgfHwgb2JqZWN0VHlwZSA9PT0gJ3RpY2tldCcpIGdlbnJlID0gJ0RldmVsb3BtZW50JztcblxuICAvLyBQcmlvcml0eSAyOiBGYWxsYmFjayB0byBSZWdpc3RyeVxuICBpZiAoIWdlbnJlKSB7XG4gICAgIGdlbnJlID0gZ2V0R2VuZXJhKGhvc3RuYW1lLCBjdXN0b21HZW5lcmEpIHx8IHVuZGVmaW5lZDtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY2Fub25pY2FsVXJsOiB1cmwgfHwgbnVsbCxcbiAgICBub3JtYWxpemVkVXJsOiBub3JtYWxpemVVcmwodXJsKSxcbiAgICBzaXRlTmFtZTogaG9zdG5hbWUgfHwgbnVsbCxcbiAgICBwbGF0Zm9ybTogaG9zdG5hbWUgfHwgbnVsbCxcbiAgICBvYmplY3RUeXBlLFxuICAgIG9iamVjdElkOiB1cmwgfHwgbnVsbCxcbiAgICB0aXRsZTogdGFiLnRpdGxlIHx8IG51bGwsXG4gICAgZ2VucmUsXG4gICAgZGVzY3JpcHRpb246IG51bGwsXG4gICAgYXV0aG9yT3JDcmVhdG9yOiBhdXRob3JPckNyZWF0b3IsXG4gICAgcHVibGlzaGVkQXQ6IG51bGwsXG4gICAgbW9kaWZpZWRBdDogbnVsbCxcbiAgICBsYW5ndWFnZTogbnVsbCxcbiAgICB0YWdzOiBbXSxcbiAgICBicmVhZGNydW1iczogW10sXG4gICAgaXNBdWRpYmxlOiBmYWxzZSxcbiAgICBpc011dGVkOiBmYWxzZSxcbiAgICBpc0NhcHR1cmluZzogZmFsc2UsXG4gICAgcHJvZ3Jlc3M6IG51bGwsXG4gICAgaGFzVW5zYXZlZENoYW5nZXNMaWtlbHk6IGZhbHNlLFxuICAgIGlzQXV0aGVudGljYXRlZExpa2VseTogZmFsc2UsXG4gICAgc291cmNlczoge1xuICAgICAgY2Fub25pY2FsVXJsOiAndXJsJyxcbiAgICAgIG5vcm1hbGl6ZWRVcmw6ICd1cmwnLFxuICAgICAgc2l0ZU5hbWU6ICd1cmwnLFxuICAgICAgcGxhdGZvcm06ICd1cmwnLFxuICAgICAgb2JqZWN0VHlwZTogJ3VybCcsXG4gICAgICB0aXRsZTogdGFiLnRpdGxlID8gJ3RhYicgOiAndXJsJyxcbiAgICAgIGdlbnJlOiAncmVnaXN0cnknXG4gICAgfSxcbiAgICBjb25maWRlbmNlOiB7fVxuICB9O1xufTtcbiIsICJpbXBvcnQgeyBUYWJNZXRhZGF0YSwgUGFnZUNvbnRleHQgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZywgbG9nRXJyb3IgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgZXh0cmFjdFBhZ2VDb250ZXh0IH0gZnJvbSBcIi4vZXh0cmFjdGlvbi9pbmRleC5qc1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIENvbnRleHRSZXN1bHQge1xuICBjb250ZXh0OiBzdHJpbmc7XG4gIHNvdXJjZTogJ0FJJyB8ICdIZXVyaXN0aWMnIHwgJ0V4dHJhY3Rpb24nO1xuICBkYXRhPzogUGFnZUNvbnRleHQ7XG4gIGVycm9yPzogc3RyaW5nO1xuICBzdGF0dXM/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBDYWNoZUVudHJ5IHtcbiAgcmVzdWx0OiBDb250ZXh0UmVzdWx0O1xuICB0aW1lc3RhbXA6IG51bWJlcjtcbn1cblxuY29uc3QgY29udGV4dENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIENhY2hlRW50cnk+KCk7XG5jb25zdCBDQUNIRV9UVExfU1VDQ0VTUyA9IDI0ICogNjAgKiA2MCAqIDEwMDA7IC8vIDI0IGhvdXJzXG5jb25zdCBDQUNIRV9UVExfRVJST1IgPSA1ICogNjAgKiAxMDAwOyAvLyA1IG1pbnV0ZXNcblxuZXhwb3J0IGNvbnN0IGFuYWx5emVUYWJDb250ZXh0ID0gYXN5bmMgKFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBvblByb2dyZXNzPzogKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB2b2lkXG4pOiBQcm9taXNlPE1hcDxudW1iZXIsIENvbnRleHRSZXN1bHQ+PiA9PiB7XG4gIGNvbnN0IGNvbnRleHRNYXAgPSBuZXcgTWFwPG51bWJlciwgQ29udGV4dFJlc3VsdD4oKTtcbiAgbGV0IGNvbXBsZXRlZCA9IDA7XG4gIGNvbnN0IHRvdGFsID0gdGFicy5sZW5ndGg7XG5cbiAgY29uc3QgcHJvbWlzZXMgPSB0YWJzLm1hcChhc3luYyAodGFiKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNhY2hlS2V5ID0gYCR7dGFiLmlkfTo6JHt0YWIudXJsfWA7XG4gICAgICBjb25zdCBjYWNoZWQgPSBjb250ZXh0Q2FjaGUuZ2V0KGNhY2hlS2V5KTtcblxuICAgICAgaWYgKGNhY2hlZCkge1xuICAgICAgICBjb25zdCBpc0Vycm9yID0gY2FjaGVkLnJlc3VsdC5zdGF0dXMgPT09ICdFUlJPUicgfHwgISFjYWNoZWQucmVzdWx0LmVycm9yO1xuICAgICAgICBjb25zdCB0dGwgPSBpc0Vycm9yID8gQ0FDSEVfVFRMX0VSUk9SIDogQ0FDSEVfVFRMX1NVQ0NFU1M7XG5cbiAgICAgICAgaWYgKERhdGUubm93KCkgLSBjYWNoZWQudGltZXN0YW1wIDwgdHRsKSB7XG4gICAgICAgICAgY29udGV4dE1hcC5zZXQodGFiLmlkLCBjYWNoZWQucmVzdWx0KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29udGV4dENhY2hlLmRlbGV0ZShjYWNoZUtleSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hDb250ZXh0Rm9yVGFiKHRhYik7XG5cbiAgICAgIC8vIENhY2hlIHdpdGggZXhwaXJhdGlvbiBsb2dpY1xuICAgICAgY29udGV4dENhY2hlLnNldChjYWNoZUtleSwge1xuICAgICAgICByZXN1bHQsXG4gICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKVxuICAgICAgfSk7XG5cbiAgICAgIGNvbnRleHRNYXAuc2V0KHRhYi5pZCwgcmVzdWx0KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nRXJyb3IoYEZhaWxlZCB0byBhbmFseXplIGNvbnRleHQgZm9yIHRhYiAke3RhYi5pZH1gLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgICAgLy8gRXZlbiBpZiBmZXRjaENvbnRleHRGb3JUYWIgZmFpbHMgY29tcGxldGVseSwgd2UgdHJ5IGEgc2FmZSBzeW5jIGZhbGxiYWNrXG4gICAgICBjb250ZXh0TWFwLnNldCh0YWIuaWQsIHsgY29udGV4dDogXCJVbmNhdGVnb3JpemVkXCIsIHNvdXJjZTogJ0hldXJpc3RpYycsIGVycm9yOiBTdHJpbmcoZXJyb3IpLCBzdGF0dXM6ICdFUlJPUicgfSk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGNvbXBsZXRlZCsrO1xuICAgICAgaWYgKG9uUHJvZ3Jlc3MpIG9uUHJvZ3Jlc3MoY29tcGxldGVkLCB0b3RhbCk7XG4gICAgfVxuICB9KTtcblxuICBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gIHJldHVybiBjb250ZXh0TWFwO1xufTtcblxuY29uc3QgZmV0Y2hDb250ZXh0Rm9yVGFiID0gYXN5bmMgKHRhYjogVGFiTWV0YWRhdGEpOiBQcm9taXNlPENvbnRleHRSZXN1bHQ+ID0+IHtcbiAgLy8gMS4gUnVuIEdlbmVyaWMgRXh0cmFjdGlvbiAoQWx3YXlzKVxuICBsZXQgZGF0YTogUGFnZUNvbnRleHQgfCBudWxsID0gbnVsbDtcbiAgbGV0IGVycm9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gIGxldCBzdGF0dXM6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICB0cnkge1xuICAgICAgY29uc3QgZXh0cmFjdGlvbiA9IGF3YWl0IGV4dHJhY3RQYWdlQ29udGV4dCh0YWIpO1xuICAgICAgZGF0YSA9IGV4dHJhY3Rpb24uZGF0YTtcbiAgICAgIGVycm9yID0gZXh0cmFjdGlvbi5lcnJvcjtcbiAgICAgIHN0YXR1cyA9IGV4dHJhY3Rpb24uc3RhdHVzO1xuICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dEZWJ1ZyhgRXh0cmFjdGlvbiBmYWlsZWQgZm9yIHRhYiAke3RhYi5pZH1gLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICBlcnJvciA9IFN0cmluZyhlKTtcbiAgICAgIHN0YXR1cyA9ICdFUlJPUic7XG4gIH1cblxuICBsZXQgY29udGV4dCA9IFwiVW5jYXRlZ29yaXplZFwiO1xuICBsZXQgc291cmNlOiBDb250ZXh0UmVzdWx0Wydzb3VyY2UnXSA9ICdIZXVyaXN0aWMnO1xuXG4gIC8vIDIuIFRyeSB0byBEZXRlcm1pbmUgQ2F0ZWdvcnkgZnJvbSBFeHRyYWN0aW9uIERhdGFcbiAgaWYgKGRhdGEpIHtcbiAgICAgIGlmIChkYXRhLnBsYXRmb3JtID09PSAnWW91VHViZScgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ05ldGZsaXgnIHx8IGRhdGEucGxhdGZvcm0gPT09ICdTcG90aWZ5JyB8fCBkYXRhLnBsYXRmb3JtID09PSAnVHdpdGNoJykge1xuICAgICAgICAgIGNvbnRleHQgPSBcIkVudGVydGFpbm1lbnRcIjtcbiAgICAgICAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gICAgICB9IGVsc2UgaWYgKGRhdGEucGxhdGZvcm0gPT09ICdHaXRIdWInIHx8IGRhdGEucGxhdGZvcm0gPT09ICdTdGFjayBPdmVyZmxvdycgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ0ppcmEnIHx8IGRhdGEucGxhdGZvcm0gPT09ICdHaXRMYWInKSB7XG4gICAgICAgICAgY29udGV4dCA9IFwiRGV2ZWxvcG1lbnRcIjtcbiAgICAgICAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gICAgICB9IGVsc2UgaWYgKGRhdGEucGxhdGZvcm0gPT09ICdHb29nbGUnICYmIChkYXRhLm5vcm1hbGl6ZWRVcmwuaW5jbHVkZXMoJ2RvY3MnKSB8fCBkYXRhLm5vcm1hbGl6ZWRVcmwuaW5jbHVkZXMoJ3NoZWV0cycpIHx8IGRhdGEubm9ybWFsaXplZFVybC5pbmNsdWRlcygnc2xpZGVzJykpKSB7XG4gICAgICAgICAgY29udGV4dCA9IFwiV29ya1wiO1xuICAgICAgICAgIHNvdXJjZSA9ICdFeHRyYWN0aW9uJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIElmIHdlIGhhdmUgc3VjY2Vzc2Z1bCBleHRyYWN0aW9uIGRhdGEgYnV0IG5vIHNwZWNpZmljIHJ1bGUgbWF0Y2hlZCxcbiAgICAgICAgLy8gdXNlIHRoZSBPYmplY3QgVHlwZSBvciBnZW5lcmljIFwiR2VuZXJhbCBXZWJcIiB0byBpbmRpY2F0ZSBleHRyYWN0aW9uIHdvcmtlZC5cbiAgICAgICAgLy8gV2UgcHJlZmVyIHNwZWNpZmljIGNhdGVnb3JpZXMsIGJ1dCBcIkFydGljbGVcIiBvciBcIlZpZGVvXCIgYXJlIGJldHRlciB0aGFuIFwiVW5jYXRlZ29yaXplZFwiLlxuICAgICAgICBpZiAoZGF0YS5vYmplY3RUeXBlICYmIGRhdGEub2JqZWN0VHlwZSAhPT0gJ3Vua25vd24nKSB7XG4gICAgICAgICAgICAgLy8gTWFwIG9iamVjdCB0eXBlcyB0byBjYXRlZ29yaWVzIGlmIHBvc3NpYmxlXG4gICAgICAgICAgICAgaWYgKGRhdGEub2JqZWN0VHlwZSA9PT0gJ3ZpZGVvJykgY29udGV4dCA9ICdFbnRlcnRhaW5tZW50JztcbiAgICAgICAgICAgICBlbHNlIGlmIChkYXRhLm9iamVjdFR5cGUgPT09ICdhcnRpY2xlJykgY29udGV4dCA9ICdOZXdzJzsgLy8gTG9vc2UgbWFwcGluZywgYnV0IGJldHRlciB0aGFuIG5vdGhpbmdcbiAgICAgICAgICAgICBlbHNlIGNvbnRleHQgPSBkYXRhLm9iamVjdFR5cGUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBkYXRhLm9iamVjdFR5cGUuc2xpY2UoMSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgY29udGV4dCA9IFwiR2VuZXJhbCBXZWJcIjtcbiAgICAgICAgfVxuICAgICAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gICAgICB9XG4gIH1cblxuICAvLyAzLiBGYWxsYmFjayB0byBMb2NhbCBIZXVyaXN0aWMgKFVSTCBSZWdleClcbiAgaWYgKGNvbnRleHQgPT09IFwiVW5jYXRlZ29yaXplZFwiKSB7XG4gICAgICBjb25zdCBoID0gYXdhaXQgbG9jYWxIZXVyaXN0aWModGFiKTtcbiAgICAgIGlmIChoLmNvbnRleHQgIT09IFwiVW5jYXRlZ29yaXplZFwiKSB7XG4gICAgICAgICAgY29udGV4dCA9IGguY29udGV4dDtcbiAgICAgICAgICAvLyBzb3VyY2UgcmVtYWlucyAnSGV1cmlzdGljJyAob3IgbWF5YmUgd2Ugc2hvdWxkIHNheSAnSGV1cmlzdGljJyBpcyB0aGUgc291cmNlPylcbiAgICAgICAgICAvLyBUaGUgbG9jYWxIZXVyaXN0aWMgZnVuY3Rpb24gcmV0dXJucyB7IHNvdXJjZTogJ0hldXJpc3RpYycgfVxuICAgICAgfVxuICB9XG5cbiAgLy8gNC4gRmFsbGJhY2sgdG8gQUkgKExMTSkgLSBSRU1PVkVEXG4gIC8vIFRoZSBIdWdnaW5nRmFjZSBBUEkgZW5kcG9pbnQgaXMgNDEwIEdvbmUgYW5kL29yIHJlcXVpcmVzIGF1dGhlbnRpY2F0aW9uIHdoaWNoIHdlIGRvIG5vdCBoYXZlLlxuICAvLyBUaGUgY29kZSBoYXMgYmVlbiByZW1vdmVkIHRvIHByZXZlbnQgZXJyb3JzLlxuXG4gIGlmIChjb250ZXh0ICE9PSBcIlVuY2F0ZWdvcml6ZWRcIiAmJiBzb3VyY2UgIT09IFwiRXh0cmFjdGlvblwiKSB7XG4gICAgZXJyb3IgPSB1bmRlZmluZWQ7XG4gICAgc3RhdHVzID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgcmV0dXJuIHsgY29udGV4dCwgc291cmNlLCBkYXRhOiBkYXRhIHx8IHVuZGVmaW5lZCwgZXJyb3IsIHN0YXR1cyB9O1xufTtcblxuY29uc3QgbG9jYWxIZXVyaXN0aWMgPSBhc3luYyAodGFiOiBUYWJNZXRhZGF0YSk6IFByb21pc2U8Q29udGV4dFJlc3VsdD4gPT4ge1xuICBjb25zdCB1cmwgPSB0YWIudXJsLnRvTG93ZXJDYXNlKCk7XG4gIGxldCBjb250ZXh0ID0gXCJVbmNhdGVnb3JpemVkXCI7XG5cbiAgaWYgKHVybC5pbmNsdWRlcyhcImdpdGh1YlwiKSB8fCB1cmwuaW5jbHVkZXMoXCJzdGFja292ZXJmbG93XCIpIHx8IHVybC5pbmNsdWRlcyhcImxvY2FsaG9zdFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJqaXJhXCIpIHx8IHVybC5pbmNsdWRlcyhcImdpdGxhYlwiKSkgY29udGV4dCA9IFwiRGV2ZWxvcG1lbnRcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwiZ29vZ2xlXCIpICYmICh1cmwuaW5jbHVkZXMoXCJkb2NzXCIpIHx8IHVybC5pbmNsdWRlcyhcInNoZWV0c1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJzbGlkZXNcIikpKSBjb250ZXh0ID0gXCJXb3JrXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImxpbmtlZGluXCIpIHx8IHVybC5pbmNsdWRlcyhcInNsYWNrXCIpIHx8IHVybC5pbmNsdWRlcyhcInpvb21cIikgfHwgdXJsLmluY2x1ZGVzKFwidGVhbXNcIikpIGNvbnRleHQgPSBcIldvcmtcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwibmV0ZmxpeFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJzcG90aWZ5XCIpIHx8IHVybC5pbmNsdWRlcyhcImh1bHVcIikgfHwgdXJsLmluY2x1ZGVzKFwiZGlzbmV5XCIpIHx8IHVybC5pbmNsdWRlcyhcInlvdXR1YmVcIikpIGNvbnRleHQgPSBcIkVudGVydGFpbm1lbnRcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwidHdpdHRlclwiKSB8fCB1cmwuaW5jbHVkZXMoXCJmYWNlYm9va1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJpbnN0YWdyYW1cIikgfHwgdXJsLmluY2x1ZGVzKFwicmVkZGl0XCIpIHx8IHVybC5pbmNsdWRlcyhcInRpa3Rva1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJwaW50ZXJlc3RcIikpIGNvbnRleHQgPSBcIlNvY2lhbFwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJhbWF6b25cIikgfHwgdXJsLmluY2x1ZGVzKFwiZWJheVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ3YWxtYXJ0XCIpIHx8IHVybC5pbmNsdWRlcyhcInRhcmdldFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJzaG9waWZ5XCIpKSBjb250ZXh0ID0gXCJTaG9wcGluZ1wiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJjbm5cIikgfHwgdXJsLmluY2x1ZGVzKFwiYmJjXCIpIHx8IHVybC5pbmNsdWRlcyhcIm55dGltZXNcIikgfHwgdXJsLmluY2x1ZGVzKFwid2FzaGluZ3RvbnBvc3RcIikgfHwgdXJsLmluY2x1ZGVzKFwiZm94bmV3c1wiKSkgY29udGV4dCA9IFwiTmV3c1wiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJjb3Vyc2VyYVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ1ZGVteVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJlZHhcIikgfHwgdXJsLmluY2x1ZGVzKFwia2hhbmFjYWRlbXlcIikgfHwgdXJsLmluY2x1ZGVzKFwiY2FudmFzXCIpKSBjb250ZXh0ID0gXCJFZHVjYXRpb25cIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwiZXhwZWRpYVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJib29raW5nXCIpIHx8IHVybC5pbmNsdWRlcyhcImFpcmJuYlwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ0cmlwYWR2aXNvclwiKSB8fCB1cmwuaW5jbHVkZXMoXCJrYXlha1wiKSkgY29udGV4dCA9IFwiVHJhdmVsXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcIndlYm1kXCIpIHx8IHVybC5pbmNsdWRlcyhcIm1heW9jbGluaWNcIikgfHwgdXJsLmluY2x1ZGVzKFwibmloLmdvdlwiKSB8fCB1cmwuaW5jbHVkZXMoXCJoZWFsdGhcIikpIGNvbnRleHQgPSBcIkhlYWx0aFwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJlc3BuXCIpIHx8IHVybC5pbmNsdWRlcyhcIm5iYVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJuZmxcIikgfHwgdXJsLmluY2x1ZGVzKFwibWxiXCIpIHx8IHVybC5pbmNsdWRlcyhcImZpZmFcIikpIGNvbnRleHQgPSBcIlNwb3J0c1wiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJ0ZWNoY3J1bmNoXCIpIHx8IHVybC5pbmNsdWRlcyhcIndpcmVkXCIpIHx8IHVybC5pbmNsdWRlcyhcInRoZXZlcmdlXCIpIHx8IHVybC5pbmNsdWRlcyhcImFyc3RlY2huaWNhXCIpKSBjb250ZXh0ID0gXCJUZWNobm9sb2d5XCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcInNjaWVuY2VcIikgfHwgdXJsLmluY2x1ZGVzKFwibmF0dXJlLmNvbVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJuYXNhLmdvdlwiKSkgY29udGV4dCA9IFwiU2NpZW5jZVwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJ0d2l0Y2hcIikgfHwgdXJsLmluY2x1ZGVzKFwic3RlYW1cIikgfHwgdXJsLmluY2x1ZGVzKFwicm9ibG94XCIpIHx8IHVybC5pbmNsdWRlcyhcImlnblwiKSB8fCB1cmwuaW5jbHVkZXMoXCJnYW1lc3BvdFwiKSkgY29udGV4dCA9IFwiR2FtaW5nXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcInNvdW5kY2xvdWRcIikgfHwgdXJsLmluY2x1ZGVzKFwiYmFuZGNhbXBcIikgfHwgdXJsLmluY2x1ZGVzKFwibGFzdC5mbVwiKSkgY29udGV4dCA9IFwiTXVzaWNcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwiZGV2aWFudGFydFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJiZWhhbmNlXCIpIHx8IHVybC5pbmNsdWRlcyhcImRyaWJiYmxlXCIpIHx8IHVybC5pbmNsdWRlcyhcImFydHN0YXRpb25cIikpIGNvbnRleHQgPSBcIkFydFwiO1xuXG4gIHJldHVybiB7IGNvbnRleHQsIHNvdXJjZTogJ0hldXJpc3RpYycgfTtcbn07XG4iLCAiaW1wb3J0IHsgQ3VzdG9tU3RyYXRlZ3ksIFNvcnRpbmdTdHJhdGVneSB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RyYXRlZ3lEZWZpbml0aW9uIHtcbiAgICBpZDogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nO1xuICAgIGxhYmVsOiBzdHJpbmc7XG4gICAgaXNHcm91cGluZzogYm9vbGVhbjtcbiAgICBpc1NvcnRpbmc6IGJvb2xlYW47XG4gICAgdGFncz86IHN0cmluZ1tdO1xuICAgIGF1dG9SdW4/OiBib29sZWFuO1xuICAgIGlzQ3VzdG9tPzogYm9vbGVhbjtcbn1cblxuLy8gUmVzdG9yZWQgc3RyYXRlZ2llcyBtYXRjaGluZyBiYWNrZ3JvdW5kIGNhcGFiaWxpdGllcy5cbmV4cG9ydCBjb25zdCBTVFJBVEVHSUVTOiBTdHJhdGVneURlZmluaXRpb25bXSA9IFtcbiAgICB7IGlkOiBcImRvbWFpblwiLCBsYWJlbDogXCJEb21haW5cIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImRvbWFpbl9mdWxsXCIsIGxhYmVsOiBcIkZ1bGwgRG9tYWluXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ0b3BpY1wiLCBsYWJlbDogXCJUb3BpY1wiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiY29udGV4dFwiLCBsYWJlbDogXCJDb250ZXh0XCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJsaW5lYWdlXCIsIGxhYmVsOiBcIkxpbmVhZ2VcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInBpbm5lZFwiLCBsYWJlbDogXCJQaW5uZWRcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInJlY2VuY3lcIiwgbGFiZWw6IFwiUmVjZW5jeVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiYWdlXCIsIGxhYmVsOiBcIkFnZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidXJsXCIsIGxhYmVsOiBcIlVSTFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwibmVzdGluZ1wiLCBsYWJlbDogXCJOZXN0aW5nXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ0aXRsZVwiLCBsYWJlbDogXCJUaXRsZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuXTtcblxuZXhwb3J0IGNvbnN0IGdldFN0cmF0ZWdpZXMgPSAoY3VzdG9tU3RyYXRlZ2llcz86IEN1c3RvbVN0cmF0ZWd5W10pOiBTdHJhdGVneURlZmluaXRpb25bXSA9PiB7XG4gICAgaWYgKCFjdXN0b21TdHJhdGVnaWVzIHx8IGN1c3RvbVN0cmF0ZWdpZXMubGVuZ3RoID09PSAwKSByZXR1cm4gU1RSQVRFR0lFUztcblxuICAgIC8vIEN1c3RvbSBzdHJhdGVnaWVzIGNhbiBvdmVycmlkZSBidWlsdC1pbnMgaWYgSURzIG1hdGNoLCBvciBhZGQgbmV3IG9uZXMuXG4gICAgY29uc3QgY29tYmluZWQgPSBbLi4uU1RSQVRFR0lFU107XG5cbiAgICBjdXN0b21TdHJhdGVnaWVzLmZvckVhY2goY3VzdG9tID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmdJbmRleCA9IGNvbWJpbmVkLmZpbmRJbmRleChzID0+IHMuaWQgPT09IGN1c3RvbS5pZCk7XG5cbiAgICAgICAgLy8gRGV0ZXJtaW5lIGNhcGFiaWxpdGllcyBiYXNlZCBvbiBydWxlcyBwcmVzZW5jZVxuICAgICAgICBjb25zdCBoYXNHcm91cGluZyA9IChjdXN0b20uZ3JvdXBpbmdSdWxlcyAmJiBjdXN0b20uZ3JvdXBpbmdSdWxlcy5sZW5ndGggPiAwKSB8fCAoY3VzdG9tLnJ1bGVzICYmIGN1c3RvbS5ydWxlcy5sZW5ndGggPiAwKSB8fCBmYWxzZTtcbiAgICAgICAgY29uc3QgaGFzU29ydGluZyA9IChjdXN0b20uc29ydGluZ1J1bGVzICYmIGN1c3RvbS5zb3J0aW5nUnVsZXMubGVuZ3RoID4gMCkgfHwgKGN1c3RvbS5ydWxlcyAmJiBjdXN0b20ucnVsZXMubGVuZ3RoID4gMCkgfHwgZmFsc2U7XG5cbiAgICAgICAgY29uc3QgdGFnczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgaWYgKGhhc0dyb3VwaW5nKSB0YWdzLnB1c2goXCJncm91cFwiKTtcbiAgICAgICAgaWYgKGhhc1NvcnRpbmcpIHRhZ3MucHVzaChcInNvcnRcIik7XG5cbiAgICAgICAgY29uc3QgZGVmaW5pdGlvbjogU3RyYXRlZ3lEZWZpbml0aW9uID0ge1xuICAgICAgICAgICAgaWQ6IGN1c3RvbS5pZCxcbiAgICAgICAgICAgIGxhYmVsOiBjdXN0b20ubGFiZWwsXG4gICAgICAgICAgICBpc0dyb3VwaW5nOiBoYXNHcm91cGluZyxcbiAgICAgICAgICAgIGlzU29ydGluZzogaGFzU29ydGluZyxcbiAgICAgICAgICAgIHRhZ3M6IHRhZ3MsXG4gICAgICAgICAgICBhdXRvUnVuOiBjdXN0b20uYXV0b1J1bixcbiAgICAgICAgICAgIGlzQ3VzdG9tOiB0cnVlXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKGV4aXN0aW5nSW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICBjb21iaW5lZFtleGlzdGluZ0luZGV4XSA9IGRlZmluaXRpb247XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb21iaW5lZC5wdXNoKGRlZmluaXRpb24pO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gY29tYmluZWQ7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0U3RyYXRlZ3kgPSAoaWQ6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZyk6IFN0cmF0ZWd5RGVmaW5pdGlvbiB8IHVuZGVmaW5lZCA9PiBTVFJBVEVHSUVTLmZpbmQocyA9PiBzLmlkID09PSBpZCk7XG4iLCAiaW1wb3J0IHsgR3JvdXBpbmdTdHJhdGVneSwgU29ydGluZ1N0cmF0ZWd5LCBUYWJHcm91cCwgVGFiTWV0YWRhdGEsIEN1c3RvbVN0cmF0ZWd5LCBTdHJhdGVneVJ1bGUsIFJ1bGVDb25kaXRpb24sIEdyb3VwaW5nUnVsZSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBnZXRTdHJhdGVnaWVzIH0gZnJvbSBcIi4uL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5sZXQgY3VzdG9tU3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSA9IFtdO1xuXG5leHBvcnQgY29uc3Qgc2V0Q3VzdG9tU3RyYXRlZ2llcyA9IChzdHJhdGVnaWVzOiBDdXN0b21TdHJhdGVneVtdKSA9PiB7XG4gICAgY3VzdG9tU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXM7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0Q3VzdG9tU3RyYXRlZ2llcyA9ICgpOiBDdXN0b21TdHJhdGVneVtdID0+IGN1c3RvbVN0cmF0ZWdpZXM7XG5cbmNvbnN0IENPTE9SUyA9IFtcImdyZXlcIiwgXCJibHVlXCIsIFwicmVkXCIsIFwieWVsbG93XCIsIFwiZ3JlZW5cIiwgXCJwaW5rXCIsIFwicHVycGxlXCIsIFwiY3lhblwiLCBcIm9yYW5nZVwiXTtcblxuY29uc3QgcmVnZXhDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBSZWdFeHA+KCk7XG5jb25zdCBkb21haW5DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5jb25zdCBzdWJkb21haW5DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5jb25zdCBNQVhfQ0FDSEVfU0laRSA9IDEwMDA7XG5cbmV4cG9ydCBjb25zdCBkb21haW5Gcm9tVXJsID0gKHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgaWYgKGRvbWFpbkNhY2hlLmhhcyh1cmwpKSByZXR1cm4gZG9tYWluQ2FjaGUuZ2V0KHVybCkhO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgIGNvbnN0IGRvbWFpbiA9IHBhcnNlZC5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG5cbiAgICBpZiAoZG9tYWluQ2FjaGUuc2l6ZSA+PSBNQVhfQ0FDSEVfU0laRSkgZG9tYWluQ2FjaGUuY2xlYXIoKTtcbiAgICBkb21haW5DYWNoZS5zZXQodXJsLCBkb21haW4pO1xuXG4gICAgcmV0dXJuIGRvbWFpbjtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBsb2dEZWJ1ZyhcIkZhaWxlZCB0byBwYXJzZSBkb21haW5cIiwgeyB1cmwsIGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgIHJldHVybiBcInVua25vd25cIjtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IHN1YmRvbWFpbkZyb21VcmwgPSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIGlmIChzdWJkb21haW5DYWNoZS5oYXModXJsKSkgcmV0dXJuIHN1YmRvbWFpbkNhY2hlLmdldCh1cmwpITtcblxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwodXJsKTtcbiAgICAgICAgbGV0IGhvc3RuYW1lID0gcGFyc2VkLmhvc3RuYW1lO1xuICAgICAgICAvLyBSZW1vdmUgd3d3LlxuICAgICAgICBob3N0bmFtZSA9IGhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCBcIlwiKTtcblxuICAgICAgICBsZXQgcmVzdWx0ID0gXCJcIjtcbiAgICAgICAgY29uc3QgcGFydHMgPSBob3N0bmFtZS5zcGxpdCgnLicpO1xuICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMikge1xuICAgICAgICAgICAgIHJlc3VsdCA9IHBhcnRzLnNsaWNlKDAsIHBhcnRzLmxlbmd0aCAtIDIpLmpvaW4oJy4nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdWJkb21haW5DYWNoZS5zaXplID49IE1BWF9DQUNIRV9TSVpFKSBzdWJkb21haW5DYWNoZS5jbGVhcigpO1xuICAgICAgICBzdWJkb21haW5DYWNoZS5zZXQodXJsLCByZXN1bHQpO1xuXG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cbn1cblxuY29uc3QgZ2V0TmVzdGVkUHJvcGVydHkgPSAob2JqOiB1bmtub3duLCBwYXRoOiBzdHJpbmcpOiB1bmtub3duID0+IHtcbiAgICBpZiAoIW9iaiB8fCB0eXBlb2Ygb2JqICE9PSAnb2JqZWN0JykgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIGlmICghcGF0aC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIHJldHVybiAob2JqIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtwYXRoXTtcbiAgICB9XG5cbiAgICBjb25zdCBwYXJ0cyA9IHBhdGguc3BsaXQoJy4nKTtcbiAgICBsZXQgY3VycmVudDogdW5rbm93biA9IG9iajtcblxuICAgIGZvciAoY29uc3Qga2V5IG9mIHBhcnRzKSB7XG4gICAgICAgIGlmICghY3VycmVudCB8fCB0eXBlb2YgY3VycmVudCAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIGN1cnJlbnQgPSAoY3VycmVudCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilba2V5XTtcbiAgICB9XG5cbiAgICByZXR1cm4gY3VycmVudDtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRGaWVsZFZhbHVlID0gKHRhYjogVGFiTWV0YWRhdGEsIGZpZWxkOiBzdHJpbmcpOiBhbnkgPT4ge1xuICAgIHN3aXRjaChmaWVsZCkge1xuICAgICAgICBjYXNlICdpZCc6IHJldHVybiB0YWIuaWQ7XG4gICAgICAgIGNhc2UgJ2luZGV4JzogcmV0dXJuIHRhYi5pbmRleDtcbiAgICAgICAgY2FzZSAnd2luZG93SWQnOiByZXR1cm4gdGFiLndpbmRvd0lkO1xuICAgICAgICBjYXNlICdncm91cElkJzogcmV0dXJuIHRhYi5ncm91cElkO1xuICAgICAgICBjYXNlICd0aXRsZSc6IHJldHVybiB0YWIudGl0bGU7XG4gICAgICAgIGNhc2UgJ3VybCc6IHJldHVybiB0YWIudXJsO1xuICAgICAgICBjYXNlICdzdGF0dXMnOiByZXR1cm4gdGFiLnN0YXR1cztcbiAgICAgICAgY2FzZSAnYWN0aXZlJzogcmV0dXJuIHRhYi5hY3RpdmU7XG4gICAgICAgIGNhc2UgJ3NlbGVjdGVkJzogcmV0dXJuIHRhYi5zZWxlY3RlZDtcbiAgICAgICAgY2FzZSAncGlubmVkJzogcmV0dXJuIHRhYi5waW5uZWQ7XG4gICAgICAgIGNhc2UgJ29wZW5lclRhYklkJzogcmV0dXJuIHRhYi5vcGVuZXJUYWJJZDtcbiAgICAgICAgY2FzZSAnbGFzdEFjY2Vzc2VkJzogcmV0dXJuIHRhYi5sYXN0QWNjZXNzZWQ7XG4gICAgICAgIGNhc2UgJ2NvbnRleHQnOiByZXR1cm4gdGFiLmNvbnRleHQ7XG4gICAgICAgIGNhc2UgJ2dlbnJlJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uZ2VucmU7XG4gICAgICAgIGNhc2UgJ3NpdGVOYW1lJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uc2l0ZU5hbWU7XG4gICAgICAgIC8vIERlcml2ZWQgb3IgbWFwcGVkIGZpZWxkc1xuICAgICAgICBjYXNlICdkb21haW4nOiByZXR1cm4gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgICAgY2FzZSAnc3ViZG9tYWluJzogcmV0dXJuIHN1YmRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gZ2V0TmVzdGVkUHJvcGVydHkodGFiLCBmaWVsZCk7XG4gICAgfVxufTtcblxuY29uc3Qgc3RyaXBUbGQgPSAoZG9tYWluOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gZG9tYWluLnJlcGxhY2UoL1xcLihjb218b3JnfGdvdnxuZXR8ZWR1fGlvKSQvaSwgXCJcIik7XG59O1xuXG5leHBvcnQgY29uc3Qgc2VtYW50aWNCdWNrZXQgPSAodGl0bGU6IHN0cmluZywgdXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBrZXkgPSBgJHt0aXRsZX0gJHt1cmx9YC50b0xvd2VyQ2FzZSgpO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZG9jXCIpIHx8IGtleS5pbmNsdWRlcyhcInJlYWRtZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJndWlkZVwiKSkgcmV0dXJuIFwiRG9jc1wiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwibWFpbFwiKSB8fCBrZXkuaW5jbHVkZXMoXCJpbmJveFwiKSkgcmV0dXJuIFwiQ2hhdFwiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZGFzaGJvYXJkXCIpIHx8IGtleS5pbmNsdWRlcyhcImNvbnNvbGVcIikpIHJldHVybiBcIkRhc2hcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImlzc3VlXCIpIHx8IGtleS5pbmNsdWRlcyhcInRpY2tldFwiKSkgcmV0dXJuIFwiVGFza3NcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRyaXZlXCIpIHx8IGtleS5pbmNsdWRlcyhcInN0b3JhZ2VcIikpIHJldHVybiBcIkZpbGVzXCI7XG4gIHJldHVybiBcIk1pc2NcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBuYXZpZ2F0aW9uS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEpOiBzdHJpbmcgPT4ge1xuICBpZiAodGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gYGNoaWxkLW9mLSR7dGFiLm9wZW5lclRhYklkfWA7XG4gIH1cbiAgcmV0dXJuIGB3aW5kb3ctJHt0YWIud2luZG93SWR9YDtcbn07XG5cbmNvbnN0IGdldFJlY2VuY3lMYWJlbCA9IChsYXN0QWNjZXNzZWQ6IG51bWJlcik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gIGNvbnN0IGRpZmYgPSBub3cgLSBsYXN0QWNjZXNzZWQ7XG4gIGlmIChkaWZmIDwgMzYwMDAwMCkgcmV0dXJuIFwiSnVzdCBub3dcIjsgLy8gMWhcbiAgaWYgKGRpZmYgPCA4NjQwMDAwMCkgcmV0dXJuIFwiVG9kYXlcIjsgLy8gMjRoXG4gIGlmIChkaWZmIDwgMTcyODAwMDAwKSByZXR1cm4gXCJZZXN0ZXJkYXlcIjsgLy8gNDhoXG4gIGlmIChkaWZmIDwgNjA0ODAwMDAwKSByZXR1cm4gXCJUaGlzIFdlZWtcIjsgLy8gN2RcbiAgcmV0dXJuIFwiT2xkZXJcIjtcbn07XG5cbmNvbnN0IGNvbG9yRm9yS2V5ID0gKGtleTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlcik6IHN0cmluZyA9PiBDT0xPUlNbKE1hdGguYWJzKGhhc2hDb2RlKGtleSkpICsgb2Zmc2V0KSAlIENPTE9SUy5sZW5ndGhdO1xuXG5jb25zdCBoYXNoQ29kZSA9ICh2YWx1ZTogc3RyaW5nKTogbnVtYmVyID0+IHtcbiAgbGV0IGhhc2ggPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHZhbHVlLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgaGFzaCA9IChoYXNoIDw8IDUpIC0gaGFzaCArIHZhbHVlLmNoYXJDb2RlQXQoaSk7XG4gICAgaGFzaCB8PSAwO1xuICB9XG4gIHJldHVybiBoYXNoO1xufTtcblxuLy8gSGVscGVyIHRvIGdldCBhIGh1bWFuLXJlYWRhYmxlIGxhYmVsIGNvbXBvbmVudCBmcm9tIGEgc3RyYXRlZ3kgYW5kIGEgc2V0IG9mIHRhYnNcbmNvbnN0IGdldExhYmVsQ29tcG9uZW50ID0gKHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nLCB0YWJzOiBUYWJNZXRhZGF0YVtdLCBhbGxUYWJzTWFwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT4pOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgY29uc3QgZmlyc3RUYWIgPSB0YWJzWzBdO1xuICBpZiAoIWZpcnN0VGFiKSByZXR1cm4gXCJVbmtub3duXCI7XG5cbiAgLy8gQ2hlY2sgY3VzdG9tIHN0cmF0ZWdpZXMgZmlyc3RcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICByZXR1cm4gZ3JvdXBpbmdLZXkoZmlyc3RUYWIsIHN0cmF0ZWd5KTtcbiAgfVxuXG4gIHN3aXRjaCAoc3RyYXRlZ3kpIHtcbiAgICBjYXNlIFwiZG9tYWluXCI6IHtcbiAgICAgIGNvbnN0IHNpdGVOYW1lcyA9IG5ldyBTZXQodGFicy5tYXAodCA9PiB0LmNvbnRleHREYXRhPy5zaXRlTmFtZSkuZmlsdGVyKEJvb2xlYW4pKTtcbiAgICAgIGlmIChzaXRlTmFtZXMuc2l6ZSA9PT0gMSkge1xuICAgICAgICByZXR1cm4gc3RyaXBUbGQoQXJyYXkuZnJvbShzaXRlTmFtZXMpWzBdIGFzIHN0cmluZyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc3RyaXBUbGQoZG9tYWluRnJvbVVybChmaXJzdFRhYi51cmwpKTtcbiAgICB9XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICByZXR1cm4gZG9tYWluRnJvbVVybChmaXJzdFRhYi51cmwpO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgcmV0dXJuIHNlbWFudGljQnVja2V0KGZpcnN0VGFiLnRpdGxlLCBmaXJzdFRhYi51cmwpO1xuICAgIGNhc2UgXCJsaW5lYWdlXCI6XG4gICAgICBpZiAoZmlyc3RUYWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCBwYXJlbnQgPSBhbGxUYWJzTWFwLmdldChmaXJzdFRhYi5vcGVuZXJUYWJJZCk7XG4gICAgICAgIGlmIChwYXJlbnQpIHtcbiAgICAgICAgICBjb25zdCBwYXJlbnRUaXRsZSA9IHBhcmVudC50aXRsZS5sZW5ndGggPiAyMCA/IHBhcmVudC50aXRsZS5zdWJzdHJpbmcoMCwgMjApICsgXCIuLi5cIiA6IHBhcmVudC50aXRsZTtcbiAgICAgICAgICByZXR1cm4gYEZyb206ICR7cGFyZW50VGl0bGV9YDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYEZyb206IFRhYiAke2ZpcnN0VGFiLm9wZW5lclRhYklkfWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYFdpbmRvdyAke2ZpcnN0VGFiLndpbmRvd0lkfWA7XG4gICAgY2FzZSBcImNvbnRleHRcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5jb250ZXh0IHx8IFwiVW5jYXRlZ29yaXplZFwiO1xuICAgIGNhc2UgXCJwaW5uZWRcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5waW5uZWQgPyBcIlBpbm5lZFwiIDogXCJVbnBpbm5lZFwiO1xuICAgIGNhc2UgXCJhZ2VcIjpcbiAgICAgIHJldHVybiBnZXRSZWNlbmN5TGFiZWwoZmlyc3RUYWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgIGNhc2UgXCJ1cmxcIjpcbiAgICAgIHJldHVybiBcIlVSTCBHcm91cFwiO1xuICAgIGNhc2UgXCJyZWNlbmN5XCI6XG4gICAgICByZXR1cm4gXCJUaW1lIEdyb3VwXCI7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gXCJDaGlsZHJlblwiIDogXCJSb290c1wiO1xuICAgIGRlZmF1bHQ6XG4gICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKGZpcnN0VGFiLCBzdHJhdGVneSk7XG4gICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuIFN0cmluZyh2YWwpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFwiVW5rbm93blwiO1xuICB9XG59O1xuXG5jb25zdCBnZW5lcmF0ZUxhYmVsID0gKFxuICBzdHJhdGVnaWVzOiAoR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZylbXSxcbiAgdGFiczogVGFiTWV0YWRhdGFbXSxcbiAgYWxsVGFic01hcDogTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+XG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBsYWJlbHMgPSBzdHJhdGVnaWVzXG4gICAgLm1hcChzID0+IGdldExhYmVsQ29tcG9uZW50KHMsIHRhYnMsIGFsbFRhYnNNYXApKVxuICAgIC5maWx0ZXIobCA9PiBsICYmIGwgIT09IFwiVW5rbm93blwiICYmIGwgIT09IFwiR3JvdXBcIiAmJiBsICE9PSBcIlVSTCBHcm91cFwiICYmIGwgIT09IFwiVGltZSBHcm91cFwiICYmIGwgIT09IFwiTWlzY1wiKTtcblxuICBpZiAobGFiZWxzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFwiR3JvdXBcIjtcbiAgcmV0dXJuIEFycmF5LmZyb20obmV3IFNldChsYWJlbHMpKS5qb2luKFwiIC0gXCIpO1xufTtcblxuY29uc3QgZ2V0U3RyYXRlZ3lDb2xvclJ1bGUgPSAoc3RyYXRlZ3lJZDogc3RyaW5nKTogR3JvdXBpbmdSdWxlIHwgdW5kZWZpbmVkID0+IHtcbiAgICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneUlkKTtcbiAgICBpZiAoIWN1c3RvbSkgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIGNvbnN0IGdyb3VwaW5nUnVsZXNMaXN0ID0gYXNBcnJheTxHcm91cGluZ1J1bGU+KGN1c3RvbS5ncm91cGluZ1J1bGVzKTtcbiAgICAvLyBJdGVyYXRlIG1hbnVhbGx5IHRvIGNoZWNrIGNvbG9yXG4gICAgZm9yIChsZXQgaSA9IGdyb3VwaW5nUnVsZXNMaXN0Lmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgIGNvbnN0IHJ1bGUgPSBncm91cGluZ1J1bGVzTGlzdFtpXTtcbiAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5jb2xvciAmJiBydWxlLmNvbG9yICE9PSAncmFuZG9tJykge1xuICAgICAgICAgICAgcmV0dXJuIHJ1bGU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbn07XG5cbmNvbnN0IHJlc29sdmVXaW5kb3dNb2RlID0gKG1vZGVzOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdKTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiID0+IHtcbiAgICBpZiAobW9kZXMuaW5jbHVkZXMoXCJuZXdcIikpIHJldHVybiBcIm5ld1wiO1xuICAgIGlmIChtb2Rlcy5pbmNsdWRlcyhcImNvbXBvdW5kXCIpKSByZXR1cm4gXCJjb21wb3VuZFwiO1xuICAgIHJldHVybiBcImN1cnJlbnRcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBncm91cFRhYnMgPSAoXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIHN0cmF0ZWdpZXM6IChTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcpW11cbik6IFRhYkdyb3VwW10gPT4ge1xuICBjb25zdCBhdmFpbGFibGVTdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhjdXN0b21TdHJhdGVnaWVzKTtcbiAgY29uc3QgZWZmZWN0aXZlU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gYXZhaWxhYmxlU3RyYXRlZ2llcy5maW5kKGF2YWlsID0+IGF2YWlsLmlkID09PSBzKT8uaXNHcm91cGluZyk7XG4gIGNvbnN0IGJ1Y2tldHMgPSBuZXcgTWFwPHN0cmluZywgVGFiR3JvdXA+KCk7XG5cbiAgY29uc3QgYWxsVGFic01hcCA9IG5ldyBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT4oKTtcbiAgdGFicy5mb3JFYWNoKHQgPT4gYWxsVGFic01hcC5zZXQodC5pZCwgdCkpO1xuXG4gIHRhYnMuZm9yRWFjaCgodGFiKSA9PiB7XG4gICAgbGV0IGtleXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgYXBwbGllZFN0cmF0ZWdpZXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgY29sbGVjdGVkTW9kZXM6IHN0cmluZ1tdID0gW107XG5cbiAgICB0cnkge1xuICAgICAgICBmb3IgKGNvbnN0IHMgb2YgZWZmZWN0aXZlU3RyYXRlZ2llcykge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZ2V0R3JvdXBpbmdSZXN1bHQodGFiLCBzKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQua2V5ICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAga2V5cy5wdXNoKGAke3N9OiR7cmVzdWx0LmtleX1gKTtcbiAgICAgICAgICAgICAgICBhcHBsaWVkU3RyYXRlZ2llcy5wdXNoKHMpO1xuICAgICAgICAgICAgICAgIGNvbGxlY3RlZE1vZGVzLnB1c2gocmVzdWx0Lm1vZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGdlbmVyYXRpbmcgZ3JvdXBpbmcga2V5XCIsIHsgdGFiSWQ6IHRhYi5pZCwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgcmV0dXJuOyAvLyBTa2lwIHRoaXMgdGFiIG9uIGVycm9yXG4gICAgfVxuXG4gICAgLy8gSWYgbm8gc3RyYXRlZ2llcyBhcHBsaWVkIChlLmcuIGFsbCBmaWx0ZXJlZCBvdXQpLCBza2lwIGdyb3VwaW5nIGZvciB0aGlzIHRhYlxuICAgIGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZWZmZWN0aXZlTW9kZSA9IHJlc29sdmVXaW5kb3dNb2RlKGNvbGxlY3RlZE1vZGVzKTtcbiAgICBjb25zdCB2YWx1ZUtleSA9IGtleXMuam9pbihcIjo6XCIpO1xuICAgIGxldCBidWNrZXRLZXkgPSBcIlwiO1xuICAgIGlmIChlZmZlY3RpdmVNb2RlID09PSAnY3VycmVudCcpIHtcbiAgICAgICAgIGJ1Y2tldEtleSA9IGB3aW5kb3ctJHt0YWIud2luZG93SWR9OjpgICsgdmFsdWVLZXk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgIGJ1Y2tldEtleSA9IGBnbG9iYWw6OmAgKyB2YWx1ZUtleTtcbiAgICB9XG5cbiAgICBsZXQgZ3JvdXAgPSBidWNrZXRzLmdldChidWNrZXRLZXkpO1xuICAgIGlmICghZ3JvdXApIHtcbiAgICAgIGxldCBncm91cENvbG9yID0gbnVsbDtcbiAgICAgIGxldCBjb2xvckZpZWxkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICBsZXQgY29sb3JUcmFuc2Zvcm06IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIGxldCBjb2xvclRyYW5zZm9ybVBhdHRlcm46IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICAgICAgZm9yIChjb25zdCBzSWQgb2YgYXBwbGllZFN0cmF0ZWdpZXMpIHtcbiAgICAgICAgY29uc3QgcnVsZSA9IGdldFN0cmF0ZWd5Q29sb3JSdWxlKHNJZCk7XG4gICAgICAgIGlmIChydWxlKSB7XG4gICAgICAgICAgICBncm91cENvbG9yID0gcnVsZS5jb2xvcjtcbiAgICAgICAgICAgIGNvbG9yRmllbGQgPSBydWxlLmNvbG9yRmllbGQ7XG4gICAgICAgICAgICBjb2xvclRyYW5zZm9ybSA9IHJ1bGUuY29sb3JUcmFuc2Zvcm07XG4gICAgICAgICAgICBjb2xvclRyYW5zZm9ybVBhdHRlcm4gPSBydWxlLmNvbG9yVHJhbnNmb3JtUGF0dGVybjtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChncm91cENvbG9yID09PSAnbWF0Y2gnKSB7XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleSh2YWx1ZUtleSwgMCk7XG4gICAgICB9IGVsc2UgaWYgKGdyb3VwQ29sb3IgPT09ICdmaWVsZCcgJiYgY29sb3JGaWVsZCkge1xuICAgICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKHRhYiwgY29sb3JGaWVsZCk7XG4gICAgICAgIGxldCBrZXkgPSB2YWwgIT09IHVuZGVmaW5lZCAmJiB2YWwgIT09IG51bGwgPyBTdHJpbmcodmFsKSA6IFwiXCI7XG4gICAgICAgIGlmIChjb2xvclRyYW5zZm9ybSkge1xuICAgICAgICAgICAga2V5ID0gYXBwbHlWYWx1ZVRyYW5zZm9ybShrZXksIGNvbG9yVHJhbnNmb3JtLCBjb2xvclRyYW5zZm9ybVBhdHRlcm4pO1xuICAgICAgICB9XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleShrZXksIDApO1xuICAgICAgfSBlbHNlIGlmICghZ3JvdXBDb2xvciB8fCBncm91cENvbG9yID09PSAnZmllbGQnKSB7XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleShidWNrZXRLZXksIGJ1Y2tldHMuc2l6ZSk7XG4gICAgICB9XG5cbiAgICAgIGdyb3VwID0ge1xuICAgICAgICBpZDogYnVja2V0S2V5LFxuICAgICAgICB3aW5kb3dJZDogdGFiLndpbmRvd0lkLFxuICAgICAgICBsYWJlbDogXCJcIixcbiAgICAgICAgY29sb3I6IGdyb3VwQ29sb3IsXG4gICAgICAgIHRhYnM6IFtdLFxuICAgICAgICByZWFzb246IGFwcGxpZWRTdHJhdGVnaWVzLmpvaW4oXCIgKyBcIiksXG4gICAgICAgIHdpbmRvd01vZGU6IGVmZmVjdGl2ZU1vZGVcbiAgICAgIH07XG4gICAgICBidWNrZXRzLnNldChidWNrZXRLZXksIGdyb3VwKTtcbiAgICB9XG4gICAgZ3JvdXAudGFicy5wdXNoKHRhYik7XG4gIH0pO1xuXG4gIGNvbnN0IGdyb3VwcyA9IEFycmF5LmZyb20oYnVja2V0cy52YWx1ZXMoKSk7XG4gIGdyb3Vwcy5mb3JFYWNoKGdyb3VwID0+IHtcbiAgICBncm91cC5sYWJlbCA9IGdlbmVyYXRlTGFiZWwoZWZmZWN0aXZlU3RyYXRlZ2llcywgZ3JvdXAudGFicywgYWxsVGFic01hcCk7XG4gIH0pO1xuXG4gIHJldHVybiBncm91cHM7XG59O1xuXG5jb25zdCBjaGVja1ZhbHVlTWF0Y2ggPSAoXG4gICAgb3BlcmF0b3I6IHN0cmluZyxcbiAgICByYXdWYWx1ZTogYW55LFxuICAgIHJ1bGVWYWx1ZTogc3RyaW5nXG4pOiB7IGlzTWF0Y2g6IGJvb2xlYW47IG1hdGNoT2JqOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsIH0gPT4ge1xuICAgIGNvbnN0IHZhbHVlU3RyID0gcmF3VmFsdWUgIT09IHVuZGVmaW5lZCAmJiByYXdWYWx1ZSAhPT0gbnVsbCA/IFN0cmluZyhyYXdWYWx1ZSkgOiBcIlwiO1xuICAgIGNvbnN0IHZhbHVlVG9DaGVjayA9IHZhbHVlU3RyLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgcGF0dGVyblRvQ2hlY2sgPSBydWxlVmFsdWUgPyBydWxlVmFsdWUudG9Mb3dlckNhc2UoKSA6IFwiXCI7XG5cbiAgICBsZXQgaXNNYXRjaCA9IGZhbHNlO1xuICAgIGxldCBtYXRjaE9iajogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCA9IG51bGw7XG5cbiAgICBzd2l0Y2ggKG9wZXJhdG9yKSB7XG4gICAgICAgIGNhc2UgJ2NvbnRhaW5zJzogaXNNYXRjaCA9IHZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdkb2VzTm90Q29udGFpbic6IGlzTWF0Y2ggPSAhdmFsdWVUb0NoZWNrLmluY2x1ZGVzKHBhdHRlcm5Ub0NoZWNrKTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2VxdWFscyc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2sgPT09IHBhdHRlcm5Ub0NoZWNrOyBicmVhaztcbiAgICAgICAgY2FzZSAnc3RhcnRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suc3RhcnRzV2l0aChwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdlbmRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suZW5kc1dpdGgocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZXhpc3RzJzogaXNNYXRjaCA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQ7IGJyZWFrO1xuICAgICAgICBjYXNlICdkb2VzTm90RXhpc3QnOiBpc01hdGNoID0gcmF3VmFsdWUgPT09IHVuZGVmaW5lZDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2lzTnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSA9PT0gbnVsbDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2lzTm90TnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSAhPT0gbnVsbDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ21hdGNoZXMnOlxuICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHJ1bGVWYWx1ZSwgJ2knKTtcbiAgICAgICAgICAgICAgICBtYXRjaE9iaiA9IHJlZ2V4LmV4ZWModmFsdWVTdHIpO1xuICAgICAgICAgICAgICAgIGlzTWF0Y2ggPSAhIW1hdGNoT2JqO1xuICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiB7IGlzTWF0Y2gsIG1hdGNoT2JqIH07XG59O1xuXG5leHBvcnQgY29uc3QgY2hlY2tDb25kaXRpb24gPSAoY29uZGl0aW9uOiBSdWxlQ29uZGl0aW9uLCB0YWI6IFRhYk1ldGFkYXRhKTogYm9vbGVhbiA9PiB7XG4gICAgaWYgKCFjb25kaXRpb24pIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCByYXdWYWx1ZSA9IGdldEZpZWxkVmFsdWUodGFiLCBjb25kaXRpb24uZmllbGQpO1xuICAgIGNvbnN0IHsgaXNNYXRjaCB9ID0gY2hlY2tWYWx1ZU1hdGNoKGNvbmRpdGlvbi5vcGVyYXRvciwgcmF3VmFsdWUsIGNvbmRpdGlvbi52YWx1ZSk7XG4gICAgcmV0dXJuIGlzTWF0Y2g7XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlWYWx1ZVRyYW5zZm9ybSA9ICh2YWw6IHN0cmluZywgdHJhbnNmb3JtOiBzdHJpbmcsIHBhdHRlcm4/OiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIGlmICghdmFsIHx8ICF0cmFuc2Zvcm0gfHwgdHJhbnNmb3JtID09PSAnbm9uZScpIHJldHVybiB2YWw7XG5cbiAgICBzd2l0Y2ggKHRyYW5zZm9ybSkge1xuICAgICAgICBjYXNlICdzdHJpcFRsZCc6XG4gICAgICAgICAgICByZXR1cm4gc3RyaXBUbGQodmFsKTtcbiAgICAgICAgY2FzZSAnbG93ZXJjYXNlJzpcbiAgICAgICAgICAgIHJldHVybiB2YWwudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgY2FzZSAndXBwZXJjYXNlJzpcbiAgICAgICAgICAgIHJldHVybiB2YWwudG9VcHBlckNhc2UoKTtcbiAgICAgICAgY2FzZSAnZmlyc3RDaGFyJzpcbiAgICAgICAgICAgIHJldHVybiB2YWwuY2hhckF0KDApO1xuICAgICAgICBjYXNlICdkb21haW4nOlxuICAgICAgICAgICAgcmV0dXJuIGRvbWFpbkZyb21VcmwodmFsKTtcbiAgICAgICAgY2FzZSAnaG9zdG5hbWUnOlxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgcmV0dXJuIG5ldyBVUkwodmFsKS5ob3N0bmFtZTtcbiAgICAgICAgICAgIH0gY2F0Y2ggeyByZXR1cm4gdmFsOyB9XG4gICAgICAgIGNhc2UgJ3JlZ2V4JzpcbiAgICAgICAgICAgIGlmIChwYXR0ZXJuKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHJlZ2V4ID0gcmVnZXhDYWNoZS5nZXQocGF0dGVybik7XG4gICAgICAgICAgICAgICAgICAgIGlmICghcmVnZXgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlZ2V4ID0gbmV3IFJlZ0V4cChwYXR0ZXJuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlZ2V4Q2FjaGUuc2V0KHBhdHRlcm4sIHJlZ2V4KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBtYXRjaCA9IHJlZ2V4LmV4ZWModmFsKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgZXh0cmFjdGVkID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbWF0Y2gubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHRyYWN0ZWQgKz0gbWF0Y2hbaV0gfHwgXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBleHRyYWN0ZWQ7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgbG9nRGVidWcoXCJJbnZhbGlkIHJlZ2V4IGluIHRyYW5zZm9ybVwiLCB7IHBhdHRlcm46IHBhdHRlcm4sIGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gdmFsO1xuICAgIH1cbn07XG5cbmZ1bmN0aW9uIGV2YWx1YXRlTGVnYWN5UnVsZXMobGVnYWN5UnVsZXM6IFN0cmF0ZWd5UnVsZVtdLCB0YWI6IFRhYk1ldGFkYXRhKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgLy8gRGVmZW5zaXZlIGNoZWNrXG4gICAgaWYgKCFsZWdhY3lSdWxlcyB8fCAhQXJyYXkuaXNBcnJheShsZWdhY3lSdWxlcykpIHtcbiAgICAgICAgaWYgKCFsZWdhY3lSdWxlcykgcmV0dXJuIG51bGw7XG4gICAgICAgIC8vIFRyeSBhc0FycmF5IGlmIGl0J3Mgbm90IGFycmF5IGJ1dCB0cnV0aHkgKHVubGlrZWx5IGdpdmVuIHByZXZpb3VzIGxvZ2ljIGJ1dCBzYWZlKVxuICAgIH1cblxuICAgIGNvbnN0IGxlZ2FjeVJ1bGVzTGlzdCA9IGFzQXJyYXk8U3RyYXRlZ3lSdWxlPihsZWdhY3lSdWxlcyk7XG4gICAgaWYgKGxlZ2FjeVJ1bGVzTGlzdC5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGxlZ2FjeVJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHJhd1ZhbHVlID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgY29uc3QgeyBpc01hdGNoLCBtYXRjaE9iaiB9ID0gY2hlY2tWYWx1ZU1hdGNoKHJ1bGUub3BlcmF0b3IsIHJhd1ZhbHVlLCBydWxlLnZhbHVlKTtcblxuICAgICAgICAgICAgaWYgKGlzTWF0Y2gpIHtcbiAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gcnVsZS5yZXN1bHQ7XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoT2JqKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbWF0Y2hPYmoubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShuZXcgUmVnRXhwKGBcXFxcJCR7aX1gLCAnZycpLCBtYXRjaE9ialtpXSB8fCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbG9nRGVidWcoXCJFcnJvciBldmFsdWF0aW5nIGxlZ2FjeSBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGNvbnN0IGdldEdyb3VwaW5nUmVzdWx0ID0gKHRhYjogVGFiTWV0YWRhdGEsIHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogeyBrZXk6IHN0cmluZyB8IG51bGwsIG1vZGU6IFwiY3VycmVudFwiIHwgXCJuZXdcIiB8IFwiY29tcG91bmRcIiB9ID0+IHtcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICBjb25zdCBmaWx0ZXJHcm91cHNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uW10+KGN1c3RvbS5maWx0ZXJHcm91cHMpO1xuICAgICAgY29uc3QgZmlsdGVyc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGN1c3RvbS5maWx0ZXJzKTtcblxuICAgICAgbGV0IG1hdGNoID0gZmFsc2U7XG5cbiAgICAgIGlmIChmaWx0ZXJHcm91cHNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBPUiBsb2dpY1xuICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZmlsdGVyR3JvdXBzTGlzdCkge1xuICAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihncm91cCk7XG4gICAgICAgICAgICAgIGlmIChncm91cFJ1bGVzLmxlbmd0aCA9PT0gMCB8fCBncm91cFJ1bGVzLmV2ZXJ5KHIgPT4gY2hlY2tDb25kaXRpb24ociwgdGFiKSkpIHtcbiAgICAgICAgICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChmaWx0ZXJzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gTGVnYWN5L1NpbXBsZSBBTkQgbG9naWNcbiAgICAgICAgICBpZiAoZmlsdGVyc0xpc3QuZXZlcnkoZiA9PiBjaGVja0NvbmRpdGlvbihmLCB0YWIpKSkge1xuICAgICAgICAgICAgICBtYXRjaCA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBObyBmaWx0ZXJzIC0+IE1hdGNoIGFsbFxuICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICAgIHJldHVybiB7IGtleTogbnVsbCwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZ3JvdXBpbmdSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgICAgaWYgKGdyb3VwaW5nUnVsZXNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICBjb25zdCBtb2Rlczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwaW5nUnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBsZXQgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICAgICBpZiAocnVsZS5zb3VyY2UgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJhdyA9IGdldEZpZWxkVmFsdWUodGFiLCBydWxlLnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHJhdyAhPT0gdW5kZWZpbmVkICYmIHJhdyAhPT0gbnVsbCA/IFN0cmluZyhyYXcpIDogXCJcIjtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgdmFsID0gcnVsZS52YWx1ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodmFsICYmIHJ1bGUudHJhbnNmb3JtICYmIHJ1bGUudHJhbnNmb3JtICE9PSAnbm9uZScpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsID0gYXBwbHlWYWx1ZVRyYW5zZm9ybSh2YWwsIHJ1bGUudHJhbnNmb3JtLCBydWxlLnRyYW5zZm9ybVBhdHRlcm4pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgcGFydHMucHVzaCh2YWwpO1xuICAgICAgICAgICAgICAgICAgICBpZiAocnVsZS53aW5kb3dNb2RlKSBtb2Rlcy5wdXNoKHJ1bGUud2luZG93TW9kZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGFwcGx5aW5nIGdyb3VwaW5nIHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICByZXR1cm4geyBrZXk6IHBhcnRzLmpvaW4oXCIgLSBcIiksIG1vZGU6IHJlc29sdmVXaW5kb3dNb2RlKG1vZGVzKSB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4geyBrZXk6IGN1c3RvbS5mYWxsYmFjayB8fCBcIk1pc2NcIiwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH0gZWxzZSBpZiAoY3VzdG9tLnJ1bGVzKSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gZXZhbHVhdGVMZWdhY3lSdWxlcyhhc0FycmF5PFN0cmF0ZWd5UnVsZT4oY3VzdG9tLnJ1bGVzKSwgdGFiKTtcbiAgICAgICAgICBpZiAocmVzdWx0KSByZXR1cm4geyBrZXk6IHJlc3VsdCwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHsga2V5OiBjdXN0b20uZmFsbGJhY2sgfHwgXCJNaXNjXCIsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gIH1cblxuICAvLyBCdWlsdC1pbiBzdHJhdGVnaWVzXG4gIGxldCBzaW1wbGVLZXk6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcImRvbWFpblwiOlxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgc2ltcGxlS2V5ID0gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgc2ltcGxlS2V5ID0gc2VtYW50aWNCdWNrZXQodGFiLnRpdGxlLCB0YWIudXJsKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJsaW5lYWdlXCI6XG4gICAgICBzaW1wbGVLZXkgPSBuYXZpZ2F0aW9uS2V5KHRhYik7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLmNvbnRleHQgfHwgXCJVbmNhdGVnb3JpemVkXCI7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIucGlubmVkID8gXCJwaW5uZWRcIiA6IFwidW5waW5uZWRcIjtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJhZ2VcIjpcbiAgICAgIHNpbXBsZUtleSA9IGdldFJlY2VuY3lMYWJlbCh0YWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInVybFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnVybDtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ0aXRsZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnRpdGxlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInJlY2VuY3lcIjpcbiAgICAgIHNpbXBsZUtleSA9IFN0cmluZyh0YWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gXCJjaGlsZFwiIDogXCJyb290XCI7XG4gICAgICBicmVhaztcbiAgICBkZWZhdWx0OlxuICAgICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKHRhYiwgc3RyYXRlZ3kpO1xuICAgICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsKSB7XG4gICAgICAgICAgICBzaW1wbGVLZXkgPSBTdHJpbmcodmFsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNpbXBsZUtleSA9IFwiVW5rbm93blwiO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICB9XG4gIHJldHVybiB7IGtleTogc2ltcGxlS2V5LCBtb2RlOiBcImN1cnJlbnRcIiB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGdyb3VwaW5nS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEsIHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gICAgcmV0dXJuIGdldEdyb3VwaW5nUmVzdWx0KHRhYiwgc3RyYXRlZ3kpLmtleTtcbn07XG5cbmZ1bmN0aW9uIGlzQ29udGV4dEZpZWxkKGZpZWxkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gZmllbGQgPT09ICdjb250ZXh0JyB8fCBmaWVsZCA9PT0gJ2dlbnJlJyB8fCBmaWVsZCA9PT0gJ3NpdGVOYW1lJyB8fCBmaWVsZC5zdGFydHNXaXRoKCdjb250ZXh0RGF0YS4nKTtcbn1cblxuZXhwb3J0IGNvbnN0IHJlcXVpcmVzQ29udGV4dEFuYWx5c2lzID0gKHN0cmF0ZWd5SWRzOiAoc3RyaW5nIHwgU29ydGluZ1N0cmF0ZWd5KVtdKTogYm9vbGVhbiA9PiB7XG4gICAgLy8gQ2hlY2sgaWYgXCJjb250ZXh0XCIgc3RyYXRlZ3kgaXMgZXhwbGljaXRseSByZXF1ZXN0ZWRcbiAgICBpZiAoc3RyYXRlZ3lJZHMuaW5jbHVkZXMoXCJjb250ZXh0XCIpKSByZXR1cm4gdHJ1ZTtcblxuICAgIGNvbnN0IHN0cmF0ZWdpZXMgPSBnZXRTdHJhdGVnaWVzKGN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgIC8vIGZpbHRlciBvbmx5IHRob3NlIHRoYXQgbWF0Y2ggdGhlIHJlcXVlc3RlZCBJRHNcbiAgICBjb25zdCBhY3RpdmVEZWZzID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiBzdHJhdGVneUlkcy5pbmNsdWRlcyhzLmlkKSk7XG5cbiAgICBmb3IgKGNvbnN0IGRlZiBvZiBhY3RpdmVEZWZzKSB7XG4gICAgICAgIC8vIElmIGl0J3MgYSBidWlsdC1pbiBzdHJhdGVneSB0aGF0IG5lZWRzIGNvbnRleHQgKG9ubHkgJ2NvbnRleHQnIGRvZXMpXG4gICAgICAgIGlmIChkZWYuaWQgPT09ICdjb250ZXh0JykgcmV0dXJuIHRydWU7XG5cbiAgICAgICAgLy8gSWYgaXQgaXMgYSBjdXN0b20gc3RyYXRlZ3kgKG9yIG92ZXJyaWRlcyBidWlsdC1pbiksIGNoZWNrIGl0cyBydWxlc1xuICAgICAgICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQoYyA9PiBjLmlkID09PSBkZWYuaWQpO1xuICAgICAgICBpZiAoY3VzdG9tKSB7XG4gICAgICAgICAgICAgY29uc3QgZ3JvdXBSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IHNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uc29ydGluZ1J1bGVzKTtcbiAgICAgICAgICAgICBjb25zdCBncm91cFNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uZ3JvdXBTb3J0aW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IGZpbHRlcnNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihjdXN0b20uZmlsdGVycyk7XG4gICAgICAgICAgICAgY29uc3QgZmlsdGVyR3JvdXBzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbltdPihjdXN0b20uZmlsdGVyR3JvdXBzKTtcblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBydWxlLnNvdXJjZSA9PT0gJ2ZpZWxkJyAmJiBpc0NvbnRleHRGaWVsZChydWxlLnZhbHVlKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIHJ1bGUuY29sb3IgPT09ICdmaWVsZCcgJiYgcnVsZS5jb2xvckZpZWxkICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuY29sb3JGaWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBzb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBTb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZmlsdGVyc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZmlsdGVyR3JvdXBzTGlzdCkge1xuICAgICAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihncm91cCk7XG4gICAgICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFJ1bGVzKSB7XG4gICAgICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufTtcbiIsICJpbXBvcnQgeyBTb3J0aW5nU3RyYXRlZ3ksIFRhYk1ldGFkYXRhLCBDdXN0b21TdHJhdGVneSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBkb21haW5Gcm9tVXJsLCBzZW1hbnRpY0J1Y2tldCwgbmF2aWdhdGlvbktleSwgZ3JvdXBpbmdLZXksIGdldEZpZWxkVmFsdWUsIGdldEN1c3RvbVN0cmF0ZWdpZXMgfSBmcm9tIFwiLi9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCByZWNlbmN5U2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gdGFiLmxhc3RBY2Nlc3NlZCA/PyAwO1xuZXhwb3J0IGNvbnN0IGhpZXJhcmNoeVNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+ICh0YWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IDEgOiAwKTtcbmV4cG9ydCBjb25zdCBwaW5uZWRTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiAodGFiLnBpbm5lZCA/IDAgOiAxKTtcblxuZXhwb3J0IGNvbnN0IHNvcnRUYWJzID0gKHRhYnM6IFRhYk1ldGFkYXRhW10sIHN0cmF0ZWdpZXM6IFNvcnRpbmdTdHJhdGVneVtdKTogVGFiTWV0YWRhdGFbXSA9PiB7XG4gIGNvbnN0IHNjb3Jpbmc6IFNvcnRpbmdTdHJhdGVneVtdID0gc3RyYXRlZ2llcy5sZW5ndGggPyBzdHJhdGVnaWVzIDogW1wicGlubmVkXCIsIFwicmVjZW5jeVwiXTtcbiAgcmV0dXJuIFsuLi50YWJzXS5zb3J0KChhLCBiKSA9PiB7XG4gICAgZm9yIChjb25zdCBzdHJhdGVneSBvZiBzY29yaW5nKSB7XG4gICAgICBjb25zdCBkaWZmID0gY29tcGFyZUJ5KHN0cmF0ZWd5LCBhLCBiKTtcbiAgICAgIGlmIChkaWZmICE9PSAwKSByZXR1cm4gZGlmZjtcbiAgICB9XG4gICAgcmV0dXJuIGEuaWQgLSBiLmlkO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBjb21wYXJlQnkgPSAoc3RyYXRlZ3k6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZywgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyID0+IHtcbiAgLy8gMS4gQ2hlY2sgQ3VzdG9tIFN0cmF0ZWdpZXMgZm9yIFNvcnRpbmcgUnVsZXNcbiAgY29uc3QgY3VzdG9tU3RyYXRzID0gZ2V0Q3VzdG9tU3RyYXRlZ2llcygpO1xuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdHMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5zb3J0aW5nUnVsZXMpO1xuICAgICAgaWYgKHNvcnRSdWxlc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIEV2YWx1YXRlIGN1c3RvbSBzb3J0aW5nIHJ1bGVzIGluIG9yZGVyXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBydWxlLmZpZWxkKTtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbEIgPSBnZXRGaWVsZFZhbHVlKGIsIHJ1bGUuZmllbGQpO1xuXG4gICAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gMDtcbiAgICAgICAgICAgICAgICAgIGlmICh2YWxBIDwgdmFsQikgcmVzdWx0ID0gLTE7XG4gICAgICAgICAgICAgICAgICBlbHNlIGlmICh2YWxBID4gdmFsQikgcmVzdWx0ID0gMTtcblxuICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBydWxlLm9yZGVyID09PSAnZGVzYycgPyAtcmVzdWx0IDogcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgY3VzdG9tIHNvcnRpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBJZiBhbGwgcnVsZXMgZXF1YWwsIGNvbnRpbnVlIHRvIG5leHQgc3RyYXRlZ3kgKHJldHVybiAwKVxuICAgICAgICAgIHJldHVybiAwO1xuICAgICAgfVxuICB9XG5cbiAgLy8gMi4gQnVpbHQtaW4gb3IgZmFsbGJhY2tcbiAgc3dpdGNoIChzdHJhdGVneSkge1xuICAgIGNhc2UgXCJyZWNlbmN5XCI6XG4gICAgICByZXR1cm4gKGIubGFzdEFjY2Vzc2VkID8/IDApIC0gKGEubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6IC8vIEZvcm1lcmx5IGhpZXJhcmNoeVxuICAgICAgcmV0dXJuIGhpZXJhcmNoeVNjb3JlKGEpIC0gaGllcmFyY2h5U2NvcmUoYik7XG4gICAgY2FzZSBcInBpbm5lZFwiOlxuICAgICAgcmV0dXJuIHBpbm5lZFNjb3JlKGEpIC0gcGlubmVkU2NvcmUoYik7XG4gICAgY2FzZSBcInRpdGxlXCI6XG4gICAgICByZXR1cm4gYS50aXRsZS5sb2NhbGVDb21wYXJlKGIudGl0bGUpO1xuICAgIGNhc2UgXCJ1cmxcIjpcbiAgICAgIHJldHVybiBhLnVybC5sb2NhbGVDb21wYXJlKGIudXJsKTtcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgcmV0dXJuIChhLmNvbnRleHQgPz8gXCJcIikubG9jYWxlQ29tcGFyZShiLmNvbnRleHQgPz8gXCJcIik7XG4gICAgY2FzZSBcImRvbWFpblwiOlxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgcmV0dXJuIGRvbWFpbkZyb21VcmwoYS51cmwpLmxvY2FsZUNvbXBhcmUoZG9tYWluRnJvbVVybChiLnVybCkpO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgcmV0dXJuIHNlbWFudGljQnVja2V0KGEudGl0bGUsIGEudXJsKS5sb2NhbGVDb21wYXJlKHNlbWFudGljQnVja2V0KGIudGl0bGUsIGIudXJsKSk7XG4gICAgY2FzZSBcImxpbmVhZ2VcIjpcbiAgICAgIHJldHVybiBuYXZpZ2F0aW9uS2V5KGEpLmxvY2FsZUNvbXBhcmUobmF2aWdhdGlvbktleShiKSk7XG4gICAgY2FzZSBcImFnZVwiOlxuICAgICAgLy8gUmV2ZXJzZSBhbHBoYWJldGljYWwgZm9yIGFnZSBidWNrZXRzIChUb2RheSA8IFllc3RlcmRheSksIHJvdWdoIGFwcHJveFxuICAgICAgcmV0dXJuIChncm91cGluZ0tleShhLCBcImFnZVwiKSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIFwiYWdlXCIpIHx8IFwiXCIpO1xuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBDaGVjayBpZiBpdCdzIGEgZ2VuZXJpYyBmaWVsZCBmaXJzdFxuICAgICAgY29uc3QgdmFsQSA9IGdldEZpZWxkVmFsdWUoYSwgc3RyYXRlZ3kpO1xuICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgc3RyYXRlZ3kpO1xuXG4gICAgICBpZiAodmFsQSAhPT0gdW5kZWZpbmVkICYmIHZhbEIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGlmICh2YWxBIDwgdmFsQikgcmV0dXJuIC0xO1xuICAgICAgICAgIGlmICh2YWxBID4gdmFsQikgcmV0dXJuIDE7XG4gICAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9XG5cbiAgICAgIC8vIEZhbGxiYWNrIGZvciBjdXN0b20gc3RyYXRlZ2llcyBncm91cGluZyBrZXkgKGlmIHVzaW5nIGN1c3RvbSBzdHJhdGVneSBhcyBzb3J0aW5nIGJ1dCBubyBzb3J0aW5nIHJ1bGVzIGRlZmluZWQpXG4gICAgICAvLyBvciB1bmhhbmRsZWQgYnVpbHQtaW5zXG4gICAgICByZXR1cm4gKGdyb3VwaW5nS2V5KGEsIHN0cmF0ZWd5KSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIHN0cmF0ZWd5KSB8fCBcIlwiKTtcbiAgfVxufTtcbiIsICJpbXBvcnQge1xuICBBcHBseUdyb3VwaW5nUGF5bG9hZCxcbiAgR3JvdXBpbmdTZWxlY3Rpb24sXG4gIFByZWZlcmVuY2VzLFxuICBSdW50aW1lTWVzc2FnZSxcbiAgUnVudGltZVJlc3BvbnNlLFxuICBTYXZlZFN0YXRlLFxuICBTb3J0aW5nU3RyYXRlZ3ksXG4gIFRhYkdyb3VwLFxuICBUYWJNZXRhZGF0YVxufSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBmZXRjaExvY2FsU3RhdGUgfSBmcm9tIFwiLi9sb2NhbFN0YXRlLmpzXCI7XG5cbmV4cG9ydCBjb25zdCBzZW5kTWVzc2FnZSA9IGFzeW5jIDxURGF0YT4odHlwZTogUnVudGltZU1lc3NhZ2VbXCJ0eXBlXCJdLCBwYXlsb2FkPzogYW55KTogUHJvbWlzZTxSdW50aW1lUmVzcG9uc2U8VERhdGE+PiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZSwgcGF5bG9hZCB9LCAocmVzcG9uc2UpID0+IHtcbiAgICAgIGlmIChjaHJvbWUucnVudGltZS5sYXN0RXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIlJ1bnRpbWUgZXJyb3I6XCIsIGNocm9tZS5ydW50aW1lLmxhc3RFcnJvcik7XG4gICAgICAgIHJlc29sdmUoeyBvazogZmFsc2UsIGVycm9yOiBjaHJvbWUucnVudGltZS5sYXN0RXJyb3IubWVzc2FnZSB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc29sdmUocmVzcG9uc2UgfHwgeyBvazogZmFsc2UsIGVycm9yOiBcIk5vIHJlc3BvbnNlIGZyb20gYmFja2dyb3VuZFwiIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcbn07XG5cbmV4cG9ydCB0eXBlIFRhYldpdGhHcm91cCA9IFRhYk1ldGFkYXRhICYge1xuICBncm91cExhYmVsPzogc3RyaW5nO1xuICBncm91cENvbG9yPzogc3RyaW5nO1xuICByZWFzb24/OiBzdHJpbmc7XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFdpbmRvd1ZpZXcge1xuICBpZDogbnVtYmVyO1xuICB0aXRsZTogc3RyaW5nO1xuICB0YWJzOiBUYWJXaXRoR3JvdXBbXTtcbiAgdGFiQ291bnQ6IG51bWJlcjtcbiAgZ3JvdXBDb3VudDogbnVtYmVyO1xuICBwaW5uZWRDb3VudDogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgSUNPTlMgPSB7XG4gIGFjdGl2ZTogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwb2x5Z29uIHBvaW50cz1cIjMgMTEgMjIgMiAxMyAyMSAxMSAxMyAzIDExXCI+PC9wb2x5Z29uPjwvc3ZnPmAsXG4gIGhpZGU6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTE3Ljk0IDE3Ljk0QTEwLjA3IDEwLjA3IDAgMCAxIDEyIDIwYy03IDAtMTEtOC0xMS04YTE4LjQ1IDE4LjQ1IDAgMCAxIDUuMDYtNS45NE05LjkgNC4yNEE5LjEyIDkuMTIgMCAwIDEgMTIgNGM3IDAgMTEgOCAxMSA4YTE4LjUgMTguNSAwIDAgMS0yLjE2IDMuMTltLTYuNzItMS4wN2EzIDMgMCAxIDEtNC4yNC00LjI0XCI+PC9wYXRoPjxsaW5lIHgxPVwiMVwiIHkxPVwiMVwiIHgyPVwiMjNcIiB5Mj1cIjIzXCI+PC9saW5lPjwvc3ZnPmAsXG4gIHNob3c6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTEgMTJzNC04IDExLTggMTEgOCAxMSA4LTQgOC0xMSA4LTExLTgtMTEtOC0xMS04elwiPjwvcGF0aD48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjNcIj48L2NpcmNsZT48L3N2Zz5gLFxuICBmb2N1czogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiMTBcIj48L2NpcmNsZT48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjZcIj48L2NpcmNsZT48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjJcIj48L2NpcmNsZT48L3N2Zz5gLFxuICBjbG9zZTogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxsaW5lIHgxPVwiMThcIiB5MT1cIjZcIiB4Mj1cIjZcIiB5Mj1cIjE4XCI+PC9saW5lPjxsaW5lIHgxPVwiNlwiIHkxPVwiNlwiIHgyPVwiMThcIiB5Mj1cIjE4XCI+PC9saW5lPjwvc3ZnPmAsXG4gIHVuZ3JvdXA6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjEwXCI+PC9jaXJjbGU+PGxpbmUgeDE9XCI4XCIgeTE9XCIxMlwiIHgyPVwiMTZcIiB5Mj1cIjEyXCI+PC9saW5lPjwvc3ZnPmAsXG4gIGRlZmF1bHRGaWxlOiBgPHN2ZyB3aWR0aD1cIjI0XCIgaGVpZ2h0PVwiMjRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0xNCAySDZhMiAyIDAgMCAwLTIgMnYxNmEyIDIgMCAwIDAgMiAyaDEyYTIgMiAwIDAgMCAyLTJWOHpcIj48L3BhdGg+PHBvbHlsaW5lIHBvaW50cz1cIjE0IDIgMTQgOCAyMCA4XCI+PC9wb2x5bGluZT48bGluZSB4MT1cIjE2XCIgeTE9XCIxM1wiIHgyPVwiOFwiIHkyPVwiMTNcIj48L2xpbmU+PGxpbmUgeDE9XCIxNlwiIHkxPVwiMTdcIiB4Mj1cIjhcIiB5Mj1cIjE3XCI+PC9saW5lPjxwb2x5bGluZSBwb2ludHM9XCIxMCA5IDkgOSA4IDlcIj48L3BvbHlsaW5lPjwvc3ZnPmAsXG4gIGF1dG9SdW46IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cG9seWdvbiBwb2ludHM9XCIxMyAyIDMgMTQgMTIgMTQgMTEgMjIgMjEgMTAgMTIgMTAgMTMgMlwiPjwvcG9seWdvbj48L3N2Zz5gXG59O1xuXG5leHBvcnQgY29uc3QgR1JPVVBfQ09MT1JTOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICBncmV5OiBcIiM2NDc0OGJcIixcbiAgYmx1ZTogXCIjM2I4MmY2XCIsXG4gIHJlZDogXCIjZWY0NDQ0XCIsXG4gIHllbGxvdzogXCIjZWFiMzA4XCIsXG4gIGdyZWVuOiBcIiMyMmM1NWVcIixcbiAgcGluazogXCIjZWM0ODk5XCIsXG4gIHB1cnBsZTogXCIjYTg1NWY3XCIsXG4gIGN5YW46IFwiIzA2YjZkNFwiLFxuICBvcmFuZ2U6IFwiI2Y5NzMxNlwiXG59O1xuXG5leHBvcnQgY29uc3QgZ2V0R3JvdXBDb2xvciA9IChuYW1lOiBzdHJpbmcpID0+IEdST1VQX0NPTE9SU1tuYW1lXSB8fCBcIiNjYmQ1ZTFcIjtcblxuZXhwb3J0IGNvbnN0IGZldGNoU3RhdGUgPSBhc3luYyAoKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBzZW5kTWVzc2FnZTx7IGdyb3VwczogVGFiR3JvdXBbXTsgcHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzIH0+KFwiZ2V0U3RhdGVcIik7XG4gICAgaWYgKHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICB9XG4gICAgY29uc29sZS53YXJuKFwiZmV0Y2hTdGF0ZSBmYWlsZWQsIHVzaW5nIGZhbGxiYWNrOlwiLCByZXNwb25zZS5lcnJvcik7XG4gICAgcmV0dXJuIGF3YWl0IGZldGNoTG9jYWxTdGF0ZSgpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS53YXJuKFwiZmV0Y2hTdGF0ZSB0aHJldyBleGNlcHRpb24sIHVzaW5nIGZhbGxiYWNrOlwiLCBlKTtcbiAgICByZXR1cm4gYXdhaXQgZmV0Y2hMb2NhbFN0YXRlKCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBhcHBseUdyb3VwaW5nID0gYXN5bmMgKHBheWxvYWQ6IEFwcGx5R3JvdXBpbmdQYXlsb2FkKSA9PiB7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFwcGx5R3JvdXBpbmdcIiwgcGF5bG9hZCB9KTtcbiAgcmV0dXJuIHJlc3BvbnNlIGFzIFJ1bnRpbWVSZXNwb25zZTx1bmtub3duPjtcbn07XG5cbmV4cG9ydCBjb25zdCBhcHBseVNvcnRpbmcgPSBhc3luYyAocGF5bG9hZDogQXBwbHlHcm91cGluZ1BheWxvYWQpID0+IHtcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiYXBwbHlTb3J0aW5nXCIsIHBheWxvYWQgfSk7XG4gIHJldHVybiByZXNwb25zZSBhcyBSdW50aW1lUmVzcG9uc2U8dW5rbm93bj47XG59O1xuXG5leHBvcnQgY29uc3QgbWFwV2luZG93cyA9IChncm91cHM6IFRhYkdyb3VwW10sIHdpbmRvd1RpdGxlczogTWFwPG51bWJlciwgc3RyaW5nPik6IFdpbmRvd1ZpZXdbXSA9PiB7XG4gIGNvbnN0IHdpbmRvd3MgPSBuZXcgTWFwPG51bWJlciwgVGFiV2l0aEdyb3VwW10+KCk7XG5cbiAgZ3JvdXBzLmZvckVhY2goKGdyb3VwKSA9PiB7XG4gICAgY29uc3QgaXNVbmdyb3VwZWQgPSBncm91cC5yZWFzb24gPT09IFwiVW5ncm91cGVkXCI7XG4gICAgZ3JvdXAudGFicy5mb3JFYWNoKCh0YWIpID0+IHtcbiAgICAgIGNvbnN0IGRlY29yYXRlZDogVGFiV2l0aEdyb3VwID0ge1xuICAgICAgICAuLi50YWIsXG4gICAgICAgIGdyb3VwTGFiZWw6IGlzVW5ncm91cGVkID8gdW5kZWZpbmVkIDogZ3JvdXAubGFiZWwsXG4gICAgICAgIGdyb3VwQ29sb3I6IGlzVW5ncm91cGVkID8gdW5kZWZpbmVkIDogZ3JvdXAuY29sb3IsXG4gICAgICAgIHJlYXNvbjogZ3JvdXAucmVhc29uXG4gICAgICB9O1xuICAgICAgY29uc3QgZXhpc3RpbmcgPSB3aW5kb3dzLmdldCh0YWIud2luZG93SWQpID8/IFtdO1xuICAgICAgZXhpc3RpbmcucHVzaChkZWNvcmF0ZWQpO1xuICAgICAgd2luZG93cy5zZXQodGFiLndpbmRvd0lkLCBleGlzdGluZyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIHJldHVybiBBcnJheS5mcm9tKHdpbmRvd3MuZW50cmllcygpKVxuICAgIC5tYXA8V2luZG93Vmlldz4oKFtpZCwgdGFic10pID0+IHtcbiAgICAgIGNvbnN0IGdyb3VwQ291bnQgPSBuZXcgU2V0KHRhYnMubWFwKCh0YWIpID0+IHRhYi5ncm91cExhYmVsKS5maWx0ZXIoKGwpOiBsIGlzIHN0cmluZyA9PiAhIWwpKS5zaXplO1xuICAgICAgY29uc3QgcGlubmVkQ291bnQgPSB0YWJzLmZpbHRlcigodGFiKSA9PiB0YWIucGlubmVkKS5sZW5ndGg7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBpZCxcbiAgICAgICAgdGl0bGU6IHdpbmRvd1RpdGxlcy5nZXQoaWQpID8/IGBXaW5kb3cgJHtpZH1gLFxuICAgICAgICB0YWJzLFxuICAgICAgICB0YWJDb3VudDogdGFicy5sZW5ndGgsXG4gICAgICAgIGdyb3VwQ291bnQsXG4gICAgICAgIHBpbm5lZENvdW50XG4gICAgICB9O1xuICAgIH0pXG4gICAgLnNvcnQoKGEsIGIpID0+IGEuaWQgLSBiLmlkKTtcbn07XG5cbmV4cG9ydCBjb25zdCBmb3JtYXREb21haW4gPSAodXJsOiBzdHJpbmcpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XG4gICAgcmV0dXJuIHBhcnNlZC5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgcmV0dXJuIHVybDtcbiAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldERyYWdBZnRlckVsZW1lbnQoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgeTogbnVtYmVyLCBzZWxlY3Rvcjogc3RyaW5nKSB7XG4gIGNvbnN0IGRyYWdnYWJsZUVsZW1lbnRzID0gQXJyYXkuZnJvbShjb250YWluZXIucXVlcnlTZWxlY3RvckFsbChzZWxlY3RvcikpO1xuXG4gIHJldHVybiBkcmFnZ2FibGVFbGVtZW50cy5yZWR1Y2UoKGNsb3Nlc3QsIGNoaWxkKSA9PiB7XG4gICAgY29uc3QgYm94ID0gY2hpbGQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgY29uc3Qgb2Zmc2V0ID0geSAtIGJveC50b3AgLSBib3guaGVpZ2h0IC8gMjtcbiAgICBpZiAob2Zmc2V0IDwgMCAmJiBvZmZzZXQgPiBjbG9zZXN0Lm9mZnNldCkge1xuICAgICAgcmV0dXJuIHsgb2Zmc2V0OiBvZmZzZXQsIGVsZW1lbnQ6IGNoaWxkIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBjbG9zZXN0O1xuICAgIH1cbiAgfSwgeyBvZmZzZXQ6IE51bWJlci5ORUdBVElWRV9JTkZJTklUWSwgZWxlbWVudDogbnVsbCBhcyBFbGVtZW50IHwgbnVsbCB9KS5lbGVtZW50O1xufVxuIiwgImltcG9ydCB7IGFuYWx5emVUYWJDb250ZXh0LCBDb250ZXh0UmVzdWx0IH0gZnJvbSBcIi4uL2JhY2tncm91bmQvY29udGV4dEFuYWx5c2lzLmpzXCI7XG5pbXBvcnQge1xuICBncm91cFRhYnMsXG4gIGRvbWFpbkZyb21VcmwsXG4gIHNlbWFudGljQnVja2V0LFxuICBuYXZpZ2F0aW9uS2V5LFxuICBncm91cGluZ0tleVxufSBmcm9tIFwiLi4vYmFja2dyb3VuZC9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IEdFTkVSQV9SRUdJU1RSWSB9IGZyb20gXCIuLi9iYWNrZ3JvdW5kL2V4dHJhY3Rpb24vZ2VuZXJhUmVnaXN0cnkuanNcIjtcbmltcG9ydCB7XG4gIHNvcnRUYWJzLFxuICByZWNlbmN5U2NvcmUsXG4gIGhpZXJhcmNoeVNjb3JlLFxuICBwaW5uZWRTY29yZSxcbiAgY29tcGFyZUJ5XG59IGZyb20gXCIuLi9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBtYXBDaHJvbWVUYWIgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5pbXBvcnQgeyBnZXREcmFnQWZ0ZXJFbGVtZW50IH0gZnJvbSBcIi4vY29tbW9uLmpzXCI7XG5pbXBvcnQgeyBzZXRDdXN0b21TdHJhdGVnaWVzIH0gZnJvbSBcIi4uL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBHcm91cGluZ1N0cmF0ZWd5LCBQcmVmZXJlbmNlcywgU29ydGluZ1N0cmF0ZWd5LCBUYWJNZXRhZGF0YSwgVGFiR3JvdXAsIEN1c3RvbVN0cmF0ZWd5LCBTdHJhdGVneVJ1bGUsIFJ1bGVDb25kaXRpb24sIEdyb3VwaW5nUnVsZSwgU29ydGluZ1J1bGUsIExvZ0VudHJ5LCBMb2dMZXZlbCB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IFNUUkFURUdJRVMsIFN0cmF0ZWd5RGVmaW5pdGlvbiwgZ2V0U3RyYXRlZ2llcyB9IGZyb20gXCIuLi9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgbG9nSW5mbyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5cbi8vIFR5cGVzXG5pbnRlcmZhY2UgQ29sdW1uRGVmaW5pdGlvbiB7XG4gICAga2V5OiBzdHJpbmc7XG4gICAgbGFiZWw6IHN0cmluZztcbiAgICB2aXNpYmxlOiBib29sZWFuO1xuICAgIHdpZHRoOiBzdHJpbmc7IC8vIENTUyB3aWR0aFxuICAgIGZpbHRlcmFibGU6IGJvb2xlYW47XG59XG5cbi8vIFN0YXRlXG5sZXQgY3VycmVudFRhYnM6IGNocm9tZS50YWJzLlRhYltdID0gW107XG5sZXQgbG9jYWxDdXN0b21TdHJhdGVnaWVzOiBDdXN0b21TdHJhdGVneVtdID0gW107XG5sZXQgY3VycmVudENvbnRleHRNYXAgPSBuZXcgTWFwPG51bWJlciwgQ29udGV4dFJlc3VsdD4oKTtcbmxldCB0YWJUaXRsZXMgPSBuZXcgTWFwPG51bWJlciwgc3RyaW5nPigpO1xubGV0IHNvcnRLZXk6IHN0cmluZyB8IG51bGwgPSBudWxsO1xubGV0IHNvcnREaXJlY3Rpb246ICdhc2MnIHwgJ2Rlc2MnID0gJ2FzYyc7XG5sZXQgc2ltdWxhdGVkU2VsZWN0aW9uID0gbmV3IFNldDxudW1iZXI+KCk7XG5cbi8vIE1vZGVybiBUYWJsZSBTdGF0ZVxubGV0IGdsb2JhbFNlYXJjaFF1ZXJ5ID0gJyc7XG5sZXQgY29sdW1uRmlsdGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xubGV0IGNvbHVtbnM6IENvbHVtbkRlZmluaXRpb25bXSA9IFtcbiAgICB7IGtleTogJ2lkJywgbGFiZWw6ICdJRCcsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnNjBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ2luZGV4JywgbGFiZWw6ICdJbmRleCcsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnNjBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ3dpbmRvd0lkJywgbGFiZWw6ICdXaW5kb3cnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzcwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICdncm91cElkJywgbGFiZWw6ICdHcm91cCcsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnNzBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ3RpdGxlJywgbGFiZWw6ICdUaXRsZScsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnMjAwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICd1cmwnLCBsYWJlbDogJ1VSTCcsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnMjUwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICdnZW5yZScsIGxhYmVsOiAnR2VucmUnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnY29udGV4dCcsIGxhYmVsOiAnQ2F0ZWdvcnknLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnc2l0ZU5hbWUnLCBsYWJlbDogJ1NpdGUgTmFtZScsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnMTIwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICdwbGF0Zm9ybScsIGxhYmVsOiAnUGxhdGZvcm0nLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnb2JqZWN0VHlwZScsIGxhYmVsOiAnT2JqZWN0IFR5cGUnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnZXh0cmFjdGVkVGl0bGUnLCBsYWJlbDogJ0V4dHJhY3RlZCBUaXRsZScsIHZpc2libGU6IGZhbHNlLCB3aWR0aDogJzIwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnYXV0aG9yT3JDcmVhdG9yJywgbGFiZWw6ICdBdXRob3InLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEyMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAncHVibGlzaGVkQXQnLCBsYWJlbDogJ1B1Ymxpc2hlZCcsIHZpc2libGU6IGZhbHNlLCB3aWR0aDogJzEwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnc3RhdHVzJywgbGFiZWw6ICdTdGF0dXMnLCB2aXNpYmxlOiBmYWxzZSwgd2lkdGg6ICc4MHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnYWN0aXZlJywgbGFiZWw6ICdBY3RpdmUnLCB2aXNpYmxlOiBmYWxzZSwgd2lkdGg6ICc2MHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAncGlubmVkJywgbGFiZWw6ICdQaW5uZWQnLCB2aXNpYmxlOiBmYWxzZSwgd2lkdGg6ICc2MHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnb3BlbmVyVGFiSWQnLCBsYWJlbDogJ09wZW5lcicsIHZpc2libGU6IGZhbHNlLCB3aWR0aDogJzcwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICdwYXJlbnRUaXRsZScsIGxhYmVsOiAnUGFyZW50IFRpdGxlJywgdmlzaWJsZTogZmFsc2UsIHdpZHRoOiAnMTUwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICdnZW5yZScsIGxhYmVsOiAnR2VucmUnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnY29udGV4dCcsIGxhYmVsOiAnRXh0cmFjdGVkIENvbnRleHQnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzQwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnbGFzdEFjY2Vzc2VkJywgbGFiZWw6ICdMYXN0IEFjY2Vzc2VkJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxNTBweCcsIGZpbHRlcmFibGU6IGZhbHNlIH0sXG4gICAgeyBrZXk6ICdhY3Rpb25zJywgbGFiZWw6ICdBY3Rpb25zJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMjBweCcsIGZpbHRlcmFibGU6IGZhbHNlIH1cbl07XG5cblxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIGFzeW5jICgpID0+IHtcbiAgY29uc3QgcmVmcmVzaEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZWZyZXNoQnRuJyk7XG4gIGlmIChyZWZyZXNoQnRuKSB7XG4gICAgcmVmcmVzaEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGxvYWRUYWJzKTtcbiAgfVxuXG4gIC8vIFRhYiBTd2l0Y2hpbmcgTG9naWNcbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnRhYi1idG4nKS5mb3JFYWNoKGJ0biA9PiB7XG4gICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgLy8gUmVtb3ZlIGFjdGl2ZSBjbGFzcyBmcm9tIGFsbCBidXR0b25zIGFuZCBzZWN0aW9uc1xuICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnRhYi1idG4nKS5mb3JFYWNoKGIgPT4gYi5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKSk7XG4gICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcudmlldy1zZWN0aW9uJykuZm9yRWFjaChzID0+IHMuY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJykpO1xuXG4gICAgICAvLyBBZGQgYWN0aXZlIGNsYXNzIHRvIGNsaWNrZWQgYnV0dG9uXG4gICAgICBidG4uY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG5cbiAgICAgIC8vIFNob3cgdGFyZ2V0IHNlY3Rpb25cbiAgICAgIGNvbnN0IHRhcmdldElkID0gKGJ0biBhcyBIVE1MRWxlbWVudCkuZGF0YXNldC50YXJnZXQ7XG4gICAgICBpZiAodGFyZ2V0SWQpIHtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQodGFyZ2V0SWQpPy5jbGFzc0xpc3QuYWRkKCdhY3RpdmUnKTtcbiAgICAgICAgbG9nSW5mbyhcIlN3aXRjaGVkIHZpZXdcIiwgeyB0YXJnZXRJZCB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gSWYgc3dpdGNoaW5nIHRvIGFsZ29yaXRobXMsIHBvcHVsYXRlIHJlZmVyZW5jZSBpZiBlbXB0eVxuICAgICAgaWYgKHRhcmdldElkID09PSAndmlldy1hbGdvcml0aG1zJykge1xuICAgICAgICAgcmVuZGVyQWxnb3JpdGhtc1ZpZXcoKTtcbiAgICAgIH0gZWxzZSBpZiAodGFyZ2V0SWQgPT09ICd2aWV3LXN0cmF0ZWd5LWxpc3QnKSB7XG4gICAgICAgICByZW5kZXJTdHJhdGVneUxpc3RUYWJsZSgpO1xuICAgICAgfSBlbHNlIGlmICh0YXJnZXRJZCA9PT0gJ3ZpZXctbG9ncycpIHtcbiAgICAgICAgIGxvYWRMb2dzKCk7XG4gICAgICAgICBsb2FkR2xvYmFsTG9nTGV2ZWwoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG5cbiAgLy8gTG9nIFZpZXdlciBMb2dpY1xuICBjb25zdCByZWZyZXNoTG9nc0J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZWZyZXNoLWxvZ3MtYnRuJyk7XG4gIGlmIChyZWZyZXNoTG9nc0J0bikgcmVmcmVzaExvZ3NCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBsb2FkTG9ncyk7XG5cbiAgY29uc3QgY2xlYXJMb2dzQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NsZWFyLWxvZ3MtYnRuJyk7XG4gIGlmIChjbGVhckxvZ3NCdG4pIGNsZWFyTG9nc0J0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGNsZWFyUmVtb3RlTG9ncyk7XG5cbiAgY29uc3QgbG9nTGV2ZWxGaWx0ZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9nLWxldmVsLWZpbHRlcicpO1xuICBpZiAobG9nTGV2ZWxGaWx0ZXIpIGxvZ0xldmVsRmlsdGVyLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHJlbmRlckxvZ3MpO1xuXG4gIGNvbnN0IGxvZ1NlYXJjaCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2ctc2VhcmNoJyk7XG4gIGlmIChsb2dTZWFyY2gpIGxvZ1NlYXJjaC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIHJlbmRlckxvZ3MpO1xuXG4gIGNvbnN0IGdsb2JhbExvZ0xldmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dsb2JhbC1sb2ctbGV2ZWwnKTtcbiAgaWYgKGdsb2JhbExvZ0xldmVsKSBnbG9iYWxMb2dMZXZlbC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB1cGRhdGVHbG9iYWxMb2dMZXZlbCk7XG5cbiAgLy8gU2ltdWxhdGlvbiBMb2dpY1xuICBjb25zdCBydW5TaW1CdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncnVuU2ltQnRuJyk7XG4gIGlmIChydW5TaW1CdG4pIHtcbiAgICBydW5TaW1CdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBydW5TaW11bGF0aW9uKTtcbiAgfVxuXG4gIGNvbnN0IGFwcGx5QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FwcGx5QnRuJyk7XG4gIGlmIChhcHBseUJ0bikge1xuICAgIGFwcGx5QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgYXBwbHlUb0Jyb3dzZXIpO1xuICB9XG5cbiAgLy8gTW9kZXJuIFRhYmxlIENvbnRyb2xzXG4gIGNvbnN0IGdsb2JhbFNlYXJjaElucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dsb2JhbFNlYXJjaCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gIGlmIChnbG9iYWxTZWFyY2hJbnB1dCkge1xuICAgICAgZ2xvYmFsU2VhcmNoSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCAoZSkgPT4ge1xuICAgICAgICAgIGdsb2JhbFNlYXJjaFF1ZXJ5ID0gKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgIHJlbmRlclRhYmxlKCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IGNvbHVtbnNCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY29sdW1uc0J0bicpO1xuICBpZiAoY29sdW1uc0J0bikge1xuICAgICAgY29sdW1uc0J0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICBjb25zdCBtZW51ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvbHVtbnNNZW51Jyk7XG4gICAgICAgICAgbWVudT8uY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJyk7XG4gICAgICAgICAgcmVuZGVyQ29sdW1uc01lbnUoKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY29uc3QgcmVzZXRWaWV3QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Jlc2V0Vmlld0J0bicpO1xuICBpZiAocmVzZXRWaWV3QnRuKSB7XG4gICAgICByZXNldFZpZXdCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgLy8gUmVzZXQgY29sdW1ucyB0byBkZWZhdWx0cyAoc2ltcGxpZmllZCwganVzdCBzaG93IGFsbCByZWFzb25hYmxlIG9uZXMpXG4gICAgICAgICAgICBjb2x1bW5zLmZvckVhY2goYyA9PiBjLnZpc2libGUgPSBbJ2lkJywgJ3RpdGxlJywgJ3VybCcsICd3aW5kb3dJZCcsICdncm91cElkJywgJ2dlbnJlJywgJ2NvbnRleHQnLCAnc2l0ZU5hbWUnLCAncGxhdGZvcm0nLCAnb2JqZWN0VHlwZScsICdhdXRob3JPckNyZWF0b3InLCAnYWN0aW9ucyddLmluY2x1ZGVzKGMua2V5KSk7XG4gICAgICAgICAgZ2xvYmFsU2VhcmNoUXVlcnkgPSAnJztcbiAgICAgICAgICBpZiAoZ2xvYmFsU2VhcmNoSW5wdXQpIGdsb2JhbFNlYXJjaElucHV0LnZhbHVlID0gJyc7XG4gICAgICAgICAgY29sdW1uRmlsdGVycyA9IHt9O1xuICAgICAgICAgIHJlbmRlclRhYmxlSGVhZGVyKCk7XG4gICAgICAgICAgcmVuZGVyVGFibGUoKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gSGlkZSBjb2x1bW4gbWVudSB3aGVuIGNsaWNraW5nIG91dHNpZGVcbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICBpZiAoIXRhcmdldC5jbG9zZXN0KCcuY29sdW1ucy1tZW51LWNvbnRhaW5lcicpKSB7XG4gICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvbHVtbnNNZW51Jyk/LmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xuICAgICAgfVxuICB9KTtcblxuXG4gIC8vIExpc3RlbiBmb3IgdGFiIHVwZGF0ZXMgdG8gcmVmcmVzaCBkYXRhIChTUEEgc3VwcG9ydClcbiAgY2hyb21lLnRhYnMub25VcGRhdGVkLmFkZExpc3RlbmVyKCh0YWJJZCwgY2hhbmdlSW5mbywgdGFiKSA9PiB7XG4gICAgLy8gV2UgdXBkYXRlIGlmIFVSTCBjaGFuZ2VzIG9yIHN0YXR1cyBjaGFuZ2VzIHRvIGNvbXBsZXRlXG4gICAgaWYgKGNoYW5nZUluZm8udXJsIHx8IGNoYW5nZUluZm8uc3RhdHVzID09PSAnY29tcGxldGUnKSB7XG4gICAgICAgIGxvYWRUYWJzKCk7XG4gICAgfVxuICB9KTtcblxuICAvLyBMaXN0ZW4gZm9yIHRhYiByZW1vdmFscyB0byByZWZyZXNoIGRhdGFcbiAgY2hyb21lLnRhYnMub25SZW1vdmVkLmFkZExpc3RlbmVyKCgpID0+IHtcbiAgICBsb2FkVGFicygpO1xuICB9KTtcblxuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChldmVudCkgPT4ge1xuICAgIGNvbnN0IHRhcmdldCA9IGV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgaWYgKCF0YXJnZXQpIHJldHVybjtcblxuICAgIGlmICh0YXJnZXQubWF0Y2hlcygnLmNvbnRleHQtanNvbi1idG4nKSkge1xuICAgICAgY29uc3QgdGFiSWQgPSBOdW1iZXIodGFyZ2V0LmRhdGFzZXQudGFiSWQpO1xuICAgICAgaWYgKCF0YWJJZCkgcmV0dXJuO1xuICAgICAgY29uc3QgZGF0YSA9IGN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWJJZCk/LmRhdGE7XG4gICAgICBpZiAoIWRhdGEpIHJldHVybjtcbiAgICAgIGNvbnN0IGpzb24gPSBKU09OLnN0cmluZ2lmeShkYXRhLCBudWxsLCAyKTtcbiAgICAgIGNvbnN0IGh0bWxDb250ZW50ID0gYFxuICAgICAgICA8IURPQ1RZUEUgaHRtbD5cbiAgICAgICAgPGh0bWw+XG4gICAgICAgIDxoZWFkPlxuICAgICAgICAgIDx0aXRsZT5KU09OIFZpZXc8L3RpdGxlPlxuICAgICAgICAgIDxzdHlsZT5cbiAgICAgICAgICAgIGJvZHkgeyBmb250LWZhbWlseTogbW9ub3NwYWNlOyBiYWNrZ3JvdW5kLWNvbG9yOiAjZjBmMGYwOyBwYWRkaW5nOiAyMHB4OyB9XG4gICAgICAgICAgICBwcmUgeyBiYWNrZ3JvdW5kLWNvbG9yOiB3aGl0ZTsgcGFkZGluZzogMTVweDsgYm9yZGVyLXJhZGl1czogNXB4OyBib3JkZXI6IDFweCBzb2xpZCAjY2NjOyBvdmVyZmxvdzogYXV0bzsgfVxuICAgICAgICAgIDwvc3R5bGU+XG4gICAgICAgIDwvaGVhZD5cbiAgICAgICAgPGJvZHk+XG4gICAgICAgICAgPGgzPkpTT04gRGF0YTwvaDM+XG4gICAgICAgICAgPHByZT4ke2VzY2FwZUh0bWwoanNvbil9PC9wcmU+XG4gICAgICAgIDwvYm9keT5cbiAgICAgICAgPC9odG1sPlxuICAgICAgYDtcbiAgICAgIGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbaHRtbENvbnRlbnRdLCB7IHR5cGU6ICd0ZXh0L2h0bWwnIH0pO1xuICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICAgIHdpbmRvdy5vcGVuKHVybCwgJ19ibGFuaycsICdub29wZW5lcixub3JlZmVycmVyJyk7XG4gICAgfSBlbHNlIGlmICh0YXJnZXQubWF0Y2hlcygnLmdvdG8tdGFiLWJ0bicpKSB7XG4gICAgICBjb25zdCB0YWJJZCA9IE51bWJlcih0YXJnZXQuZGF0YXNldC50YWJJZCk7XG4gICAgICBjb25zdCB3aW5kb3dJZCA9IE51bWJlcih0YXJnZXQuZGF0YXNldC53aW5kb3dJZCk7XG4gICAgICBpZiAodGFiSWQgJiYgd2luZG93SWQpIHtcbiAgICAgICAgY2hyb21lLnRhYnMudXBkYXRlKHRhYklkLCB7IGFjdGl2ZTogdHJ1ZSB9KTtcbiAgICAgICAgY2hyb21lLndpbmRvd3MudXBkYXRlKHdpbmRvd0lkLCB7IGZvY3VzZWQ6IHRydWUgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0YXJnZXQubWF0Y2hlcygnLmNsb3NlLXRhYi1idG4nKSkge1xuICAgICAgY29uc3QgdGFiSWQgPSBOdW1iZXIodGFyZ2V0LmRhdGFzZXQudGFiSWQpO1xuICAgICAgaWYgKHRhYklkKSB7XG4gICAgICAgIGNocm9tZS50YWJzLnJlbW92ZSh0YWJJZCk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0YXJnZXQubWF0Y2hlcygnLnN0cmF0ZWd5LXZpZXctYnRuJykpIHtcbiAgICAgICAgY29uc3QgdHlwZSA9IHRhcmdldC5kYXRhc2V0LnR5cGU7XG4gICAgICAgIGNvbnN0IG5hbWUgPSB0YXJnZXQuZGF0YXNldC5uYW1lO1xuICAgICAgICBpZiAodHlwZSAmJiBuYW1lKSB7XG4gICAgICAgICAgICBzaG93U3RyYXRlZ3lEZXRhaWxzKHR5cGUsIG5hbWUpO1xuICAgICAgICB9XG4gICAgfVxuICB9KTtcblxuICAvLyBJbml0IHRhYmxlIGhlYWRlclxuICByZW5kZXJUYWJsZUhlYWRlcigpO1xuXG4gIGxvYWRUYWJzKCk7XG4gIC8vIFByZS1yZW5kZXIgc3RhdGljIGNvbnRlbnRcbiAgYXdhaXQgbG9hZFByZWZlcmVuY2VzQW5kSW5pdCgpOyAvLyBMb2FkIHByZWZlcmVuY2VzIGZpcnN0IHRvIGluaXQgc3RyYXRlZ2llc1xuICByZW5kZXJBbGdvcml0aG1zVmlldygpO1xuICBsb2FkQ3VzdG9tR2VuZXJhKCk7XG4gIGluaXRTdHJhdGVneUJ1aWxkZXIoKTtcblxuICBjb25zdCBleHBvcnRBbGxCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXRlZ3ktbGlzdC1leHBvcnQtYnRuJyk7XG4gIGNvbnN0IGltcG9ydEFsbEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdGVneS1saXN0LWltcG9ydC1idG4nKTtcbiAgaWYgKGV4cG9ydEFsbEJ0bikgZXhwb3J0QWxsQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZXhwb3J0QWxsU3RyYXRlZ2llcyk7XG4gIGlmIChpbXBvcnRBbGxCdG4pIGltcG9ydEFsbEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGltcG9ydEFsbFN0cmF0ZWdpZXMpO1xufSk7XG5cbi8vIENvbHVtbiBNYW5hZ2VtZW50XG5cbmZ1bmN0aW9uIHJlbmRlckNvbHVtbnNNZW51KCkge1xuICAgIGNvbnN0IG1lbnUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY29sdW1uc01lbnUnKTtcbiAgICBpZiAoIW1lbnUpIHJldHVybjtcblxuICAgIG1lbnUuaW5uZXJIVE1MID0gY29sdW1ucy5tYXAoY29sID0+IGBcbiAgICAgICAgPGxhYmVsIGNsYXNzPVwiY29sdW1uLXRvZ2dsZVwiPlxuICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGRhdGEta2V5PVwiJHtjb2wua2V5fVwiICR7Y29sLnZpc2libGUgPyAnY2hlY2tlZCcgOiAnJ30+XG4gICAgICAgICAgICAke2VzY2FwZUh0bWwoY29sLmxhYmVsKX1cbiAgICAgICAgPC9sYWJlbD5cbiAgICBgKS5qb2luKCcnKTtcblxuICAgIG1lbnUucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQnKS5mb3JFYWNoKGlucHV0ID0+IHtcbiAgICAgICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKGUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS5kYXRhc2V0LmtleTtcbiAgICAgICAgICAgIGNvbnN0IGNoZWNrZWQgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZDtcbiAgICAgICAgICAgIGNvbnN0IGNvbCA9IGNvbHVtbnMuZmluZChjID0+IGMua2V5ID09PSBrZXkpO1xuICAgICAgICAgICAgaWYgKGNvbCkge1xuICAgICAgICAgICAgICAgIGNvbC52aXNpYmxlID0gY2hlY2tlZDtcbiAgICAgICAgICAgICAgICByZW5kZXJUYWJsZUhlYWRlcigpOyAvLyBSZS1yZW5kZXIgaGVhZGVyIHRvIGFkZC9yZW1vdmUgY29sdW1uc1xuICAgICAgICAgICAgICAgIHJlbmRlclRhYmxlKCk7IC8vIFJlLXJlbmRlciBib2R5XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiByZW5kZXJUYWJsZUhlYWRlcigpIHtcbiAgICBjb25zdCBoZWFkZXJSb3cgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaGVhZGVyUm93Jyk7XG4gICAgY29uc3QgZmlsdGVyUm93ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2ZpbHRlclJvdycpO1xuICAgIGlmICghaGVhZGVyUm93IHx8ICFmaWx0ZXJSb3cpIHJldHVybjtcblxuICAgIGNvbnN0IHZpc2libGVDb2xzID0gY29sdW1ucy5maWx0ZXIoYyA9PiBjLnZpc2libGUpO1xuXG4gICAgLy8gUmVuZGVyIEhlYWRlcnNcbiAgICBoZWFkZXJSb3cuaW5uZXJIVE1MID0gdmlzaWJsZUNvbHMubWFwKGNvbCA9PiBgXG4gICAgICAgIDx0aCBjbGFzcz1cIiR7Y29sLmtleSAhPT0gJ2FjdGlvbnMnID8gJ3NvcnRhYmxlJyA6ICcnfVwiIGRhdGEta2V5PVwiJHtjb2wua2V5fVwiIHN0eWxlPVwid2lkdGg6ICR7Y29sLndpZHRofTsgcG9zaXRpb246IHJlbGF0aXZlO1wiPlxuICAgICAgICAgICAgJHtlc2NhcGVIdG1sKGNvbC5sYWJlbCl9XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwicmVzaXplclwiPjwvZGl2PlxuICAgICAgICA8L3RoPlxuICAgIGApLmpvaW4oJycpO1xuXG4gICAgLy8gUmVuZGVyIEZpbHRlciBJbnB1dHNcbiAgICBmaWx0ZXJSb3cuaW5uZXJIVE1MID0gdmlzaWJsZUNvbHMubWFwKGNvbCA9PiB7XG4gICAgICAgIGlmICghY29sLmZpbHRlcmFibGUpIHJldHVybiAnPHRoPjwvdGg+JztcbiAgICAgICAgY29uc3QgdmFsID0gY29sdW1uRmlsdGVyc1tjb2wua2V5XSB8fCAnJztcbiAgICAgICAgcmV0dXJuIGBcbiAgICAgICAgICAgIDx0aD5cbiAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cImZpbHRlci1pbnB1dFwiIGRhdGEta2V5PVwiJHtjb2wua2V5fVwiIHZhbHVlPVwiJHtlc2NhcGVIdG1sKHZhbCl9XCIgcGxhY2Vob2xkZXI9XCJGaWx0ZXIuLi5cIj5cbiAgICAgICAgICAgIDwvdGg+XG4gICAgICAgIGA7XG4gICAgfSkuam9pbignJyk7XG5cbiAgICAvLyBBdHRhY2ggU29ydCBMaXN0ZW5lcnNcbiAgICBoZWFkZXJSb3cucXVlcnlTZWxlY3RvckFsbCgnLnNvcnRhYmxlJykuZm9yRWFjaCh0aCA9PiB7XG4gICAgICAgIHRoLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgICAgICAgIC8vIElnbm9yZSBpZiBjbGlja2VkIG9uIHJlc2l6ZXJcbiAgICAgICAgICAgIGlmICgoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmNsYXNzTGlzdC5jb250YWlucygncmVzaXplcicpKSByZXR1cm47XG5cbiAgICAgICAgICAgIGNvbnN0IGtleSA9IHRoLmdldEF0dHJpYnV0ZSgnZGF0YS1rZXknKTtcbiAgICAgICAgICAgIGlmIChrZXkpIGhhbmRsZVNvcnQoa2V5KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAvLyBBdHRhY2ggRmlsdGVyIExpc3RlbmVyc1xuICAgIGZpbHRlclJvdy5xdWVyeVNlbGVjdG9yQWxsKCcuZmlsdGVyLWlucHV0JykuZm9yRWFjaChpbnB1dCA9PiB7XG4gICAgICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgKGUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuZGF0YXNldC5rZXk7XG4gICAgICAgICAgICBjb25zdCB2YWwgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICBpZiAoa2V5KSB7XG4gICAgICAgICAgICAgICAgY29sdW1uRmlsdGVyc1trZXldID0gdmFsO1xuICAgICAgICAgICAgICAgIHJlbmRlclRhYmxlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgLy8gQXR0YWNoIFJlc2l6ZSBMaXN0ZW5lcnNcbiAgICBoZWFkZXJSb3cucXVlcnlTZWxlY3RvckFsbCgnLnJlc2l6ZXInKS5mb3JFYWNoKHJlc2l6ZXIgPT4ge1xuICAgICAgICBpbml0UmVzaXplKHJlc2l6ZXIgYXMgSFRNTEVsZW1lbnQpO1xuICAgIH0pO1xuXG4gICAgdXBkYXRlSGVhZGVyU3R5bGVzKCk7XG59XG5cbmZ1bmN0aW9uIGluaXRSZXNpemUocmVzaXplcjogSFRNTEVsZW1lbnQpIHtcbiAgICBsZXQgeCA9IDA7XG4gICAgbGV0IHcgPSAwO1xuICAgIGxldCB0aDogSFRNTEVsZW1lbnQ7XG5cbiAgICBjb25zdCBtb3VzZURvd25IYW5kbGVyID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgICAgdGggPSByZXNpemVyLnBhcmVudEVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIHggPSBlLmNsaWVudFg7XG4gICAgICAgIHcgPSB0aC5vZmZzZXRXaWR0aDtcblxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCBtb3VzZU1vdmVIYW5kbGVyKTtcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIG1vdXNlVXBIYW5kbGVyKTtcbiAgICAgICAgcmVzaXplci5jbGFzc0xpc3QuYWRkKCdyZXNpemluZycpO1xuICAgIH07XG5cbiAgICBjb25zdCBtb3VzZU1vdmVIYW5kbGVyID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgICAgY29uc3QgZHggPSBlLmNsaWVudFggLSB4O1xuICAgICAgICBjb25zdCBjb2xLZXkgPSB0aC5nZXRBdHRyaWJ1dGUoJ2RhdGEta2V5Jyk7XG4gICAgICAgIGNvbnN0IGNvbCA9IGNvbHVtbnMuZmluZChjID0+IGMua2V5ID09PSBjb2xLZXkpO1xuICAgICAgICBpZiAoY29sKSB7XG4gICAgICAgICAgICBjb25zdCBuZXdXaWR0aCA9IE1hdGgubWF4KDMwLCB3ICsgZHgpOyAvLyBNaW4gd2lkdGggMzBweFxuICAgICAgICAgICAgY29sLndpZHRoID0gYCR7bmV3V2lkdGh9cHhgO1xuICAgICAgICAgICAgdGguc3R5bGUud2lkdGggPSBjb2wud2lkdGg7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgY29uc3QgbW91c2VVcEhhbmRsZXIgPSAoKSA9PiB7XG4gICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIG1vdXNlTW92ZUhhbmRsZXIpO1xuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgbW91c2VVcEhhbmRsZXIpO1xuICAgICAgICByZXNpemVyLmNsYXNzTGlzdC5yZW1vdmUoJ3Jlc2l6aW5nJyk7XG4gICAgfTtcblxuICAgIHJlc2l6ZXIuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgbW91c2VEb3duSGFuZGxlcik7XG59XG5cblxuYXN5bmMgZnVuY3Rpb24gbG9hZFByZWZlcmVuY2VzQW5kSW5pdCgpIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvYWRQcmVmZXJlbmNlcycgfSk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmcyA9IHJlc3BvbnNlLmRhdGEgYXMgUHJlZmVyZW5jZXM7XG4gICAgICAgICAgICBsb2NhbEN1c3RvbVN0cmF0ZWdpZXMgPSBwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdO1xuICAgICAgICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhsb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMb2FkT3B0aW9ucygpO1xuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMaXN0VGFibGUoKTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIHByZWZlcmVuY2VzXCIsIGUpO1xuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gbG9hZEN1c3RvbUdlbmVyYSgpIHtcbiAgICBjb25zdCBsaXN0Q29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2N1c3RvbS1nZW5lcmEtbGlzdCcpO1xuICAgIGlmICghbGlzdENvbnRhaW5lcikgcmV0dXJuO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2FkUHJlZmVyZW5jZXMnIH0pO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgICAgICAgY29uc3QgcHJlZnMgPSByZXNwb25zZS5kYXRhIGFzIFByZWZlcmVuY2VzO1xuICAgICAgICAgICAgcmVuZGVyQ3VzdG9tR2VuZXJhTGlzdChwcmVmcy5jdXN0b21HZW5lcmEgfHwge30pO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgY3VzdG9tIGdlbmVyYVwiLCBlKTtcbiAgICB9XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gU1RSQVRFR1kgQlVJTERFUiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIGdldEJ1aWx0SW5TdHJhdGVneUNvbmZpZyhpZDogc3RyaW5nKTogQ3VzdG9tU3RyYXRlZ3kgfCBudWxsIHtcbiAgICBjb25zdCBiYXNlOiBDdXN0b21TdHJhdGVneSA9IHtcbiAgICAgICAgaWQ6IGlkLFxuICAgICAgICBsYWJlbDogU1RSQVRFR0lFUy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpPy5sYWJlbCB8fCBpZCxcbiAgICAgICAgZmlsdGVyczogW10sXG4gICAgICAgIGdyb3VwaW5nUnVsZXM6IFtdLFxuICAgICAgICBzb3J0aW5nUnVsZXM6IFtdLFxuICAgICAgICBncm91cFNvcnRpbmdSdWxlczogW10sXG4gICAgICAgIGZhbGxiYWNrOiAnTWlzYycsXG4gICAgICAgIHNvcnRHcm91cHM6IGZhbHNlLFxuICAgICAgICBhdXRvUnVuOiBmYWxzZVxuICAgIH07XG5cbiAgICBzd2l0Y2ggKGlkKSB7XG4gICAgICAgIGNhc2UgJ2RvbWFpbic6XG4gICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAnZG9tYWluJywgdHJhbnNmb3JtOiAnc3RyaXBUbGQnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAnZG9tYWluJywgb3JkZXI6ICdhc2MnIH1dO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2RvbWFpbl9mdWxsJzpcbiAgICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAnZG9tYWluJywgdHJhbnNmb3JtOiAnbm9uZScsIGNvbG9yOiAncmFuZG9tJyB9XTtcbiAgICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAnZG9tYWluJywgb3JkZXI6ICdhc2MnIH1dO1xuICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICd0b3BpYyc6XG4gICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAnZ2VucmUnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnY29udGV4dCc6XG4gICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAnY29udGV4dCcsIGNvbG9yOiAncmFuZG9tJyB9XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdsaW5lYWdlJzpcbiAgICAgICAgICAgIGJhc2UuZ3JvdXBpbmdSdWxlcyA9IFt7IHNvdXJjZTogJ2ZpZWxkJywgdmFsdWU6ICdwYXJlbnRUaXRsZScsIGNvbG9yOiAncmFuZG9tJyB9XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdwaW5uZWQnOlxuICAgICAgICAgICAgIGJhc2Uuc29ydGluZ1J1bGVzID0gW3sgZmllbGQ6ICdwaW5uZWQnLCBvcmRlcjogJ2Rlc2MnIH1dO1xuICAgICAgICAgICAgIGJhc2UuZ3JvdXBpbmdSdWxlcyA9IFt7IHNvdXJjZTogJ2ZpZWxkJywgdmFsdWU6ICdwaW5uZWQnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3JlY2VuY3knOlxuICAgICAgICAgICAgYmFzZS5zb3J0aW5nUnVsZXMgPSBbeyBmaWVsZDogJ2xhc3RBY2Nlc3NlZCcsIG9yZGVyOiAnZGVzYycgfV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnYWdlJzpcbiAgICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAnbGFzdEFjY2Vzc2VkJywgb3JkZXI6ICdkZXNjJyB9XTtcbiAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndXJsJzpcbiAgICAgICAgICAgIGJhc2Uuc29ydGluZ1J1bGVzID0gW3sgZmllbGQ6ICd1cmwnLCBvcmRlcjogJ2FzYycgfV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndGl0bGUnOlxuICAgICAgICAgICAgYmFzZS5zb3J0aW5nUnVsZXMgPSBbeyBmaWVsZDogJ3RpdGxlJywgb3JkZXI6ICdhc2MnIH1dO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ25lc3RpbmcnOlxuICAgICAgICAgICAgIGJhc2Uuc29ydGluZ1J1bGVzID0gW3sgZmllbGQ6ICdwYXJlbnRUaXRsZScsIG9yZGVyOiAnYXNjJyB9XTtcbiAgICAgICAgICAgICBicmVhaztcbiAgICB9XG5cbiAgICByZXR1cm4gYmFzZTtcbn1cblxuY29uc3QgRklFTERfT1BUSU9OUyA9IGBcbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwidXJsXCI+VVJMPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInRpdGxlXCI+VGl0bGU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZG9tYWluXCI+RG9tYWluPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInN1YmRvbWFpblwiPlN1YmRvbWFpbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJpZFwiPklEPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImluZGV4XCI+SW5kZXg8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwid2luZG93SWRcIj5XaW5kb3cgSUQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZ3JvdXBJZFwiPkdyb3VwIElEPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImFjdGl2ZVwiPkFjdGl2ZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzZWxlY3RlZFwiPlNlbGVjdGVkPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInBpbm5lZFwiPlBpbm5lZDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzdGF0dXNcIj5TdGF0dXM8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwib3BlbmVyVGFiSWRcIj5PcGVuZXIgSUQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwicGFyZW50VGl0bGVcIj5QYXJlbnQgVGl0bGU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibGFzdEFjY2Vzc2VkXCI+TGFzdCBBY2Nlc3NlZDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJnZW5yZVwiPkdlbnJlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHRcIj5Db250ZXh0IFN1bW1hcnk8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuc2l0ZU5hbWVcIj5TaXRlIE5hbWU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuY2Fub25pY2FsVXJsXCI+Q2Fub25pY2FsIFVSTDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5ub3JtYWxpemVkVXJsXCI+Tm9ybWFsaXplZCBVUkw8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEucGxhdGZvcm1cIj5QbGF0Zm9ybTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5vYmplY3RUeXBlXCI+T2JqZWN0IFR5cGU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEub2JqZWN0SWRcIj5PYmplY3QgSUQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEudGl0bGVcIj5FeHRyYWN0ZWQgVGl0bGU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuZGVzY3JpcHRpb25cIj5EZXNjcmlwdGlvbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5hdXRob3JPckNyZWF0b3JcIj5BdXRob3IvQ3JlYXRvcjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5wdWJsaXNoZWRBdFwiPlB1Ymxpc2hlZCBBdDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5tb2RpZmllZEF0XCI+TW9kaWZpZWQgQXQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEubGFuZ3VhZ2VcIj5MYW5ndWFnZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5pc0F1ZGlibGVcIj5JcyBBdWRpYmxlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLmlzTXV0ZWRcIj5JcyBNdXRlZDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5oYXNVbnNhdmVkQ2hhbmdlc0xpa2VseVwiPlVuc2F2ZWQgQ2hhbmdlczwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5pc0F1dGhlbnRpY2F0ZWRMaWtlbHlcIj5BdXRoZW50aWNhdGVkPC9vcHRpb24+YDtcblxuY29uc3QgT1BFUkFUT1JfT1BUSU9OUyA9IGBcbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGFpbnNcIj5jb250YWluczwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJkb2VzTm90Q29udGFpblwiPmRvZXMgbm90IGNvbnRhaW48L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibWF0Y2hlc1wiPm1hdGNoZXMgcmVnZXg8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZXF1YWxzXCI+ZXF1YWxzPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInN0YXJ0c1dpdGhcIj5zdGFydHMgd2l0aDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJlbmRzV2l0aFwiPmVuZHMgd2l0aDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJleGlzdHNcIj5leGlzdHM8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZG9lc05vdEV4aXN0XCI+ZG9lcyBub3QgZXhpc3Q8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiaXNOdWxsXCI+aXMgbnVsbDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJpc05vdE51bGxcIj5pcyBub3QgbnVsbDwvb3B0aW9uPmA7XG5cbmZ1bmN0aW9uIGluaXRTdHJhdGVneUJ1aWxkZXIoKSB7XG4gICAgY29uc3QgYWRkRmlsdGVyR3JvdXBCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWRkLWZpbHRlci1ncm91cC1idG4nKTtcbiAgICBjb25zdCBhZGRHcm91cEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhZGQtZ3JvdXAtYnRuJyk7XG4gICAgY29uc3QgYWRkU29ydEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhZGQtc29ydC1idG4nKTtcbiAgICBjb25zdCBsb2FkU2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0ZWd5LWxvYWQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQgfCBudWxsO1xuXG4gICAgLy8gTmV3OiBHcm91cCBTb3J0aW5nXG4gICAgY29uc3QgYWRkR3JvdXBTb3J0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FkZC1ncm91cC1zb3J0LWJ0bicpO1xuICAgIGNvbnN0IGdyb3VwU29ydENoZWNrID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LXNvcnRncm91cHMtY2hlY2snKTtcblxuICAgIGNvbnN0IHNhdmVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1zYXZlLWJ0bicpO1xuICAgIGNvbnN0IHJ1bkJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidWlsZGVyLXJ1bi1idG4nKTtcbiAgICBjb25zdCBydW5MaXZlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1aWxkZXItcnVuLWxpdmUtYnRuJyk7XG4gICAgY29uc3QgY2xlYXJCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1jbGVhci1idG4nKTtcblxuICAgIGNvbnN0IGV4cG9ydEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidWlsZGVyLWV4cG9ydC1idG4nKTtcbiAgICBjb25zdCBpbXBvcnRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1pbXBvcnQtYnRuJyk7XG5cbiAgICBpZiAoZXhwb3J0QnRuKSBleHBvcnRCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBleHBvcnRCdWlsZGVyU3RyYXRlZ3kpO1xuICAgIGlmIChpbXBvcnRCdG4pIGltcG9ydEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGltcG9ydEJ1aWxkZXJTdHJhdGVneSk7XG5cbiAgICBpZiAoYWRkRmlsdGVyR3JvdXBCdG4pIGFkZEZpbHRlckdyb3VwQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gYWRkRmlsdGVyR3JvdXBSb3coKSk7XG4gICAgaWYgKGFkZEdyb3VwQnRuKSBhZGRHcm91cEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGFkZEJ1aWxkZXJSb3coJ2dyb3VwJykpO1xuICAgIGlmIChhZGRTb3J0QnRuKSBhZGRTb3J0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gYWRkQnVpbGRlclJvdygnc29ydCcpKTtcbiAgICBpZiAoYWRkR3JvdXBTb3J0QnRuKSBhZGRHcm91cFNvcnRCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBhZGRCdWlsZGVyUm93KCdncm91cFNvcnQnKSk7XG5cbiAgICBpZiAoZ3JvdXBTb3J0Q2hlY2spIHtcbiAgICAgICAgZ3JvdXBTb3J0Q2hlY2suYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKGUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNoZWNrZWQgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZDtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdncm91cC1zb3J0LXJvd3MtY29udGFpbmVyJyk7XG4gICAgICAgICAgICBjb25zdCBhZGRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWRkLWdyb3VwLXNvcnQtYnRuJyk7XG4gICAgICAgICAgICBpZiAoY29udGFpbmVyICYmIGFkZEJ0bikge1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gY2hlY2tlZCA/ICdibG9jaycgOiAnbm9uZSc7XG4gICAgICAgICAgICAgICAgYWRkQnRuLnN0eWxlLmRpc3BsYXkgPSBjaGVja2VkID8gJ2Jsb2NrJyA6ICdub25lJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKHNhdmVCdG4pIHNhdmVCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBzYXZlQ3VzdG9tU3RyYXRlZ3lGcm9tQnVpbGRlcih0cnVlKSk7XG4gICAgaWYgKHJ1bkJ0bikgcnVuQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgcnVuQnVpbGRlclNpbXVsYXRpb24pO1xuICAgIGlmIChydW5MaXZlQnRuKSBydW5MaXZlQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgcnVuQnVpbGRlckxpdmUpO1xuICAgIGlmIChjbGVhckJ0bikgY2xlYXJCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjbGVhckJ1aWxkZXIpO1xuXG4gICAgaWYgKGxvYWRTZWxlY3QpIHtcbiAgICAgICAgbG9hZFNlbGVjdC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBzZWxlY3RlZElkID0gbG9hZFNlbGVjdC52YWx1ZTtcbiAgICAgICAgICAgIGlmICghc2VsZWN0ZWRJZCkgcmV0dXJuO1xuXG4gICAgICAgICAgICBsZXQgc3RyYXQgPSBsb2NhbEN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHNlbGVjdGVkSWQpO1xuICAgICAgICAgICAgaWYgKCFzdHJhdCkge1xuICAgICAgICAgICAgICAgIHN0cmF0ID0gZ2V0QnVpbHRJblN0cmF0ZWd5Q29uZmlnKHNlbGVjdGVkSWQpIHx8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHN0cmF0KSB7XG4gICAgICAgICAgICAgICAgcG9wdWxhdGVCdWlsZGVyRnJvbVN0cmF0ZWd5KHN0cmF0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gSW5pdGlhbCBMaXZlIFZpZXdcbiAgICByZW5kZXJMaXZlVmlldygpO1xuICAgIGNvbnN0IHJlZnJlc2hMaXZlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3JlZnJlc2gtbGl2ZS12aWV3LWJ0bicpO1xuICAgIGlmIChyZWZyZXNoTGl2ZUJ0bikgcmVmcmVzaExpdmVCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCByZW5kZXJMaXZlVmlldyk7XG5cbiAgICBjb25zdCBsaXZlQ29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xpdmUtdmlldy1jb250YWluZXInKTtcbiAgICBpZiAobGl2ZUNvbnRhaW5lcikge1xuICAgICAgICBsaXZlQ29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgaXRlbSA9IHRhcmdldC5jbG9zZXN0KCcuc2VsZWN0YWJsZS1pdGVtJykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgICAgICBpZiAoIWl0ZW0pIHJldHVybjtcblxuICAgICAgICAgICAgY29uc3QgdHlwZSA9IGl0ZW0uZGF0YXNldC50eXBlO1xuICAgICAgICAgICAgY29uc3QgaWQgPSBOdW1iZXIoaXRlbS5kYXRhc2V0LmlkKTtcbiAgICAgICAgICAgIGlmICghdHlwZSB8fCBpc05hTihpZCkpIHJldHVybjtcblxuICAgICAgICAgICAgaWYgKHR5cGUgPT09ICd0YWInKSB7XG4gICAgICAgICAgICAgICAgaWYgKHNpbXVsYXRlZFNlbGVjdGlvbi5oYXMoaWQpKSBzaW11bGF0ZWRTZWxlY3Rpb24uZGVsZXRlKGlkKTtcbiAgICAgICAgICAgICAgICBlbHNlIHNpbXVsYXRlZFNlbGVjdGlvbi5hZGQoaWQpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnZ3JvdXAnKSB7XG4gICAgICAgICAgICAgICAgLy8gVG9nZ2xlIGFsbCB0YWJzIGluIGdyb3VwXG4gICAgICAgICAgICAgICAgLy8gV2UgbmVlZCB0byBrbm93IHdoaWNoIHRhYnMgYXJlIGluIHRoZSBncm91cC5cbiAgICAgICAgICAgICAgICAvLyBXZSBjYW4gZmluZCB0aGVtIGluIERPTSBvciByZWZldGNoLiBET00gaXMgZWFzaWVyLlxuICAgICAgICAgICAgICAgIC8vIE9yIGJldHRlciwgbG9naWMgaW4gcmVuZGVyTGl2ZVZpZXcgaGFuZGxlcyByZW5kZXJpbmcsIGhlcmUgd2UgaGFuZGxlIGRhdGEuXG4gICAgICAgICAgICAgICAgLy8gTGV0J3MgcmVseSBvbiBET00gc3RydWN0dXJlIG9yIHJlLXF1ZXJ5LlxuICAgICAgICAgICAgICAgIC8vIFJlLXF1ZXJ5aW5nIGlzIHJvYnVzdC5cbiAgICAgICAgICAgICAgICBjaHJvbWUudGFicy5xdWVyeSh7fSkudGhlbih0YWJzID0+IHtcbiAgICAgICAgICAgICAgICAgICBjb25zdCBncm91cFRhYnMgPSB0YWJzLmZpbHRlcih0ID0+IHQuZ3JvdXBJZCA9PT0gaWQpO1xuICAgICAgICAgICAgICAgICAgIGNvbnN0IGFsbFNlbGVjdGVkID0gZ3JvdXBUYWJzLmV2ZXJ5KHQgPT4gdC5pZCAmJiBzaW11bGF0ZWRTZWxlY3Rpb24uaGFzKHQuaWQpKTtcbiAgICAgICAgICAgICAgICAgICBncm91cFRhYnMuZm9yRWFjaCh0ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgaWYgKHQuaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhbGxTZWxlY3RlZCkgc2ltdWxhdGVkU2VsZWN0aW9uLmRlbGV0ZSh0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2Ugc2ltdWxhdGVkU2VsZWN0aW9uLmFkZCh0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgIHJlbmRlckxpdmVWaWV3KCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuOyAvLyBhc3luYyB1cGRhdGVcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3dpbmRvdycpIHtcbiAgICAgICAgICAgICAgICBjaHJvbWUudGFicy5xdWVyeSh7fSkudGhlbih0YWJzID0+IHtcbiAgICAgICAgICAgICAgICAgICBjb25zdCB3aW5UYWJzID0gdGFicy5maWx0ZXIodCA9PiB0LndpbmRvd0lkID09PSBpZCk7XG4gICAgICAgICAgICAgICAgICAgY29uc3QgYWxsU2VsZWN0ZWQgPSB3aW5UYWJzLmV2ZXJ5KHQgPT4gdC5pZCAmJiBzaW11bGF0ZWRTZWxlY3Rpb24uaGFzKHQuaWQpKTtcbiAgICAgICAgICAgICAgICAgICB3aW5UYWJzLmZvckVhY2godCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgIGlmICh0LmlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYWxsU2VsZWN0ZWQpIHNpbXVsYXRlZFNlbGVjdGlvbi5kZWxldGUodC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlIHNpbXVsYXRlZFNlbGVjdGlvbi5hZGQodC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICByZW5kZXJMaXZlVmlldygpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybjsgLy8gYXN5bmMgdXBkYXRlXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJlbmRlckxpdmVWaWV3KCk7XG4gICAgICAgIH0pO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gYWRkRmlsdGVyR3JvdXBSb3coY29uZGl0aW9ucz86IFJ1bGVDb25kaXRpb25bXSkge1xuICAgIGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmaWx0ZXItcm93cy1jb250YWluZXInKTtcbiAgICBpZiAoIWNvbnRhaW5lcikgcmV0dXJuO1xuXG4gICAgY29uc3QgZ3JvdXBEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBncm91cERpdi5jbGFzc05hbWUgPSAnZmlsdGVyLWdyb3VwLXJvdyc7XG5cbiAgICBncm91cERpdi5pbm5lckhUTUwgPSBgXG4gICAgICAgIDxkaXYgY2xhc3M9XCJmaWx0ZXItZ3JvdXAtaGVhZGVyXCI+XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cImZpbHRlci1ncm91cC10aXRsZVwiPkdyb3VwIChBTkQpPC9zcGFuPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInNtYWxsLWJ0biBidG4tZGVsLWdyb3VwXCI+RGVsZXRlIEdyb3VwPC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwiY29uZGl0aW9ucy1jb250YWluZXJcIj48L2Rpdj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInNtYWxsLWJ0biBidG4tYWRkLWNvbmRpdGlvblwiPisgQWRkIENvbmRpdGlvbjwvYnV0dG9uPlxuICAgIGA7XG5cbiAgICBncm91cERpdi5xdWVyeVNlbGVjdG9yKCcuYnRuLWRlbC1ncm91cCcpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgZ3JvdXBEaXYucmVtb3ZlKCk7XG4gICAgICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbmRpdGlvbnNDb250YWluZXIgPSBncm91cERpdi5xdWVyeVNlbGVjdG9yKCcuY29uZGl0aW9ucy1jb250YWluZXInKSBhcyBIVE1MRWxlbWVudDtcbiAgICBjb25zdCBhZGRDb25kaXRpb25CdG4gPSBncm91cERpdi5xdWVyeVNlbGVjdG9yKCcuYnRuLWFkZC1jb25kaXRpb24nKTtcblxuICAgIGNvbnN0IGFkZENvbmRpdGlvbiA9IChkYXRhPzogUnVsZUNvbmRpdGlvbikgPT4ge1xuICAgICAgICBjb25zdCBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgZGl2LmNsYXNzTmFtZSA9ICdidWlsZGVyLXJvdyBjb25kaXRpb24tcm93JztcbiAgICAgICAgZGl2LnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG4gICAgICAgIGRpdi5zdHlsZS5nYXAgPSAnNXB4JztcbiAgICAgICAgZGl2LnN0eWxlLm1hcmdpbkJvdHRvbSA9ICc1cHgnO1xuICAgICAgICBkaXYuc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xuXG4gICAgICAgIGRpdi5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwiZmllbGQtc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgJHtGSUVMRF9PUFRJT05TfVxuICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cIm9wZXJhdG9yLWNvbnRhaW5lclwiPlxuICAgICAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJvcGVyYXRvci1zZWxlY3RcIj5cbiAgICAgICAgICAgICAgICAgICAgJHtPUEVSQVRPUl9PUFRJT05TfVxuICAgICAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJ2YWx1ZS1jb250YWluZXJcIj5cbiAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cInZhbHVlLWlucHV0XCIgcGxhY2Vob2xkZXI9XCJWYWx1ZVwiPlxuICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInNtYWxsLWJ0biBidG4tZGVsLWNvbmRpdGlvblwiIHN0eWxlPVwiYmFja2dyb3VuZDogbm9uZTsgYm9yZGVyOiBub25lOyBjb2xvcjogcmVkO1wiPiZ0aW1lczs8L2J1dHRvbj5cbiAgICAgICAgYDtcblxuICAgICAgICBjb25zdCBmaWVsZFNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IG9wZXJhdG9yQ29udGFpbmVyID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5vcGVyYXRvci1jb250YWluZXInKSBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgY29uc3QgdmFsdWVDb250YWluZXIgPSBkaXYucXVlcnlTZWxlY3RvcignLnZhbHVlLWNvbnRhaW5lcicpIGFzIEhUTUxFbGVtZW50O1xuXG4gICAgICAgIGNvbnN0IHVwZGF0ZVN0YXRlID0gKGluaXRpYWxPcD86IHN0cmluZywgaW5pdGlhbFZhbD86IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgY29uc3QgdmFsID0gZmllbGRTZWxlY3QudmFsdWU7XG4gICAgICAgICAgICAvLyBIYW5kbGUgYm9vbGVhbiBmaWVsZHNcbiAgICAgICAgICAgIGlmIChbJ3NlbGVjdGVkJywgJ3Bpbm5lZCddLmluY2x1ZGVzKHZhbCkpIHtcbiAgICAgICAgICAgICAgICBvcGVyYXRvckNvbnRhaW5lci5pbm5lckhUTUwgPSBgPHNlbGVjdCBjbGFzcz1cIm9wZXJhdG9yLXNlbGVjdFwiIGRpc2FibGVkIHN0eWxlPVwiYmFja2dyb3VuZDogI2VlZTsgY29sb3I6ICM1NTU7XCI+PG9wdGlvbiB2YWx1ZT1cImVxdWFsc1wiPmlzPC9vcHRpb24+PC9zZWxlY3Q+YDtcbiAgICAgICAgICAgICAgICB2YWx1ZUNvbnRhaW5lci5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJ2YWx1ZS1pbnB1dFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInRydWVcIj5UcnVlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZmFsc2VcIj5GYWxzZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgICAgICBgO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiBhbHJlYWR5IGluIHN0YW5kYXJkIG1vZGUgdG8gYXZvaWQgdW5uZWNlc3NhcnkgRE9NIHRocmFzaGluZ1xuICAgICAgICAgICAgICAgIGlmICghb3BlcmF0b3JDb250YWluZXIucXVlcnlTZWxlY3Rvcignc2VsZWN0Om5vdChbZGlzYWJsZWRdKScpKSB7XG4gICAgICAgICAgICAgICAgICAgIG9wZXJhdG9yQ29udGFpbmVyLmlubmVySFRNTCA9IGA8c2VsZWN0IGNsYXNzPVwib3BlcmF0b3Itc2VsZWN0XCI+JHtPUEVSQVRPUl9PUFRJT05TfTwvc2VsZWN0PmA7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlQ29udGFpbmVyLmlubmVySFRNTCA9IGA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cInZhbHVlLWlucHV0XCIgcGxhY2Vob2xkZXI9XCJWYWx1ZVwiPmA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBSZXN0b3JlIHZhbHVlcyBpZiBwcm92aWRlZCAoZXNwZWNpYWxseSB3aGVuIHN3aXRjaGluZyBiYWNrIG9yIGluaXRpYWxpemluZylcbiAgICAgICAgICAgIGlmIChpbml0aWFsT3AgfHwgaW5pdGlhbFZhbCkge1xuICAgICAgICAgICAgICAgICBjb25zdCBvcEVsID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5vcGVyYXRvci1zZWxlY3QnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgIGNvbnN0IHZhbEVsID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgICAgICAgaWYgKG9wRWwgJiYgaW5pdGlhbE9wKSBvcEVsLnZhbHVlID0gaW5pdGlhbE9wO1xuICAgICAgICAgICAgICAgICBpZiAodmFsRWwgJiYgaW5pdGlhbFZhbCkgdmFsRWwudmFsdWUgPSBpbml0aWFsVmFsO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBSZS1hdHRhY2ggbGlzdGVuZXJzIHRvIG5ldyBlbGVtZW50c1xuICAgICAgICAgICAgZGl2LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0LCBzZWxlY3QnKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgICAgICAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB1cGRhdGVCcmVhZGNydW1iKTtcbiAgICAgICAgICAgICAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKCdpbnB1dCcsIHVwZGF0ZUJyZWFkY3J1bWIpO1xuICAgICAgICAgICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHVwZGF0ZUJyZWFkY3J1bWIpO1xuICAgICAgICAgICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgdXBkYXRlQnJlYWRjcnVtYik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBmaWVsZFNlbGVjdC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoKSA9PiB7XG4gICAgICAgICAgICB1cGRhdGVTdGF0ZSgpO1xuICAgICAgICAgICAgdXBkYXRlQnJlYWRjcnVtYigpO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoZGF0YSkge1xuICAgICAgICAgICAgZmllbGRTZWxlY3QudmFsdWUgPSBkYXRhLmZpZWxkO1xuICAgICAgICAgICAgdXBkYXRlU3RhdGUoZGF0YS5vcGVyYXRvciwgZGF0YS52YWx1ZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB1cGRhdGVTdGF0ZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgZGl2LnF1ZXJ5U2VsZWN0b3IoJy5idG4tZGVsLWNvbmRpdGlvbicpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgIGRpdi5yZW1vdmUoKTtcbiAgICAgICAgICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uZGl0aW9uc0NvbnRhaW5lci5hcHBlbmRDaGlsZChkaXYpO1xuICAgIH07XG5cbiAgICBhZGRDb25kaXRpb25CdG4/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gYWRkQ29uZGl0aW9uKCkpO1xuXG4gICAgaWYgKGNvbmRpdGlvbnMgJiYgY29uZGl0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbmRpdGlvbnMuZm9yRWFjaChjID0+IGFkZENvbmRpdGlvbihjKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gQWRkIG9uZSBlbXB0eSBjb25kaXRpb24gYnkgZGVmYXVsdFxuICAgICAgICBhZGRDb25kaXRpb24oKTtcbiAgICB9XG5cbiAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JvdXBEaXYpO1xuICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbn1cblxuZnVuY3Rpb24gYWRkQnVpbGRlclJvdyh0eXBlOiAnZ3JvdXAnIHwgJ3NvcnQnIHwgJ2dyb3VwU29ydCcsIGRhdGE/OiBhbnkpIHtcbiAgICBsZXQgY29udGFpbmVySWQgPSAnJztcbiAgICBpZiAodHlwZSA9PT0gJ2dyb3VwJykgY29udGFpbmVySWQgPSAnZ3JvdXAtcm93cy1jb250YWluZXInO1xuICAgIGVsc2UgaWYgKHR5cGUgPT09ICdzb3J0JykgY29udGFpbmVySWQgPSAnc29ydC1yb3dzLWNvbnRhaW5lcic7XG4gICAgZWxzZSBpZiAodHlwZSA9PT0gJ2dyb3VwU29ydCcpIGNvbnRhaW5lcklkID0gJ2dyb3VwLXNvcnQtcm93cy1jb250YWluZXInO1xuXG4gICAgY29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY29udGFpbmVySWQpO1xuICAgIGlmICghY29udGFpbmVyKSByZXR1cm47XG5cbiAgICBjb25zdCBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBkaXYuY2xhc3NOYW1lID0gJ2J1aWxkZXItcm93JztcbiAgICBkaXYuZGF0YXNldC50eXBlID0gdHlwZTtcblxuICAgIGlmICh0eXBlID09PSAnZ3JvdXAnKSB7XG4gICAgICAgIGRpdi5zdHlsZS5mbGV4V3JhcCA9ICd3cmFwJztcbiAgICAgICAgZGl2LmlubmVySFRNTCA9IGBcbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwicm93LW51bWJlclwiPjwvc3Bhbj5cbiAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJzb3VyY2Utc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImZpZWxkXCI+RmllbGQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZml4ZWRcIj5GaXhlZCBWYWx1ZTwvb3B0aW9uPlxuICAgICAgICAgICAgPC9zZWxlY3Q+XG5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiaW5wdXQtY29udGFpbmVyXCI+XG4gICAgICAgICAgICAgICAgIDwhLS0gV2lsbCBiZSBwb3B1bGF0ZWQgYmFzZWQgb24gc291cmNlIHNlbGVjdGlvbiAtLT5cbiAgICAgICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cImZpZWxkLXNlbGVjdCB2YWx1ZS1pbnB1dC1maWVsZFwiPlxuICAgICAgICAgICAgICAgICAgICAke0ZJRUxEX09QVElPTlN9XG4gICAgICAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cInZhbHVlLWlucHV0LXRleHRcIiBwbGFjZWhvbGRlcj1cIkdyb3VwIE5hbWVcIiBzdHlsZT1cImRpc3BsYXk6bm9uZTtcIj5cbiAgICAgICAgICAgIDwvc3Bhbj5cblxuICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJtYXJnaW4tbGVmdDogMTBweDtcIj5UcmFuc2Zvcm06PC9zcGFuPlxuICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cInRyYW5zZm9ybS1zZWxlY3RcIj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibm9uZVwiPk5vbmU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwic3RyaXBUbGRcIj5TdHJpcCBUTEQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZG9tYWluXCI+R2V0IERvbWFpbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJob3N0bmFtZVwiPkdldCBIb3N0bmFtZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJsb3dlcmNhc2VcIj5Mb3dlcmNhc2U8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwidXBwZXJjYXNlXCI+VXBwZXJjYXNlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImZpcnN0Q2hhclwiPkZpcnN0IENoYXI8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwicmVnZXhcIj5SZWdleCBFeHRyYWN0aW9uPC9vcHRpb24+XG4gICAgICAgICAgICA8L3NlbGVjdD5cblxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJlZ2V4LWNvbnRhaW5lclwiIHN0eWxlPVwiZGlzcGxheTpub25lOyBmbGV4LWJhc2lzOiAxMDAlOyBtYXJnaW4tdG9wOiA4cHg7IHBhZGRpbmc6IDhweDsgYmFja2dyb3VuZDogI2Y4ZjlmYTsgYm9yZGVyOiAxcHggZGFzaGVkICNjZWQ0ZGE7IGJvcmRlci1yYWRpdXM6IDRweDtcIj5cbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZ2FwOiA4cHg7IG1hcmdpbi1ib3R0b206IDVweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJmb250LXdlaWdodDogNTAwOyBmb250LXNpemU6IDAuOWVtO1wiPlBhdHRlcm46PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cInRyYW5zZm9ybS1wYXR0ZXJuXCIgcGxhY2Vob2xkZXI9XCJlLmcuIF4oXFx3KyktKFxcZCspJFwiIHN0eWxlPVwiZmxleDoxO1wiPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiB0aXRsZT1cIkNhcHR1cmVzIGFsbCBncm91cHMgYW5kIGNvbmNhdGVuYXRlcyB0aGVtLiBJZiBubyBtYXRjaCwgcmVzdWx0IGlzIGVtcHR5LiBFeGFtcGxlOiAndXNlci0oXFxkKyknIGV4dHJhY3RzICcxMjMnIGZyb20gJ3VzZXItMTIzJy5cIiBzdHlsZT1cImN1cnNvcjogaGVscDsgY29sb3I6ICMwMDdiZmY7IGZvbnQtd2VpZ2h0OiBib2xkOyBiYWNrZ3JvdW5kOiAjZTdmMWZmOyB3aWR0aDogMThweDsgaGVpZ2h0OiAxOHB4OyBkaXNwbGF5OiBpbmxpbmUtZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsganVzdGlmeS1jb250ZW50OiBjZW50ZXI7IGJvcmRlci1yYWRpdXM6IDUwJTsgZm9udC1zaXplOiAxMnB4O1wiPj88L3NwYW4+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGdhcDogOHB4OyBhbGlnbi1pdGVtczogY2VudGVyOyBmb250LXNpemU6IDAuOWVtO1wiPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImZvbnQtd2VpZ2h0OiA1MDA7XCI+VGVzdDo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIGNsYXNzPVwicmVnZXgtdGVzdC1pbnB1dFwiIHBsYWNlaG9sZGVyPVwiVGVzdCBTdHJpbmdcIiBzdHlsZT1cImZsZXg6IDE7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuPiZyYXJyOzwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJyZWdleC10ZXN0LXJlc3VsdFwiIHN0eWxlPVwiZm9udC1mYW1pbHk6IG1vbm9zcGFjZTsgYmFja2dyb3VuZDogd2hpdGU7IHBhZGRpbmc6IDJweCA1cHg7IGJvcmRlcjogMXB4IHNvbGlkICNkZGQ7IGJvcmRlci1yYWRpdXM6IDNweDsgbWluLXdpZHRoOiA2MHB4O1wiPihwcmV2aWV3KTwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICA8c3BhbiBzdHlsZT1cIm1hcmdpbi1sZWZ0OiAxMHB4O1wiPldpbmRvdzo8L3NwYW4+XG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwid2luZG93LW1vZGUtc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImN1cnJlbnRcIj5DdXJyZW50PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbXBvdW5kXCI+Q29tcG91bmQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibmV3XCI+TmV3PC9vcHRpb24+XG4gICAgICAgICAgICA8L3NlbGVjdD5cblxuICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJtYXJnaW4tbGVmdDogMTBweDtcIj5Db2xvcjo8L3NwYW4+XG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwiY29sb3ItaW5wdXRcIj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZ3JleVwiPkdyZXk8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiYmx1ZVwiPkJsdWU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwicmVkXCI+UmVkPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInllbGxvd1wiPlllbGxvdzwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJncmVlblwiPkdyZWVuPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInBpbmtcIj5QaW5rPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInB1cnBsZVwiPlB1cnBsZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjeWFuXCI+Q3lhbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJvcmFuZ2VcIj5PcmFuZ2U8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibWF0Y2hcIj5NYXRjaCBWYWx1ZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJmaWVsZFwiPkNvbG9yIGJ5IEZpZWxkPC9vcHRpb24+XG4gICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJjb2xvci1maWVsZC1zZWxlY3RcIiBzdHlsZT1cImRpc3BsYXk6bm9uZTtcIj5cbiAgICAgICAgICAgICAgICAke0ZJRUxEX09QVElPTlN9XG4gICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiY29sb3ItdHJhbnNmb3JtLWNvbnRhaW5lclwiIHN0eWxlPVwiZGlzcGxheTpub25lOyBtYXJnaW4tbGVmdDogNXB4OyBhbGlnbi1pdGVtczogY2VudGVyO1wiPlxuICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZm9udC1zaXplOiAwLjllbTsgbWFyZ2luLXJpZ2h0OiAzcHg7XCI+VHJhbnM6PC9zcGFuPlxuICAgICAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJjb2xvci10cmFuc2Zvcm0tc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJub25lXCI+Tm9uZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwic3RyaXBUbGRcIj5TdHJpcCBUTEQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImRvbWFpblwiPkdldCBEb21haW48L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImhvc3RuYW1lXCI+R2V0IEhvc3RuYW1lPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJsb3dlcmNhc2VcIj5Mb3dlcmNhc2U8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInVwcGVyY2FzZVwiPlVwcGVyY2FzZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZmlyc3RDaGFyXCI+Rmlyc3QgQ2hhcjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwicmVnZXhcIj5SZWdleDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIGNsYXNzPVwiY29sb3ItdHJhbnNmb3JtLXBhdHRlcm5cIiBwbGFjZWhvbGRlcj1cIlJlZ2V4XCIgc3R5bGU9XCJkaXNwbGF5Om5vbmU7IHdpZHRoOiA4MHB4OyBtYXJnaW4tbGVmdDogM3B4O1wiPlxuICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgPGxhYmVsPjxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBjbGFzcz1cInJhbmRvbS1jb2xvci1jaGVja1wiIGNoZWNrZWQ+IFJhbmRvbTwvbGFiZWw+XG5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyb3ctYWN0aW9uc1wiPlxuICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJzbWFsbC1idG4gYnRuLWRlbFwiIHN0eWxlPVwiYmFja2dyb3VuZDogI2ZmY2NjYzsgY29sb3I6IGRhcmtyZWQ7XCI+RGVsZXRlPC9idXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgYDtcblxuICAgICAgICAvLyBBZGQgc3BlY2lmaWMgbGlzdGVuZXJzIGZvciBHcm91cCByb3dcbiAgICAgICAgY29uc3Qgc291cmNlU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5zb3VyY2Utc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IGZpZWxkU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC1maWVsZCcpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICBjb25zdCB0ZXh0SW5wdXQgPSBkaXYucXVlcnlTZWxlY3RvcignLnZhbHVlLWlucHV0LXRleHQnKSBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JJbnB1dCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuY29sb3ItaW5wdXQnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JGaWVsZFNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuY29sb3ItZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IGNvbG9yVHJhbnNmb3JtQ29udGFpbmVyID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci10cmFuc2Zvcm0tY29udGFpbmVyJykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IGNvbG9yVHJhbnNmb3JtU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci10cmFuc2Zvcm0tc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IGNvbG9yVHJhbnNmb3JtUGF0dGVybiA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuY29sb3ItdHJhbnNmb3JtLXBhdHRlcm4nKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICBjb25zdCByYW5kb21DaGVjayA9IGRpdi5xdWVyeVNlbGVjdG9yKCcucmFuZG9tLWNvbG9yLWNoZWNrJykgYXMgSFRNTElucHV0RWxlbWVudDtcblxuICAgICAgICAvLyBSZWdleCBMb2dpY1xuICAgICAgICBjb25zdCB0cmFuc2Zvcm1TZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLnRyYW5zZm9ybS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgY29uc3QgcmVnZXhDb250YWluZXIgPSBkaXYucXVlcnlTZWxlY3RvcignLnJlZ2V4LWNvbnRhaW5lcicpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICBjb25zdCBwYXR0ZXJuSW5wdXQgPSBkaXYucXVlcnlTZWxlY3RvcignLnRyYW5zZm9ybS1wYXR0ZXJuJykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgY29uc3QgdGVzdElucHV0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5yZWdleC10ZXN0LWlucHV0JykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgY29uc3QgdGVzdFJlc3VsdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcucmVnZXgtdGVzdC1yZXN1bHQnKSBhcyBIVE1MRWxlbWVudDtcblxuICAgICAgICBjb25zdCB0b2dnbGVUcmFuc2Zvcm0gPSAoKSA9PiB7XG4gICAgICAgICAgICBpZiAodHJhbnNmb3JtU2VsZWN0LnZhbHVlID09PSAncmVnZXgnKSB7XG4gICAgICAgICAgICAgICAgcmVnZXhDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlZ2V4Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG4gICAgICAgIH07XG4gICAgICAgIHRyYW5zZm9ybVNlbGVjdC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB0b2dnbGVUcmFuc2Zvcm0pO1xuXG4gICAgICAgIGNvbnN0IHVwZGF0ZVRlc3QgPSAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwYXQgPSBwYXR0ZXJuSW5wdXQudmFsdWU7XG4gICAgICAgICAgICBjb25zdCB0eHQgPSB0ZXN0SW5wdXQudmFsdWU7XG4gICAgICAgICAgICBpZiAoIXBhdCB8fCAhdHh0KSB7XG4gICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQudGV4dENvbnRlbnQgPSBcIihwcmV2aWV3KVwiO1xuICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnN0eWxlLmNvbG9yID0gXCIjNTU1XCI7XG4gICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHBhdCk7XG4gICAgICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSByZWdleC5leGVjKHR4dCk7XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgICBsZXQgZXh0cmFjdGVkID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbWF0Y2gubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICBleHRyYWN0ZWQgKz0gbWF0Y2hbaV0gfHwgXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQudGV4dENvbnRlbnQgPSBleHRyYWN0ZWQgfHwgXCIoZW1wdHkgZ3JvdXApXCI7XG4gICAgICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnN0eWxlLmNvbG9yID0gXCJncmVlblwiO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnRleHRDb250ZW50ID0gXCIobm8gbWF0Y2gpXCI7XG4gICAgICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnN0eWxlLmNvbG9yID0gXCJyZWRcIjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgdGVzdFJlc3VsdC50ZXh0Q29udGVudCA9IFwiKGludmFsaWQgcmVnZXgpXCI7XG4gICAgICAgICAgICAgICAgdGVzdFJlc3VsdC5zdHlsZS5jb2xvciA9IFwicmVkXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHBhdHRlcm5JbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsICgpID0+IHsgdXBkYXRlVGVzdCgpOyB1cGRhdGVCcmVhZGNydW1iKCk7IH0pO1xuICAgICAgICB0ZXN0SW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCB1cGRhdGVUZXN0KTtcblxuXG4gICAgICAgIC8vIFRvZ2dsZSBpbnB1dCB0eXBlXG4gICAgICAgIGNvbnN0IHRvZ2dsZUlucHV0ID0gKCkgPT4ge1xuICAgICAgICAgICAgaWYgKHNvdXJjZVNlbGVjdC52YWx1ZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgIGZpZWxkU2VsZWN0LnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWJsb2NrJztcbiAgICAgICAgICAgICAgICB0ZXh0SW5wdXQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZmllbGRTZWxlY3Quc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgICAgICB0ZXh0SW5wdXQuc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUtYmxvY2snO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdXBkYXRlQnJlYWRjcnVtYigpO1xuICAgICAgICB9O1xuICAgICAgICBzb3VyY2VTZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgdG9nZ2xlSW5wdXQpO1xuXG4gICAgICAgIC8vIFRvZ2dsZSBjb2xvciB0cmFuc2Zvcm0gcGF0dGVyblxuICAgICAgICBjb25zdCB0b2dnbGVDb2xvclRyYW5zZm9ybSA9ICgpID0+IHtcbiAgICAgICAgICAgICBpZiAoY29sb3JUcmFuc2Zvcm1TZWxlY3QudmFsdWUgPT09ICdyZWdleCcpIHtcbiAgICAgICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuLnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWJsb2NrJztcbiAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICBjb2xvclRyYW5zZm9ybVBhdHRlcm4uc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgdXBkYXRlQnJlYWRjcnVtYigpO1xuICAgICAgICB9O1xuICAgICAgICBjb2xvclRyYW5zZm9ybVNlbGVjdC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB0b2dnbGVDb2xvclRyYW5zZm9ybSk7XG4gICAgICAgIGNvbG9yVHJhbnNmb3JtUGF0dGVybi5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIHVwZGF0ZUJyZWFkY3J1bWIpO1xuXG4gICAgICAgIC8vIFRvZ2dsZSBjb2xvciBpbnB1dFxuICAgICAgICBjb25zdCB0b2dnbGVDb2xvciA9ICgpID0+IHtcbiAgICAgICAgICAgIGlmIChyYW5kb21DaGVjay5jaGVja2VkKSB7XG4gICAgICAgICAgICAgICAgY29sb3JJbnB1dC5kaXNhYmxlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgY29sb3JJbnB1dC5zdHlsZS5vcGFjaXR5ID0gJzAuNSc7XG4gICAgICAgICAgICAgICAgY29sb3JGaWVsZFNlbGVjdC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbG9ySW5wdXQuZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBjb2xvcklucHV0LnN0eWxlLm9wYWNpdHkgPSAnMSc7XG4gICAgICAgICAgICAgICAgaWYgKGNvbG9ySW5wdXQudmFsdWUgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgY29sb3JGaWVsZFNlbGVjdC5zdHlsZS5kaXNwbGF5ID0gJ2lubGluZS1ibG9jayc7XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWZsZXgnO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yRmllbGRTZWxlY3Quc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm1Db250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHJhbmRvbUNoZWNrLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHRvZ2dsZUNvbG9yKTtcbiAgICAgICAgY29sb3JJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB0b2dnbGVDb2xvcik7XG4gICAgICAgIHRvZ2dsZUNvbG9yKCk7IC8vIGluaXRcblxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3NvcnQnIHx8IHR5cGUgPT09ICdncm91cFNvcnQnKSB7XG4gICAgICAgIGRpdi5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwiZmllbGQtc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgJHtGSUVMRF9PUFRJT05TfVxuICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwib3JkZXItc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImFzY1wiPmEgdG8geiAoYXNjKTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJkZXNjXCI+eiB0byBhIChkZXNjKTwvb3B0aW9uPlxuICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93LWFjdGlvbnNcIj5cbiAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInNtYWxsLWJ0biBidG4tZGVsXCIgc3R5bGU9XCJiYWNrZ3JvdW5kOiAjZmZjY2NjOyBjb2xvcjogZGFya3JlZDtcIj5EZWxldGU8L2J1dHRvbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICBgO1xuICAgIH1cblxuICAgIC8vIFBvcHVsYXRlIGRhdGEgaWYgcHJvdmlkZWQgKGZvciBlZGl0aW5nKVxuICAgIGlmIChkYXRhKSB7XG4gICAgICAgIGlmICh0eXBlID09PSAnZ3JvdXAnKSB7XG4gICAgICAgICAgICBjb25zdCBzb3VyY2VTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLnNvdXJjZS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC1maWVsZCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgdGV4dElucHV0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC10ZXh0JykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IHRyYW5zZm9ybVNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcudHJhbnNmb3JtLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgY29sb3JJbnB1dCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuY29sb3ItaW5wdXQnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IGNvbG9yRmllbGRTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLWZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgY29sb3JUcmFuc2Zvcm1TZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLXRyYW5zZm9ybS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IGNvbG9yVHJhbnNmb3JtUGF0dGVybiA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuY29sb3ItdHJhbnNmb3JtLXBhdHRlcm4nKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgcmFuZG9tQ2hlY2sgPSBkaXYucXVlcnlTZWxlY3RvcignLnJhbmRvbS1jb2xvci1jaGVjaycpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgICAgICBjb25zdCB3aW5kb3dNb2RlU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy53aW5kb3ctbW9kZS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcblxuICAgICAgICAgICAgaWYgKGRhdGEuc291cmNlKSBzb3VyY2VTZWxlY3QudmFsdWUgPSBkYXRhLnNvdXJjZTtcblxuICAgICAgICAgICAgLy8gVHJpZ2dlciB0b2dnbGUgdG8gc2hvdyBjb3JyZWN0IGlucHV0XG4gICAgICAgICAgICBzb3VyY2VTZWxlY3QuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScpKTtcblxuICAgICAgICAgICAgaWYgKGRhdGEuc291cmNlID09PSAnZmllbGQnKSB7XG4gICAgICAgICAgICAgICAgaWYgKGRhdGEudmFsdWUpIGZpZWxkU2VsZWN0LnZhbHVlID0gZGF0YS52YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKGRhdGEudmFsdWUpIHRleHRJbnB1dC52YWx1ZSA9IGRhdGEudmFsdWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChkYXRhLnRyYW5zZm9ybSkgdHJhbnNmb3JtU2VsZWN0LnZhbHVlID0gZGF0YS50cmFuc2Zvcm07XG4gICAgICAgICAgICBpZiAoZGF0YS50cmFuc2Zvcm1QYXR0ZXJuKSAoZGl2LnF1ZXJ5U2VsZWN0b3IoJy50cmFuc2Zvcm0tcGF0dGVybicpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gZGF0YS50cmFuc2Zvcm1QYXR0ZXJuO1xuXG4gICAgICAgICAgICAvLyBUcmlnZ2VyIHRvZ2dsZSBmb3IgcmVnZXggVUlcbiAgICAgICAgICAgIHRyYW5zZm9ybVNlbGVjdC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJykpO1xuXG4gICAgICAgICAgICBpZiAoZGF0YS53aW5kb3dNb2RlKSB3aW5kb3dNb2RlU2VsZWN0LnZhbHVlID0gZGF0YS53aW5kb3dNb2RlO1xuXG4gICAgICAgICAgICBpZiAoZGF0YS5jb2xvciAmJiBkYXRhLmNvbG9yICE9PSAncmFuZG9tJykge1xuICAgICAgICAgICAgICAgIHJhbmRvbUNoZWNrLmNoZWNrZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBjb2xvcklucHV0LnZhbHVlID0gZGF0YS5jb2xvcjtcbiAgICAgICAgICAgICAgICBpZiAoZGF0YS5jb2xvciA9PT0gJ2ZpZWxkJyAmJiBkYXRhLmNvbG9yRmllbGQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29sb3JGaWVsZFNlbGVjdC52YWx1ZSA9IGRhdGEuY29sb3JGaWVsZDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGEuY29sb3JUcmFuc2Zvcm0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICBjb2xvclRyYW5zZm9ybVNlbGVjdC52YWx1ZSA9IGRhdGEuY29sb3JUcmFuc2Zvcm07XG4gICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGEuY29sb3JUcmFuc2Zvcm1QYXR0ZXJuKSBjb2xvclRyYW5zZm9ybVBhdHRlcm4udmFsdWUgPSBkYXRhLmNvbG9yVHJhbnNmb3JtUGF0dGVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmFuZG9tQ2hlY2suY2hlY2tlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAgLy8gVHJpZ2dlciB0b2dnbGUgY29sb3JcbiAgICAgICAgICAgIHJhbmRvbUNoZWNrLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnKSk7XG4gICAgICAgICAgICBjb2xvclRyYW5zZm9ybVNlbGVjdC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJykpO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzb3J0JyB8fCB0eXBlID09PSAnZ3JvdXBTb3J0Jykge1xuICAgICAgICAgICAgIGlmIChkYXRhLmZpZWxkKSAoZGl2LnF1ZXJ5U2VsZWN0b3IoJy5maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgPSBkYXRhLmZpZWxkO1xuICAgICAgICAgICAgIGlmIChkYXRhLm9yZGVyKSAoZGl2LnF1ZXJ5U2VsZWN0b3IoJy5vcmRlci1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgPSBkYXRhLm9yZGVyO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gTGlzdGVuZXJzIChHZW5lcmFsKVxuICAgIGRpdi5xdWVyeVNlbGVjdG9yKCcuYnRuLWRlbCcpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgZGl2LnJlbW92ZSgpO1xuICAgICAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG4gICAgfSk7XG5cbiAgICAvLyBBTkQgLyBPUiBsaXN0ZW5lcnMgKFZpc3VhbCBtYWlubHksIG9yIGFwcGVuZGluZyBuZXcgcm93cylcbiAgICBkaXYucXVlcnlTZWxlY3RvcignLmJ0bi1hbmQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGFkZEJ1aWxkZXJSb3codHlwZSk7IC8vIEp1c3QgYWRkIGFub3RoZXIgcm93XG4gICAgfSk7XG5cbiAgICBkaXYucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQsIHNlbGVjdCcpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB1cGRhdGVCcmVhZGNydW1iKTtcbiAgICAgICAgZWwuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCB1cGRhdGVCcmVhZGNydW1iKTtcbiAgICB9KTtcblxuICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChkaXYpO1xuICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbn1cblxuZnVuY3Rpb24gY2xlYXJCdWlsZGVyKCkge1xuICAgIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtbmFtZScpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gJyc7XG4gICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1kZXNjJykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUgPSAnJztcblxuICAgIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtYXV0b3J1bicpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQgPSBmYWxzZTtcbiAgICAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LXNlcGFyYXRlLXdpbmRvdycpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQgPSBmYWxzZTtcblxuICAgIGNvbnN0IHNvcnRHcm91cHNDaGVjayA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtc29ydGdyb3Vwcy1jaGVjaycpIGFzIEhUTUxJbnB1dEVsZW1lbnQpO1xuICAgIGlmIChzb3J0R3JvdXBzQ2hlY2spIHtcbiAgICAgICAgc29ydEdyb3Vwc0NoZWNrLmNoZWNrZWQgPSBmYWxzZTtcbiAgICAgICAgLy8gVHJpZ2dlciBjaGFuZ2UgdG8gaGlkZSBjb250YWluZXJcbiAgICAgICAgc29ydEdyb3Vwc0NoZWNrLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnKSk7XG4gICAgfVxuXG4gICAgY29uc3QgbG9hZFNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdGVneS1sb2FkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgIGlmIChsb2FkU2VsZWN0KSBsb2FkU2VsZWN0LnZhbHVlID0gJyc7XG5cbiAgICBbJ2ZpbHRlci1yb3dzLWNvbnRhaW5lcicsICdncm91cC1yb3dzLWNvbnRhaW5lcicsICdzb3J0LXJvd3MtY29udGFpbmVyJywgJ2dyb3VwLXNvcnQtcm93cy1jb250YWluZXInXS5mb3JFYWNoKGlkID0+IHtcbiAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCk7XG4gICAgICAgIGlmIChlbCkgZWwuaW5uZXJIVE1MID0gJyc7XG4gICAgfSk7XG5cbiAgICBjb25zdCBidWlsZGVyUmVzdWx0cyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidWlsZGVyLXJlc3VsdHMnKTtcbiAgICBpZiAoYnVpbGRlclJlc3VsdHMpIGJ1aWxkZXJSZXN1bHRzLmlubmVySFRNTCA9ICcnO1xuXG4gICAgYWRkRmlsdGVyR3JvdXBSb3coKTsgLy8gUmVzZXQgd2l0aCBvbmUgZW1wdHkgZmlsdGVyIGdyb3VwXG4gICAgdXBkYXRlQnJlYWRjcnVtYigpO1xufVxuXG5mdW5jdGlvbiBleHBvcnRCdWlsZGVyU3RyYXRlZ3koKSB7XG4gICAgY29uc3Qgc3RyYXQgPSBnZXRCdWlsZGVyU3RyYXRlZ3koKTtcbiAgICBpZiAoIXN0cmF0KSB7XG4gICAgICAgIGFsZXJ0KFwiUGxlYXNlIGRlZmluZSBhIHN0cmF0ZWd5IHRvIGV4cG9ydCAoSUQgYW5kIExhYmVsIHJlcXVpcmVkKS5cIik7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbG9nSW5mbyhcIkV4cG9ydGluZyBzdHJhdGVneVwiLCB7IGlkOiBzdHJhdC5pZCB9KTtcbiAgICBjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkoc3RyYXQsIG51bGwsIDIpO1xuICAgIGNvbnN0IGNvbnRlbnQgPSBgXG4gICAgICAgIDxwPkNvcHkgdGhlIEpTT04gYmVsb3c6PC9wPlxuICAgICAgICA8dGV4dGFyZWEgc3R5bGU9XCJ3aWR0aDogMTAwJTsgaGVpZ2h0OiAzMDBweDsgZm9udC1mYW1pbHk6IG1vbm9zcGFjZTtcIj4ke2VzY2FwZUh0bWwoanNvbil9PC90ZXh0YXJlYT5cbiAgICBgO1xuICAgIHNob3dNb2RhbChcIkV4cG9ydCBTdHJhdGVneVwiLCBjb250ZW50KTtcbn1cblxuZnVuY3Rpb24gaW1wb3J0QnVpbGRlclN0cmF0ZWd5KCkge1xuICAgIGNvbnN0IGNvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBjb250ZW50LmlubmVySFRNTCA9IGBcbiAgICAgICAgPHA+UGFzdGUgU3RyYXRlZ3kgSlNPTiBiZWxvdzo8L3A+XG4gICAgICAgIDx0ZXh0YXJlYSBpZD1cImltcG9ydC1zdHJhdC1hcmVhXCIgc3R5bGU9XCJ3aWR0aDogMTAwJTsgaGVpZ2h0OiAyMDBweDsgZm9udC1mYW1pbHk6IG1vbm9zcGFjZTsgbWFyZ2luLWJvdHRvbTogMTBweDtcIj48L3RleHRhcmVhPlxuICAgICAgICA8YnV0dG9uIGlkPVwiaW1wb3J0LXN0cmF0LWNvbmZpcm1cIiBjbGFzcz1cInN1Y2Nlc3MtYnRuXCI+TG9hZDwvYnV0dG9uPlxuICAgIGA7XG5cbiAgICBjb25zdCBidG4gPSBjb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNpbXBvcnQtc3RyYXQtY29uZmlybScpO1xuICAgIGJ0bj8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHR4dCA9IChjb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNpbXBvcnQtc3RyYXQtYXJlYScpIGFzIEhUTUxUZXh0QXJlYUVsZW1lbnQpLnZhbHVlO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QganNvbiA9IEpTT04ucGFyc2UodHh0KTtcbiAgICAgICAgICAgIGlmICghanNvbi5pZCB8fCAhanNvbi5sYWJlbCkge1xuICAgICAgICAgICAgICAgIGFsZXJ0KFwiSW52YWxpZCBzdHJhdGVneTogSUQgYW5kIExhYmVsIGFyZSByZXF1aXJlZC5cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbG9nSW5mbyhcIkltcG9ydGluZyBzdHJhdGVneVwiLCB7IGlkOiBqc29uLmlkIH0pO1xuICAgICAgICAgICAgcG9wdWxhdGVCdWlsZGVyRnJvbVN0cmF0ZWd5KGpzb24pO1xuICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm1vZGFsLW92ZXJsYXknKT8ucmVtb3ZlKCk7XG4gICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgYWxlcnQoXCJJbnZhbGlkIEpTT046IFwiICsgZSk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHNob3dNb2RhbChcIkltcG9ydCBTdHJhdGVneVwiLCBjb250ZW50KTtcbn1cblxuZnVuY3Rpb24gZXhwb3J0QWxsU3RyYXRlZ2llcygpIHtcbiAgICBsb2dJbmZvKFwiRXhwb3J0aW5nIGFsbCBzdHJhdGVnaWVzXCIsIHsgY291bnQ6IGxvY2FsQ3VzdG9tU3RyYXRlZ2llcy5sZW5ndGggfSk7XG4gICAgY29uc3QganNvbiA9IEpTT04uc3RyaW5naWZ5KGxvY2FsQ3VzdG9tU3RyYXRlZ2llcywgbnVsbCwgMik7XG4gICAgY29uc3QgY29udGVudCA9IGBcbiAgICAgICAgPHA+Q29weSB0aGUgSlNPTiBiZWxvdyAoY29udGFpbnMgJHtsb2NhbEN1c3RvbVN0cmF0ZWdpZXMubGVuZ3RofSBzdHJhdGVnaWVzKTo8L3A+XG4gICAgICAgIDx0ZXh0YXJlYSBzdHlsZT1cIndpZHRoOiAxMDAlOyBoZWlnaHQ6IDMwMHB4OyBmb250LWZhbWlseTogbW9ub3NwYWNlO1wiPiR7ZXNjYXBlSHRtbChqc29uKX08L3RleHRhcmVhPlxuICAgIGA7XG4gICAgc2hvd01vZGFsKFwiRXhwb3J0IEFsbCBTdHJhdGVnaWVzXCIsIGNvbnRlbnQpO1xufVxuXG5mdW5jdGlvbiBpbXBvcnRBbGxTdHJhdGVnaWVzKCkge1xuICAgIGNvbnN0IGNvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBjb250ZW50LmlubmVySFRNTCA9IGBcbiAgICAgICAgPHA+UGFzdGUgU3RyYXRlZ3kgTGlzdCBKU09OIGJlbG93OjwvcD5cbiAgICAgICAgPHAgc3R5bGU9XCJmb250LXNpemU6IDAuOWVtOyBjb2xvcjogIzY2NjtcIj5Ob3RlOiBTdHJhdGVnaWVzIHdpdGggbWF0Y2hpbmcgSURzIHdpbGwgYmUgb3ZlcndyaXR0ZW4uPC9wPlxuICAgICAgICA8dGV4dGFyZWEgaWQ9XCJpbXBvcnQtYWxsLWFyZWFcIiBzdHlsZT1cIndpZHRoOiAxMDAlOyBoZWlnaHQ6IDIwMHB4OyBmb250LWZhbWlseTogbW9ub3NwYWNlOyBtYXJnaW4tYm90dG9tOiAxMHB4O1wiPjwvdGV4dGFyZWE+XG4gICAgICAgIDxidXR0b24gaWQ9XCJpbXBvcnQtYWxsLWNvbmZpcm1cIiBjbGFzcz1cInN1Y2Nlc3MtYnRuXCI+SW1wb3J0IEFsbDwvYnV0dG9uPlxuICAgIGA7XG5cbiAgICBjb25zdCBidG4gPSBjb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNpbXBvcnQtYWxsLWNvbmZpcm0nKTtcbiAgICBidG4/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgYXN5bmMgKCkgPT4ge1xuICAgICAgICBjb25zdCB0eHQgPSAoY29udGVudC5xdWVyeVNlbGVjdG9yKCcjaW1wb3J0LWFsbC1hcmVhJykgYXMgSFRNTFRleHRBcmVhRWxlbWVudCkudmFsdWU7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBqc29uID0gSlNPTi5wYXJzZSh0eHQpO1xuICAgICAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGpzb24pKSB7XG4gICAgICAgICAgICAgICAgYWxlcnQoXCJJbnZhbGlkIGZvcm1hdDogRXhwZWN0ZWQgYW4gYXJyYXkgb2Ygc3RyYXRlZ2llcy5cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBWYWxpZGF0ZSBpdGVtc1xuICAgICAgICAgICAgY29uc3QgaW52YWxpZCA9IGpzb24uZmluZChzID0+ICFzLmlkIHx8ICFzLmxhYmVsKTtcbiAgICAgICAgICAgIGlmIChpbnZhbGlkKSB7XG4gICAgICAgICAgICAgICAgYWxlcnQoXCJJbnZhbGlkIHN0cmF0ZWd5IGluIGxpc3Q6IG1pc3NpbmcgSUQgb3IgTGFiZWwuXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gTWVyZ2UgbG9naWMgKFVwc2VydClcbiAgICAgICAgICAgIGNvbnN0IHN0cmF0TWFwID0gbmV3IE1hcChsb2NhbEN1c3RvbVN0cmF0ZWdpZXMubWFwKHMgPT4gW3MuaWQsIHNdKSk7XG5cbiAgICAgICAgICAgIGxldCBjb3VudCA9IDA7XG4gICAgICAgICAgICBqc29uLmZvckVhY2goKHM6IEN1c3RvbVN0cmF0ZWd5KSA9PiB7XG4gICAgICAgICAgICAgICAgc3RyYXRNYXAuc2V0KHMuaWQsIHMpO1xuICAgICAgICAgICAgICAgIGNvdW50Kys7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgY29uc3QgbmV3U3RyYXRlZ2llcyA9IEFycmF5LmZyb20oc3RyYXRNYXAudmFsdWVzKCkpO1xuXG4gICAgICAgICAgICBsb2dJbmZvKFwiSW1wb3J0aW5nIGFsbCBzdHJhdGVnaWVzXCIsIHsgY291bnQ6IG5ld1N0cmF0ZWdpZXMubGVuZ3RoIH0pO1xuXG4gICAgICAgICAgICAvLyBTYXZlXG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3NhdmVQcmVmZXJlbmNlcycsXG4gICAgICAgICAgICAgICAgcGF5bG9hZDogeyBjdXN0b21TdHJhdGVnaWVzOiBuZXdTdHJhdGVnaWVzIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBVcGRhdGUgbG9jYWwgc3RhdGVcbiAgICAgICAgICAgIGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyA9IG5ld1N0cmF0ZWdpZXM7XG4gICAgICAgICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyk7XG5cbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TG9hZE9wdGlvbnMoKTtcbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TGlzdFRhYmxlKCk7XG4gICAgICAgICAgICByZW5kZXJBbGdvcml0aG1zVmlldygpO1xuXG4gICAgICAgICAgICBhbGVydChgSW1wb3J0ZWQgJHtjb3VudH0gc3RyYXRlZ2llcy5gKTtcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5tb2RhbC1vdmVybGF5Jyk/LnJlbW92ZSgpO1xuXG4gICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgYWxlcnQoXCJJbnZhbGlkIEpTT046IFwiICsgZSk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHNob3dNb2RhbChcIkltcG9ydCBBbGwgU3RyYXRlZ2llc1wiLCBjb250ZW50KTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlQnJlYWRjcnVtYigpIHtcbiAgICBjb25zdCBicmVhZGNydW1iID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0ZWd5LWJyZWFkY3J1bWInKTtcbiAgICBpZiAoIWJyZWFkY3J1bWIpIHJldHVybjtcblxuICAgIGxldCB0ZXh0ID0gJ0FsbCc7XG5cbiAgICAvLyBGaWx0ZXJzXG4gICAgY29uc3QgZmlsdGVycyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmaWx0ZXItcm93cy1jb250YWluZXInKT8ucXVlcnlTZWxlY3RvckFsbCgnLmJ1aWxkZXItcm93Jyk7XG4gICAgaWYgKGZpbHRlcnMgJiYgZmlsdGVycy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGZpbHRlcnMuZm9yRWFjaChyb3cgPT4ge1xuICAgICAgICAgICAgIGNvbnN0IGZpZWxkID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgIGNvbnN0IG9wID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcub3BlcmF0b3Itc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgIGNvbnN0IHZhbCA9IChyb3cucXVlcnlTZWxlY3RvcignLnZhbHVlLWlucHV0JykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgaWYgKHZhbCkgdGV4dCArPSBgID4gJHtmaWVsZH0gJHtvcH0gJHt2YWx9YDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gR3JvdXBzXG4gICAgY29uc3QgZ3JvdXBzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dyb3VwLXJvd3MtY29udGFpbmVyJyk/LnF1ZXJ5U2VsZWN0b3JBbGwoJy5idWlsZGVyLXJvdycpO1xuICAgIGlmIChncm91cHMgJiYgZ3JvdXBzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgZ3JvdXBzLmZvckVhY2gocm93ID0+IHtcbiAgICAgICAgICAgICBjb25zdCBzb3VyY2UgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5zb3VyY2Utc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgIGxldCB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgIGlmIChzb3VyY2UgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICAgdmFsID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQtZmllbGQnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgICAgIHRleHQgKz0gYCA+IEdyb3VwIGJ5IEZpZWxkOiAke3ZhbH1gO1xuICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgIHZhbCA9IChyb3cucXVlcnlTZWxlY3RvcignLnZhbHVlLWlucHV0LXRleHQnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICAgICAgdGV4dCArPSBgID4gR3JvdXAgYnkgTmFtZTogXCIke3ZhbH1cImA7XG4gICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBHcm91cCBTb3J0c1xuICAgIGNvbnN0IGdyb3VwU29ydHMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JvdXAtc29ydC1yb3dzLWNvbnRhaW5lcicpPy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKTtcbiAgICBpZiAoZ3JvdXBTb3J0cyAmJiBncm91cFNvcnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgZ3JvdXBTb3J0cy5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgICAgICBjb25zdCBmaWVsZCA9IChyb3cucXVlcnlTZWxlY3RvcignLmZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgIGNvbnN0IG9yZGVyID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcub3JkZXItc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgdGV4dCArPSBgID4gR3JvdXAgc29ydCBieSAke2ZpZWxkfSAoJHtvcmRlcn0pYDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gU29ydHNcbiAgICBjb25zdCBzb3J0cyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzb3J0LXJvd3MtY29udGFpbmVyJyk/LnF1ZXJ5U2VsZWN0b3JBbGwoJy5idWlsZGVyLXJvdycpO1xuICAgIGlmIChzb3J0cyAmJiBzb3J0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHNvcnRzLmZvckVhY2gocm93ID0+IHtcbiAgICAgICAgICAgICBjb25zdCBmaWVsZCA9IChyb3cucXVlcnlTZWxlY3RvcignLmZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICBjb25zdCBvcmRlciA9IChyb3cucXVlcnlTZWxlY3RvcignLm9yZGVyLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICB0ZXh0ICs9IGAgPiBTb3J0IGJ5ICR7ZmllbGR9ICgke29yZGVyfSlgO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBicmVhZGNydW1iLnRleHRDb250ZW50ID0gdGV4dDtcbn1cblxuZnVuY3Rpb24gZ2V0QnVpbGRlclN0cmF0ZWd5KGlnbm9yZVZhbGlkYXRpb246IGJvb2xlYW4gPSBmYWxzZSk6IEN1c3RvbVN0cmF0ZWd5IHwgbnVsbCB7XG4gICAgY29uc3QgaWRJbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1uYW1lJykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICBjb25zdCBsYWJlbElucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LWRlc2MnKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuXG4gICAgbGV0IGlkID0gaWRJbnB1dCA/IGlkSW5wdXQudmFsdWUudHJpbSgpIDogJyc7XG4gICAgbGV0IGxhYmVsID0gbGFiZWxJbnB1dCA/IGxhYmVsSW5wdXQudmFsdWUudHJpbSgpIDogJyc7XG4gICAgY29uc3QgZmFsbGJhY2sgPSAnTWlzYyc7IC8vIEZhbGxiYWNrIHJlbW92ZWQgZnJvbSBVSSwgZGVmYXVsdCB0byBNaXNjXG4gICAgY29uc3Qgc29ydEdyb3VwcyA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtc29ydGdyb3Vwcy1jaGVjaycpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQ7XG5cbiAgICBpZiAoIWlnbm9yZVZhbGlkYXRpb24gJiYgKCFpZCB8fCAhbGFiZWwpKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGlmIChpZ25vcmVWYWxpZGF0aW9uKSB7XG4gICAgICAgIGlmICghaWQpIGlkID0gJ3RlbXBfc2ltX2lkJztcbiAgICAgICAgaWYgKCFsYWJlbCkgbGFiZWwgPSAnU2ltdWxhdGlvbic7XG4gICAgfVxuXG4gICAgY29uc3QgZmlsdGVyR3JvdXBzOiBSdWxlQ29uZGl0aW9uW11bXSA9IFtdO1xuICAgIGNvbnN0IGZpbHRlckNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmaWx0ZXItcm93cy1jb250YWluZXInKTtcblxuICAgIC8vIFBhcnNlIGZpbHRlciBncm91cHNcbiAgICBpZiAoZmlsdGVyQ29udGFpbmVyKSB7XG4gICAgICAgIGNvbnN0IGdyb3VwUm93cyA9IGZpbHRlckNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcuZmlsdGVyLWdyb3VwLXJvdycpO1xuICAgICAgICBpZiAoZ3JvdXBSb3dzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGdyb3VwUm93cy5mb3JFYWNoKGdyb3VwUm93ID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjb25kaXRpb25zOiBSdWxlQ29uZGl0aW9uW10gPSBbXTtcbiAgICAgICAgICAgICAgICBncm91cFJvdy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKS5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpZWxkID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBvcGVyYXRvciA9IChyb3cucXVlcnlTZWxlY3RvcignLm9wZXJhdG9yLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZSBhcyBhbnk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgLy8gT25seSBhZGQgaWYgdmFsdWUgaXMgcHJlc2VudCBvciBvcGVyYXRvciBkb2Vzbid0IHJlcXVpcmUgaXRcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlIHx8IFsnZXhpc3RzJywgJ2RvZXNOb3RFeGlzdCcsICdpc051bGwnLCAnaXNOb3ROdWxsJ10uaW5jbHVkZXMob3BlcmF0b3IpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25kaXRpb25zLnB1c2goeyBmaWVsZCwgb3BlcmF0b3IsIHZhbHVlIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKGNvbmRpdGlvbnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJHcm91cHMucHVzaChjb25kaXRpb25zKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5IC8gc2ltcGxlIHN0cmF0ZWdpZXMsIHBvcHVsYXRlIGZpbHRlcnMgd2l0aCB0aGUgZmlyc3QgZ3JvdXBcbiAgICBjb25zdCBmaWx0ZXJzOiBSdWxlQ29uZGl0aW9uW10gPSBmaWx0ZXJHcm91cHMubGVuZ3RoID4gMCA/IGZpbHRlckdyb3Vwc1swXSA6IFtdO1xuXG4gICAgY29uc3QgZ3JvdXBpbmdSdWxlczogR3JvdXBpbmdSdWxlW10gPSBbXTtcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JvdXAtcm93cy1jb250YWluZXInKT8ucXVlcnlTZWxlY3RvckFsbCgnLmJ1aWxkZXItcm93JykuZm9yRWFjaChyb3cgPT4ge1xuICAgICAgICBjb25zdCBzb3VyY2UgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5zb3VyY2Utc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlIGFzIFwiZmllbGRcIiB8IFwiZml4ZWRcIjtcbiAgICAgICAgbGV0IHZhbHVlID0gXCJcIjtcbiAgICAgICAgaWYgKHNvdXJjZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgdmFsdWUgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC1maWVsZCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQtdGV4dCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdHJhbnNmb3JtID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudHJhbnNmb3JtLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZSBhcyBhbnk7XG4gICAgICAgIGNvbnN0IHRyYW5zZm9ybVBhdHRlcm4gPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy50cmFuc2Zvcm0tcGF0dGVybicpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICBjb25zdCB3aW5kb3dNb2RlID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcud2luZG93LW1vZGUtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlIGFzIGFueTtcblxuICAgICAgICBjb25zdCByYW5kb21DaGVjayA9IHJvdy5xdWVyeVNlbGVjdG9yKCcucmFuZG9tLWNvbG9yLWNoZWNrJykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JJbnB1dCA9IHJvdy5xdWVyeVNlbGVjdG9yKCcuY29sb3ItaW5wdXQnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JGaWVsZFNlbGVjdCA9IHJvdy5xdWVyeVNlbGVjdG9yKCcuY29sb3ItZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IGNvbG9yVHJhbnNmb3JtU2VsZWN0ID0gcm93LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci10cmFuc2Zvcm0tc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IGNvbG9yVHJhbnNmb3JtUGF0dGVybiA9IHJvdy5xdWVyeVNlbGVjdG9yKCcuY29sb3ItdHJhbnNmb3JtLXBhdHRlcm4nKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuXG4gICAgICAgIGxldCBjb2xvciA9ICdyYW5kb20nO1xuICAgICAgICBsZXQgY29sb3JGaWVsZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgICBsZXQgY29sb3JUcmFuc2Zvcm06IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgICAgbGV0IGNvbG9yVHJhbnNmb3JtUGF0dGVyblZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgICAgICAgaWYgKCFyYW5kb21DaGVjay5jaGVja2VkKSB7XG4gICAgICAgICAgICBjb2xvciA9IGNvbG9ySW5wdXQudmFsdWU7XG4gICAgICAgICAgICBpZiAoY29sb3IgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICBjb2xvckZpZWxkID0gY29sb3JGaWVsZFNlbGVjdC52YWx1ZTtcbiAgICAgICAgICAgICAgICBjb2xvclRyYW5zZm9ybSA9IGNvbG9yVHJhbnNmb3JtU2VsZWN0LnZhbHVlIGFzIGFueTtcbiAgICAgICAgICAgICAgICBpZiAoY29sb3JUcmFuc2Zvcm0gPT09ICdyZWdleCcpIHtcbiAgICAgICAgICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuVmFsdWUgPSBjb2xvclRyYW5zZm9ybVBhdHRlcm4udmFsdWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICBncm91cGluZ1J1bGVzLnB1c2goeyBcbiAgICAgICAgICAgICAgICBzb3VyY2UsIFxuICAgICAgICAgICAgICAgIHZhbHVlLCBcbiAgICAgICAgICAgICAgICBjb2xvciwgXG4gICAgICAgICAgICAgICAgY29sb3JGaWVsZCwgXG4gICAgICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm06IGNvbG9yVHJhbnNmb3JtIGFzIGFueSxcbiAgICAgICAgICAgICAgICBjb2xvclRyYW5zZm9ybVBhdHRlcm46IGNvbG9yVHJhbnNmb3JtUGF0dGVyblZhbHVlLFxuICAgICAgICAgICAgICAgIHRyYW5zZm9ybSwgXG4gICAgICAgICAgICAgICAgdHJhbnNmb3JtUGF0dGVybjogdHJhbnNmb3JtID09PSAncmVnZXgnID8gdHJhbnNmb3JtUGF0dGVybiA6IHVuZGVmaW5lZCwgXG4gICAgICAgICAgICAgICAgd2luZG93TW9kZSBcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zdCBzb3J0aW5nUnVsZXM6IFNvcnRpbmdSdWxlW10gPSBbXTtcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc29ydC1yb3dzLWNvbnRhaW5lcicpPy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKS5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgIGNvbnN0IGZpZWxkID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICBjb25zdCBvcmRlciA9IChyb3cucXVlcnlTZWxlY3RvcignLm9yZGVyLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZSBhcyBhbnk7XG4gICAgICAgIHNvcnRpbmdSdWxlcy5wdXNoKHsgZmllbGQsIG9yZGVyIH0pO1xuICAgIH0pO1xuXG4gICAgY29uc3QgZ3JvdXBTb3J0aW5nUnVsZXM6IFNvcnRpbmdSdWxlW10gPSBbXTtcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JvdXAtc29ydC1yb3dzLWNvbnRhaW5lcicpPy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKS5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgIGNvbnN0IGZpZWxkID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICBjb25zdCBvcmRlciA9IChyb3cucXVlcnlTZWxlY3RvcignLm9yZGVyLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZSBhcyBhbnk7XG4gICAgICAgIGdyb3VwU29ydGluZ1J1bGVzLnB1c2goeyBmaWVsZCwgb3JkZXIgfSk7XG4gICAgfSk7XG4gICAgY29uc3QgYXBwbGllZEdyb3VwU29ydGluZ1J1bGVzID0gc29ydEdyb3VwcyA/IGdyb3VwU29ydGluZ1J1bGVzIDogW107XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBpZCxcbiAgICAgICAgbGFiZWwsXG4gICAgICAgIGZpbHRlcnMsXG4gICAgICAgIGZpbHRlckdyb3VwcyxcbiAgICAgICAgZ3JvdXBpbmdSdWxlcyxcbiAgICAgICAgc29ydGluZ1J1bGVzLFxuICAgICAgICBncm91cFNvcnRpbmdSdWxlczogYXBwbGllZEdyb3VwU29ydGluZ1J1bGVzLFxuICAgICAgICBmYWxsYmFjayxcbiAgICAgICAgc29ydEdyb3Vwc1xuICAgIH07XG59XG5cbmZ1bmN0aW9uIHJ1bkJ1aWxkZXJTaW11bGF0aW9uKCkge1xuICAgIC8vIFBhc3MgdHJ1ZSB0byBpZ25vcmUgdmFsaWRhdGlvbiBzbyB3ZSBjYW4gc2ltdWxhdGUgd2l0aG91dCBJRC9MYWJlbFxuICAgIGNvbnN0IHN0cmF0ID0gZ2V0QnVpbGRlclN0cmF0ZWd5KHRydWUpO1xuICAgIGNvbnN0IHJlc3VsdENvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidWlsZGVyLXJlc3VsdHMnKTtcbiAgICBjb25zdCBuZXdTdGF0ZVBhbmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25ldy1zdGF0ZS1wYW5lbCcpO1xuXG4gICAgaWYgKCFzdHJhdCkgcmV0dXJuOyAvLyBTaG91bGQgbm90IGhhcHBlbiB3aXRoIGlnbm9yZVZhbGlkYXRpb249dHJ1ZVxuXG4gICAgbG9nSW5mbyhcIlJ1bm5pbmcgYnVpbGRlciBzaW11bGF0aW9uXCIsIHsgc3RyYXRlZ3k6IHN0cmF0LmlkIH0pO1xuXG4gICAgLy8gRm9yIHNpbXVsYXRpb24sIHdlIGNhbiBtb2NrIGFuIElEL0xhYmVsIGlmIG1pc3NpbmdcbiAgICBjb25zdCBzaW1TdHJhdDogQ3VzdG9tU3RyYXRlZ3kgPSBzdHJhdDtcblxuICAgIGlmICghcmVzdWx0Q29udGFpbmVyIHx8ICFuZXdTdGF0ZVBhbmVsKSByZXR1cm47XG5cbiAgICAvLyBTaG93IHRoZSBwYW5lbFxuICAgIG5ld1N0YXRlUGFuZWwuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcblxuICAgIC8vIFVwZGF0ZSBsb2NhbEN1c3RvbVN0cmF0ZWdpZXMgdGVtcG9yYXJpbHkgZm9yIFNpbVxuICAgIGNvbnN0IG9yaWdpbmFsU3RyYXRlZ2llcyA9IFsuLi5sb2NhbEN1c3RvbVN0cmF0ZWdpZXNdO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgLy8gUmVwbGFjZSBvciBhZGRcbiAgICAgICAgY29uc3QgZXhpc3RpbmdJZHggPSBsb2NhbEN1c3RvbVN0cmF0ZWdpZXMuZmluZEluZGV4KHMgPT4gcy5pZCA9PT0gc2ltU3RyYXQuaWQpO1xuICAgICAgICBpZiAoZXhpc3RpbmdJZHggIT09IC0xKSB7XG4gICAgICAgICAgICBsb2NhbEN1c3RvbVN0cmF0ZWdpZXNbZXhpc3RpbmdJZHhdID0gc2ltU3RyYXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsb2NhbEN1c3RvbVN0cmF0ZWdpZXMucHVzaChzaW1TdHJhdCk7XG4gICAgICAgIH1cbiAgICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhsb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuXG4gICAgICAgIC8vIFJ1biBMb2dpY1xuICAgICAgICBsZXQgdGFicyA9IGdldE1hcHBlZFRhYnMoKTtcblxuICAgICAgICBpZiAodGFicy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJlc3VsdENvbnRhaW5lci5pbm5lckhUTUwgPSAnPHA+Tm8gdGFicyBmb3VuZCB0byBzaW11bGF0ZS48L3A+JztcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEFwcGx5IFNpbXVsYXRlZCBTZWxlY3Rpb24gT3ZlcnJpZGVcbiAgICAgICAgaWYgKHNpbXVsYXRlZFNlbGVjdGlvbi5zaXplID4gMCkge1xuICAgICAgICAgICAgdGFicyA9IHRhYnMubWFwKHQgPT4gKHtcbiAgICAgICAgICAgICAgICAuLi50LFxuICAgICAgICAgICAgICAgIHNlbGVjdGVkOiBzaW11bGF0ZWRTZWxlY3Rpb24uaGFzKHQuaWQpXG4gICAgICAgICAgICB9KSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTb3J0IHVzaW5nIHRoaXMgc3RyYXRlZ3k/XG4gICAgICAgIC8vIHNvcnRUYWJzIGV4cGVjdHMgU29ydGluZ1N0cmF0ZWd5W10uXG4gICAgICAgIC8vIElmIHdlIHVzZSB0aGlzIHN0cmF0ZWd5IGZvciBzb3J0aW5nLi4uXG4gICAgICAgIHRhYnMgPSBzb3J0VGFicyh0YWJzLCBbc2ltU3RyYXQuaWRdKTtcblxuICAgICAgICAvLyBHcm91cCB1c2luZyB0aGlzIHN0cmF0ZWd5XG4gICAgICAgIGNvbnN0IGdyb3VwcyA9IGdyb3VwVGFicyh0YWJzLCBbc2ltU3RyYXQuaWRdKTtcblxuICAgICAgICAvLyBDaGVjayBpZiB3ZSBzaG91bGQgc2hvdyBhIGZhbGxiYWNrIHJlc3VsdCAoZS5nLiBTb3J0IE9ubHkpXG4gICAgICAgIC8vIElmIG5vIGdyb3VwcyB3ZXJlIGNyZWF0ZWQsIGJ1dCB3ZSBoYXZlIHRhYnMsIGFuZCB0aGUgc3RyYXRlZ3kgaXMgbm90IGEgZ3JvdXBpbmcgc3RyYXRlZ3ksXG4gICAgICAgIC8vIHdlIHNob3cgdGhlIHRhYnMgYXMgYSBzaW5nbGUgbGlzdC5cbiAgICAgICAgaWYgKGdyb3Vwcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIGNvbnN0IHN0cmF0RGVmID0gZ2V0U3RyYXRlZ2llcyhsb2NhbEN1c3RvbVN0cmF0ZWdpZXMpLmZpbmQocyA9PiBzLmlkID09PSBzaW1TdHJhdC5pZCk7XG4gICAgICAgICAgICBpZiAoc3RyYXREZWYgJiYgIXN0cmF0RGVmLmlzR3JvdXBpbmcpIHtcbiAgICAgICAgICAgICAgICBncm91cHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIGlkOiAnc2ltLXNvcnRlZCcsXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvd0lkOiAwLFxuICAgICAgICAgICAgICAgICAgICBsYWJlbDogJ1NvcnRlZCBSZXN1bHRzIChObyBHcm91cGluZyknLFxuICAgICAgICAgICAgICAgICAgICBjb2xvcjogJ2dyZXknLFxuICAgICAgICAgICAgICAgICAgICB0YWJzOiB0YWJzLFxuICAgICAgICAgICAgICAgICAgICByZWFzb246ICdTb3J0IE9ubHknXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZW5kZXIgUmVzdWx0c1xuICAgICAgICBpZiAoZ3JvdXBzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgcmVzdWx0Q29udGFpbmVyLmlubmVySFRNTCA9ICc8cD5ObyBncm91cHMgY3JlYXRlZC48L3A+JztcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHJlc3VsdENvbnRhaW5lci5pbm5lckhUTUwgPSBncm91cHMubWFwKGdyb3VwID0+IGBcbiAgICA8ZGl2IGNsYXNzPVwiZ3JvdXAtcmVzdWx0XCIgc3R5bGU9XCJtYXJnaW4tYm90dG9tOiAxMHB4OyBib3JkZXI6IDFweCBzb2xpZCAjZGRkOyBib3JkZXItcmFkaXVzOiA0cHg7IG92ZXJmbG93OiBoaWRkZW47XCI+XG4gICAgICA8ZGl2IGNsYXNzPVwiZ3JvdXAtaGVhZGVyXCIgc3R5bGU9XCJib3JkZXItbGVmdDogNXB4IHNvbGlkICR7Z3JvdXAuY29sb3J9OyBwYWRkaW5nOiA1cHg7IGJhY2tncm91bmQ6ICNmOGY5ZmE7IGZvbnQtc2l6ZTogMC45ZW07IGZvbnQtd2VpZ2h0OiBib2xkOyBkaXNwbGF5OiBmbGV4OyBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47XCI+XG4gICAgICAgIDxzcGFuPiR7ZXNjYXBlSHRtbChncm91cC5sYWJlbCB8fCAnVW5ncm91cGVkJyl9PC9zcGFuPlxuICAgICAgICA8c3BhbiBjbGFzcz1cImdyb3VwLW1ldGFcIiBzdHlsZT1cImZvbnQtd2VpZ2h0OiBub3JtYWw7IGZvbnQtc2l6ZTogMC44ZW07IGNvbG9yOiAjNjY2O1wiPiR7Z3JvdXAudGFicy5sZW5ndGh9PC9zcGFuPlxuICAgICAgPC9kaXY+XG4gICAgICA8dWwgY2xhc3M9XCJncm91cC10YWJzXCIgc3R5bGU9XCJsaXN0LXN0eWxlOiBub25lOyBtYXJnaW46IDA7IHBhZGRpbmc6IDA7XCI+XG4gICAgICAgICR7Z3JvdXAudGFicy5tYXAodGFiID0+IGBcbiAgICAgICAgICA8bGkgY2xhc3M9XCJncm91cC10YWItaXRlbVwiIHN0eWxlPVwicGFkZGluZzogNHB4IDVweDsgYm9yZGVyLXRvcDogMXB4IHNvbGlkICNlZWU7IGRpc3BsYXk6IGZsZXg7IGdhcDogNXB4OyBhbGlnbi1pdGVtczogY2VudGVyOyBmb250LXNpemU6IDAuODVlbTtcIj5cbiAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJ3aWR0aDogMTJweDsgaGVpZ2h0OiAxMnB4OyBiYWNrZ3JvdW5kOiAjZWVlOyBib3JkZXItcmFkaXVzOiAycHg7IGZsZXgtc2hyaW5rOiAwO1wiPlxuICAgICAgICAgICAgICAgICR7dGFiLmZhdkljb25VcmwgPyBgPGltZyBzcmM9XCIke2VzY2FwZUh0bWwodGFiLmZhdkljb25VcmwpfVwiIHN0eWxlPVwid2lkdGg6IDEwMCU7IGhlaWdodDogMTAwJTsgb2JqZWN0LWZpdDogY292ZXI7XCIgb25lcnJvcj1cInRoaXMuc3R5bGUuZGlzcGxheT0nbm9uZSdcIj5gIDogJyd9XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwidGl0bGUtY2VsbFwiIHRpdGxlPVwiJHtlc2NhcGVIdG1sKHRhYi50aXRsZSl9XCIgc3R5bGU9XCJ3aGl0ZS1zcGFjZTogbm93cmFwOyBvdmVyZmxvdzogaGlkZGVuOyB0ZXh0LW92ZXJmbG93OiBlbGxpcHNpcztcIj4ke2VzY2FwZUh0bWwodGFiLnRpdGxlKX08L3NwYW4+XG4gICAgICAgICAgPC9saT5cbiAgICAgICAgYCkuam9pbignJyl9XG4gICAgICA8L3VsPlxuICAgIDwvZGl2PlxuICBgKS5qb2luKCcnKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJTaW11bGF0aW9uIGZhaWxlZFwiLCBlKTtcbiAgICAgICAgcmVzdWx0Q29udGFpbmVyLmlubmVySFRNTCA9IGA8cCBzdHlsZT1cImNvbG9yOiByZWQ7XCI+U2ltdWxhdGlvbiBmYWlsZWQ6ICR7ZX08L3A+YDtcbiAgICAgICAgYWxlcnQoXCJTaW11bGF0aW9uIGZhaWxlZDogXCIgKyBlKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgICAvLyBSZXN0b3JlIHN0cmF0ZWdpZXNcbiAgICAgICAgbG9jYWxDdXN0b21TdHJhdGVnaWVzID0gb3JpZ2luYWxTdHJhdGVnaWVzO1xuICAgICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBzYXZlQ3VzdG9tU3RyYXRlZ3lGcm9tQnVpbGRlcihzaG93U3VjY2VzcyA9IHRydWUpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCBzdHJhdCA9IGdldEJ1aWxkZXJTdHJhdGVneSgpO1xuICAgIGlmICghc3RyYXQpIHtcbiAgICAgICAgYWxlcnQoXCJQbGVhc2UgZmlsbCBpbiBJRCBhbmQgTGFiZWwuXCIpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiBzYXZlU3RyYXRlZ3koc3RyYXQsIHNob3dTdWNjZXNzKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gc2F2ZVN0cmF0ZWd5KHN0cmF0OiBDdXN0b21TdHJhdGVneSwgc2hvd1N1Y2Nlc3M6IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICB0cnkge1xuICAgICAgICBsb2dJbmZvKFwiU2F2aW5nIHN0cmF0ZWd5XCIsIHsgaWQ6IHN0cmF0LmlkIH0pO1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvYWRQcmVmZXJlbmNlcycgfSk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmcyA9IHJlc3BvbnNlLmRhdGEgYXMgUHJlZmVyZW5jZXM7XG4gICAgICAgICAgICBsZXQgY3VycmVudFN0cmF0ZWdpZXMgPSBwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdO1xuXG4gICAgICAgICAgICAvLyBGaW5kIGV4aXN0aW5nIHRvIHByZXNlcnZlIHByb3BzIChsaWtlIGF1dG9SdW4pXG4gICAgICAgICAgICBjb25zdCBleGlzdGluZyA9IGN1cnJlbnRTdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdC5pZCk7XG4gICAgICAgICAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgICAgICAgICAgICBzdHJhdC5hdXRvUnVuID0gZXhpc3RpbmcuYXV0b1J1bjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gUmVtb3ZlIGV4aXN0aW5nIGlmIHNhbWUgSURcbiAgICAgICAgICAgIGN1cnJlbnRTdHJhdGVnaWVzID0gY3VycmVudFN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gcy5pZCAhPT0gc3RyYXQuaWQpO1xuICAgICAgICAgICAgY3VycmVudFN0cmF0ZWdpZXMucHVzaChzdHJhdCk7XG5cbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnc2F2ZVByZWZlcmVuY2VzJyxcbiAgICAgICAgICAgICAgICBwYXlsb2FkOiB7IGN1c3RvbVN0cmF0ZWdpZXM6IGN1cnJlbnRTdHJhdGVnaWVzIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBsb2NhbEN1c3RvbVN0cmF0ZWdpZXMgPSBjdXJyZW50U3RyYXRlZ2llcztcbiAgICAgICAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMobG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcblxuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMb2FkT3B0aW9ucygpO1xuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMaXN0VGFibGUoKTtcbiAgICAgICAgICAgIHJlbmRlckFsZ29yaXRobXNWaWV3KCk7XG4gICAgICAgICAgICBpZiAoc2hvd1N1Y2Nlc3MpIGFsZXJ0KFwiU3RyYXRlZ3kgc2F2ZWQhXCIpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzYXZlIHN0cmF0ZWd5XCIsIGUpO1xuICAgICAgICBhbGVydChcIkVycm9yIHNhdmluZyBzdHJhdGVneVwiKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gcnVuQnVpbGRlckxpdmUoKSB7XG4gICAgY29uc3Qgc3RyYXQgPSBnZXRCdWlsZGVyU3RyYXRlZ3koKTtcbiAgICBpZiAoIXN0cmF0KSB7XG4gICAgICAgIGFsZXJ0KFwiUGxlYXNlIGZpbGwgaW4gSUQgYW5kIExhYmVsIHRvIHJ1biBsaXZlLlwiKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxvZ0luZm8oXCJBcHBseWluZyBzdHJhdGVneSBsaXZlXCIsIHsgaWQ6IHN0cmF0LmlkIH0pO1xuXG4gICAgLy8gU2F2ZSBzaWxlbnRseSBmaXJzdCB0byBlbnN1cmUgYmFja2VuZCBoYXMgdGhlIGRlZmluaXRpb25cbiAgICBjb25zdCBzYXZlZCA9IGF3YWl0IHNhdmVTdHJhdGVneShzdHJhdCwgZmFsc2UpO1xuICAgIGlmICghc2F2ZWQpIHJldHVybjtcblxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgdHlwZTogJ2FwcGx5R3JvdXBpbmcnLFxuICAgICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgICAgIHNvcnRpbmc6IFtzdHJhdC5pZF1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICBhbGVydChcIkFwcGxpZWQgc3VjY2Vzc2Z1bGx5IVwiKTtcbiAgICAgICAgICAgIGxvYWRUYWJzKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhbGVydChcIkZhaWxlZCB0byBhcHBseTogXCIgKyAocmVzcG9uc2UuZXJyb3IgfHwgJ1Vua25vd24gZXJyb3InKSk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJBcHBseSBmYWlsZWRcIiwgZSk7XG4gICAgICAgIGFsZXJ0KFwiQXBwbHkgZmFpbGVkOiBcIiArIGUpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gcG9wdWxhdGVCdWlsZGVyRnJvbVN0cmF0ZWd5KHN0cmF0OiBDdXN0b21TdHJhdGVneSkge1xuICAgIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtbmFtZScpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gc3RyYXQuaWQ7XG4gICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1kZXNjJykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUgPSBzdHJhdC5sYWJlbDtcblxuICAgIGNvbnN0IHNvcnRHcm91cHNDaGVjayA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtc29ydGdyb3Vwcy1jaGVjaycpIGFzIEhUTUxJbnB1dEVsZW1lbnQpO1xuICAgIGNvbnN0IGhhc0dyb3VwU29ydCA9ICEhKHN0cmF0Lmdyb3VwU29ydGluZ1J1bGVzICYmIHN0cmF0Lmdyb3VwU29ydGluZ1J1bGVzLmxlbmd0aCA+IDApIHx8ICEhc3RyYXQuc29ydEdyb3VwcztcbiAgICBzb3J0R3JvdXBzQ2hlY2suY2hlY2tlZCA9IGhhc0dyb3VwU29ydDtcbiAgICBzb3J0R3JvdXBzQ2hlY2suZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScpKTtcblxuICAgIGNvbnN0IGF1dG9SdW5DaGVjayA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtYXV0b3J1bicpIGFzIEhUTUxJbnB1dEVsZW1lbnQpO1xuICAgIGF1dG9SdW5DaGVjay5jaGVja2VkID0gISFzdHJhdC5hdXRvUnVuO1xuXG4gICAgWydmaWx0ZXItcm93cy1jb250YWluZXInLCAnZ3JvdXAtcm93cy1jb250YWluZXInLCAnc29ydC1yb3dzLWNvbnRhaW5lcicsICdncm91cC1zb3J0LXJvd3MtY29udGFpbmVyJ10uZm9yRWFjaChpZCA9PiB7XG4gICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpO1xuICAgICAgICBpZiAoZWwpIGVsLmlubmVySFRNTCA9ICcnO1xuICAgIH0pO1xuXG4gICAgaWYgKHN0cmF0LmZpbHRlckdyb3VwcyAmJiBzdHJhdC5maWx0ZXJHcm91cHMubGVuZ3RoID4gMCkge1xuICAgICAgICBzdHJhdC5maWx0ZXJHcm91cHMuZm9yRWFjaChnID0+IGFkZEZpbHRlckdyb3VwUm93KGcpKTtcbiAgICB9IGVsc2UgaWYgKHN0cmF0LmZpbHRlcnMgJiYgc3RyYXQuZmlsdGVycy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGFkZEZpbHRlckdyb3VwUm93KHN0cmF0LmZpbHRlcnMpO1xuICAgIH1cblxuICAgIHN0cmF0Lmdyb3VwaW5nUnVsZXM/LmZvckVhY2goZyA9PiBhZGRCdWlsZGVyUm93KCdncm91cCcsIGcpKTtcbiAgICBzdHJhdC5zb3J0aW5nUnVsZXM/LmZvckVhY2gocyA9PiBhZGRCdWlsZGVyUm93KCdzb3J0JywgcykpO1xuICAgIHN0cmF0Lmdyb3VwU29ydGluZ1J1bGVzPy5mb3JFYWNoKGdzID0+IGFkZEJ1aWxkZXJSb3coJ2dyb3VwU29ydCcsIGdzKSk7XG5cbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjdmlldy1zdHJhdGVnaWVzJyk/LnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6ICdzbW9vdGgnIH0pO1xuICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyU3RyYXRlZ3lMb2FkT3B0aW9ucygpIHtcbiAgICBjb25zdCBzZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXRlZ3ktbG9hZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCB8IG51bGw7XG4gICAgaWYgKCFzZWxlY3QpIHJldHVybjtcblxuICAgIGNvbnN0IGN1c3RvbU9wdGlvbnMgPSBsb2NhbEN1c3RvbVN0cmF0ZWdpZXNcbiAgICAgICAgLnNsaWNlKClcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSlcbiAgICAgICAgLm1hcChzdHJhdGVneSA9PiBgXG4gICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiJHtlc2NhcGVIdG1sKHN0cmF0ZWd5LmlkKX1cIj4ke2VzY2FwZUh0bWwoc3RyYXRlZ3kubGFiZWwpfSAoJHtlc2NhcGVIdG1sKHN0cmF0ZWd5LmlkKX0pPC9vcHRpb24+XG4gICAgICAgIGApLmpvaW4oJycpO1xuXG4gICAgY29uc3QgYnVpbHRJbk9wdGlvbnMgPSBTVFJBVEVHSUVTXG4gICAgICAgIC5maWx0ZXIocyA9PiAhbG9jYWxDdXN0b21TdHJhdGVnaWVzLnNvbWUoY3MgPT4gY3MuaWQgPT09IHMuaWQpKVxuICAgICAgICAubWFwKHN0cmF0ZWd5ID0+IGBcbiAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCIke2VzY2FwZUh0bWwoc3RyYXRlZ3kuaWQgYXMgc3RyaW5nKX1cIj4ke2VzY2FwZUh0bWwoc3RyYXRlZ3kubGFiZWwpfSAoQnVpbHQtaW4pPC9vcHRpb24+XG4gICAgICAgIGApLmpvaW4oJycpO1xuXG4gICAgc2VsZWN0LmlubmVySFRNTCA9IGA8b3B0aW9uIHZhbHVlPVwiXCI+TG9hZCBzYXZlZCBzdHJhdGVneS4uLjwvb3B0aW9uPmAgK1xuICAgICAgICAoY3VzdG9tT3B0aW9ucyA/IGA8b3B0Z3JvdXAgbGFiZWw9XCJDdXN0b20gU3RyYXRlZ2llc1wiPiR7Y3VzdG9tT3B0aW9uc308L29wdGdyb3VwPmAgOiAnJykgK1xuICAgICAgICAoYnVpbHRJbk9wdGlvbnMgPyBgPG9wdGdyb3VwIGxhYmVsPVwiQnVpbHQtaW4gU3RyYXRlZ2llc1wiPiR7YnVpbHRJbk9wdGlvbnN9PC9vcHRncm91cD5gIDogJycpO1xufVxuXG5mdW5jdGlvbiByZW5kZXJTdHJhdGVneUxpc3RUYWJsZSgpIHtcbiAgICBjb25zdCB0YWJsZUJvZHkgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXRlZ3ktdGFibGUtYm9keScpO1xuICAgIGlmICghdGFibGVCb2R5KSByZXR1cm47XG5cbiAgICBjb25zdCBjdXN0b21JZHMgPSBuZXcgU2V0KGxvY2FsQ3VzdG9tU3RyYXRlZ2llcy5tYXAoc3RyYXRlZ3kgPT4gc3RyYXRlZ3kuaWQpKTtcbiAgICBjb25zdCBidWlsdEluUm93cyA9IFNUUkFURUdJRVMubWFwKHN0cmF0ZWd5ID0+ICh7XG4gICAgICAgIC4uLnN0cmF0ZWd5LFxuICAgICAgICBzb3VyY2VMYWJlbDogJ0J1aWx0LWluJyxcbiAgICAgICAgY29uZmlnU3VtbWFyeTogJ1x1MjAxNCcsXG4gICAgICAgIGF1dG9SdW5MYWJlbDogJ1x1MjAxNCcsXG4gICAgICAgIGFjdGlvbnM6ICcnXG4gICAgfSkpO1xuXG4gICAgY29uc3QgY3VzdG9tUm93cyA9IGxvY2FsQ3VzdG9tU3RyYXRlZ2llcy5tYXAoc3RyYXRlZ3kgPT4ge1xuICAgICAgICBjb25zdCBvdmVycmlkZXNCdWlsdEluID0gY3VzdG9tSWRzLmhhcyhzdHJhdGVneS5pZCkgJiYgU1RSQVRFR0lFUy5zb21lKGJ1aWx0SW4gPT4gYnVpbHRJbi5pZCA9PT0gc3RyYXRlZ3kuaWQpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaWQ6IHN0cmF0ZWd5LmlkLFxuICAgICAgICAgICAgbGFiZWw6IHN0cmF0ZWd5LmxhYmVsLFxuICAgICAgICAgICAgaXNHcm91cGluZzogdHJ1ZSxcbiAgICAgICAgICAgIGlzU29ydGluZzogdHJ1ZSxcbiAgICAgICAgICAgIHNvdXJjZUxhYmVsOiBvdmVycmlkZXNCdWlsdEluID8gJ0N1c3RvbSAob3ZlcnJpZGVzIGJ1aWx0LWluKScgOiAnQ3VzdG9tJyxcbiAgICAgICAgICAgIGNvbmZpZ1N1bW1hcnk6IGBGaWx0ZXJzOiAke3N0cmF0ZWd5LmZpbHRlcnM/Lmxlbmd0aCB8fCAwfSwgR3JvdXBzOiAke3N0cmF0ZWd5Lmdyb3VwaW5nUnVsZXM/Lmxlbmd0aCB8fCAwfSwgU29ydHM6ICR7c3RyYXRlZ3kuc29ydGluZ1J1bGVzPy5sZW5ndGggfHwgMH1gLFxuICAgICAgICAgICAgYXV0b1J1bkxhYmVsOiBzdHJhdGVneS5hdXRvUnVuID8gJ1llcycgOiAnTm8nLFxuICAgICAgICAgICAgYWN0aW9uczogYDxidXR0b24gY2xhc3M9XCJkZWxldGUtc3RyYXRlZ3ktcm93XCIgZGF0YS1pZD1cIiR7ZXNjYXBlSHRtbChzdHJhdGVneS5pZCl9XCIgc3R5bGU9XCJjb2xvcjogcmVkO1wiPkRlbGV0ZTwvYnV0dG9uPmBcbiAgICAgICAgfTtcbiAgICB9KTtcblxuICAgIGNvbnN0IGFsbFJvd3MgPSBbLi4uYnVpbHRJblJvd3MsIC4uLmN1c3RvbVJvd3NdO1xuXG4gICAgaWYgKGFsbFJvd3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHRhYmxlQm9keS5pbm5lckhUTUwgPSAnPHRyPjx0ZCBjb2xzcGFuPVwiN1wiIHN0eWxlPVwiY29sb3I6ICM4ODg7XCI+Tm8gc3RyYXRlZ2llcyBmb3VuZC48L3RkPjwvdHI+JztcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRhYmxlQm9keS5pbm5lckhUTUwgPSBhbGxSb3dzLm1hcChyb3cgPT4ge1xuICAgICAgICBjb25zdCBjYXBhYmlsaXRpZXMgPSBbcm93LmlzR3JvdXBpbmcgPyAnR3JvdXBpbmcnIDogbnVsbCwgcm93LmlzU29ydGluZyA/ICdTb3J0aW5nJyA6IG51bGxdLmZpbHRlcihCb29sZWFuKS5qb2luKCcsICcpO1xuICAgICAgICByZXR1cm4gYFxuICAgICAgICA8dHI+XG4gICAgICAgICAgICA8dGQ+JHtlc2NhcGVIdG1sKHJvdy5sYWJlbCl9PC90ZD5cbiAgICAgICAgICAgIDx0ZD4ke2VzY2FwZUh0bWwoU3RyaW5nKHJvdy5pZCkpfTwvdGQ+XG4gICAgICAgICAgICA8dGQ+JHtlc2NhcGVIdG1sKHJvdy5zb3VyY2VMYWJlbCl9PC90ZD5cbiAgICAgICAgICAgIDx0ZD4ke2VzY2FwZUh0bWwoY2FwYWJpbGl0aWVzKX08L3RkPlxuICAgICAgICAgICAgPHRkPiR7ZXNjYXBlSHRtbChyb3cuY29uZmlnU3VtbWFyeSl9PC90ZD5cbiAgICAgICAgICAgIDx0ZD4ke2VzY2FwZUh0bWwocm93LmF1dG9SdW5MYWJlbCl9PC90ZD5cbiAgICAgICAgICAgIDx0ZD4ke3Jvdy5hY3Rpb25zfTwvdGQ+XG4gICAgICAgIDwvdHI+XG4gICAgICAgIGA7XG4gICAgfSkuam9pbignJyk7XG5cbiAgICB0YWJsZUJvZHkucXVlcnlTZWxlY3RvckFsbCgnLmRlbGV0ZS1zdHJhdGVneS1yb3cnKS5mb3JFYWNoKGJ0biA9PiB7XG4gICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBpZCA9IChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuZGF0YXNldC5pZDtcbiAgICAgICAgICAgIGlmIChpZCAmJiBjb25maXJtKGBEZWxldGUgc3RyYXRlZ3kgXCIke2lkfVwiP2ApKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgZGVsZXRlQ3VzdG9tU3RyYXRlZ3koaWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZGVsZXRlQ3VzdG9tU3RyYXRlZ3koaWQ6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICAgIGxvZ0luZm8oXCJEZWxldGluZyBzdHJhdGVneVwiLCB7IGlkIH0pO1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvYWRQcmVmZXJlbmNlcycgfSk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmcyA9IHJlc3BvbnNlLmRhdGEgYXMgUHJlZmVyZW5jZXM7XG4gICAgICAgICAgICBjb25zdCBuZXdTdHJhdGVnaWVzID0gKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pLmZpbHRlcihzID0+IHMuaWQgIT09IGlkKTtcblxuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIHBheWxvYWQ6IHsgY3VzdG9tU3RyYXRlZ2llczogbmV3U3RyYXRlZ2llcyB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgbG9jYWxDdXN0b21TdHJhdGVnaWVzID0gbmV3U3RyYXRlZ2llcztcbiAgICAgICAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMobG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TG9hZE9wdGlvbnMoKTtcbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TGlzdFRhYmxlKCk7XG4gICAgICAgICAgICByZW5kZXJBbGdvcml0aG1zVmlldygpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGRlbGV0ZSBzdHJhdGVneVwiLCBlKTtcbiAgICB9XG59XG5cbi8vIC4uLiBHZW5lcmEgbWFuYWdlbWVudCAuLi4gKGtlcHQgYXMgaXMpXG5mdW5jdGlvbiByZW5kZXJDdXN0b21HZW5lcmFMaXN0KGN1c3RvbUdlbmVyYTogUmVjb3JkPHN0cmluZywgc3RyaW5nPikge1xuICAgIGNvbnN0IGxpc3RDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY3VzdG9tLWdlbmVyYS1saXN0Jyk7XG4gICAgaWYgKCFsaXN0Q29udGFpbmVyKSByZXR1cm47XG5cbiAgICBpZiAoT2JqZWN0LmtleXMoY3VzdG9tR2VuZXJhKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgbGlzdENvbnRhaW5lci5pbm5lckhUTUwgPSAnPHAgc3R5bGU9XCJjb2xvcjogIzg4ODsgZm9udC1zdHlsZTogaXRhbGljO1wiPk5vIGN1c3RvbSBlbnRyaWVzLjwvcD4nO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbGlzdENvbnRhaW5lci5pbm5lckhUTUwgPSBPYmplY3QuZW50cmllcyhjdXN0b21HZW5lcmEpLm1hcCgoW2RvbWFpbiwgY2F0ZWdvcnldKSA9PiBgXG4gICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47IGFsaWduLWl0ZW1zOiBjZW50ZXI7IHBhZGRpbmc6IDVweDsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICNmMGYwZjA7XCI+XG4gICAgICAgICAgICA8c3Bhbj48Yj4ke2VzY2FwZUh0bWwoZG9tYWluKX08L2I+OiAke2VzY2FwZUh0bWwoY2F0ZWdvcnkpfTwvc3Bhbj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJkZWxldGUtZ2VuZXJhLWJ0blwiIGRhdGEtZG9tYWluPVwiJHtlc2NhcGVIdG1sKGRvbWFpbil9XCIgc3R5bGU9XCJiYWNrZ3JvdW5kOiBub25lOyBib3JkZXI6IG5vbmU7IGNvbG9yOiByZWQ7IGN1cnNvcjogcG9pbnRlcjtcIj4mdGltZXM7PC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuICAgIGApLmpvaW4oJycpO1xuXG4gICAgLy8gUmUtYXR0YWNoIGxpc3RlbmVycyBmb3IgZGVsZXRlIGJ1dHRvbnNcbiAgICBsaXN0Q29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5kZWxldGUtZ2VuZXJhLWJ0bicpLmZvckVhY2goYnRuID0+IHtcbiAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGRvbWFpbiA9IChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuZGF0YXNldC5kb21haW47XG4gICAgICAgICAgICBpZiAoZG9tYWluKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgZGVsZXRlQ3VzdG9tR2VuZXJhKGRvbWFpbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBhZGRDdXN0b21HZW5lcmEoKSB7XG4gICAgY29uc3QgZG9tYWluSW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbmV3LWdlbmVyYS1kb21haW4nKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgIGNvbnN0IGNhdGVnb3J5SW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbmV3LWdlbmVyYS1jYXRlZ29yeScpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG5cbiAgICBpZiAoIWRvbWFpbklucHV0IHx8ICFjYXRlZ29yeUlucHV0KSByZXR1cm47XG5cbiAgICBjb25zdCBkb21haW4gPSBkb21haW5JbnB1dC52YWx1ZS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICBjb25zdCBjYXRlZ29yeSA9IGNhdGVnb3J5SW5wdXQudmFsdWUudHJpbSgpO1xuXG4gICAgaWYgKCFkb21haW4gfHwgIWNhdGVnb3J5KSB7XG4gICAgICAgIGFsZXJ0KFwiUGxlYXNlIGVudGVyIGJvdGggZG9tYWluIGFuZCBjYXRlZ29yeS5cIik7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsb2dJbmZvKFwiQWRkaW5nIGN1c3RvbSBnZW5lcmFcIiwgeyBkb21haW4sIGNhdGVnb3J5IH0pO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgLy8gRmV0Y2ggY3VycmVudCB0byBtZXJnZVxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvYWRQcmVmZXJlbmNlcycgfSk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmcyA9IHJlc3BvbnNlLmRhdGEgYXMgUHJlZmVyZW5jZXM7XG4gICAgICAgICAgICBjb25zdCBuZXdDdXN0b21HZW5lcmEgPSB7IC4uLihwcmVmcy5jdXN0b21HZW5lcmEgfHwge30pLCBbZG9tYWluXTogY2F0ZWdvcnkgfTtcblxuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIHBheWxvYWQ6IHsgY3VzdG9tR2VuZXJhOiBuZXdDdXN0b21HZW5lcmEgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGRvbWFpbklucHV0LnZhbHVlID0gJyc7XG4gICAgICAgICAgICBjYXRlZ29yeUlucHV0LnZhbHVlID0gJyc7XG4gICAgICAgICAgICBsb2FkQ3VzdG9tR2VuZXJhKCk7XG4gICAgICAgICAgICBsb2FkVGFicygpOyAvLyBSZWZyZXNoIHRhYnMgdG8gYXBwbHkgbmV3IGNsYXNzaWZpY2F0aW9uIGlmIHJlbGV2YW50XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gYWRkIGN1c3RvbSBnZW5lcmFcIiwgZSk7XG4gICAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBkZWxldGVDdXN0b21HZW5lcmEoZG9tYWluOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgICBsb2dJbmZvKFwiRGVsZXRpbmcgY3VzdG9tIGdlbmVyYVwiLCB7IGRvbWFpbiB9KTtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2FkUHJlZmVyZW5jZXMnIH0pO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgICAgICAgY29uc3QgcHJlZnMgPSByZXNwb25zZS5kYXRhIGFzIFByZWZlcmVuY2VzO1xuICAgICAgICAgICAgY29uc3QgbmV3Q3VzdG9tR2VuZXJhID0geyAuLi4ocHJlZnMuY3VzdG9tR2VuZXJhIHx8IHt9KSB9O1xuICAgICAgICAgICAgZGVsZXRlIG5ld0N1c3RvbUdlbmVyYVtkb21haW5dO1xuXG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3NhdmVQcmVmZXJlbmNlcycsXG4gICAgICAgICAgICAgICAgcGF5bG9hZDogeyBjdXN0b21HZW5lcmE6IG5ld0N1c3RvbUdlbmVyYSB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgbG9hZEN1c3RvbUdlbmVyYSgpO1xuICAgICAgICAgICAgbG9hZFRhYnMoKTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBkZWxldGUgY3VzdG9tIGdlbmVyYVwiLCBlKTtcbiAgICB9XG59XG5cbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgdGFyZ2V0ID0gZXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICBpZiAodGFyZ2V0ICYmIHRhcmdldC5pZCA9PT0gJ2FkZC1nZW5lcmEtYnRuJykge1xuICAgICAgICBhZGRDdXN0b21HZW5lcmEoKTtcbiAgICB9XG59KTtcblxuYXN5bmMgZnVuY3Rpb24gbG9hZFRhYnMoKSB7XG4gIGxvZ0luZm8oXCJMb2FkaW5nIHRhYnMgZm9yIERldlRvb2xzXCIpO1xuICBjb25zdCB0YWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICBjdXJyZW50VGFicyA9IHRhYnM7XG5cbiAgY29uc3QgdG90YWxUYWJzRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndG90YWxUYWJzJyk7XG4gIGlmICh0b3RhbFRhYnNFbCkge1xuICAgIHRvdGFsVGFic0VsLnRleHRDb250ZW50ID0gdGFicy5sZW5ndGgudG9TdHJpbmcoKTtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIG1hcCBvZiB0YWIgSUQgdG8gdGl0bGUgZm9yIHBhcmVudCBsb29rdXBcbiAgdGFiVGl0bGVzLmNsZWFyKCk7XG4gIHRhYnMuZm9yRWFjaCh0YWIgPT4ge1xuICAgIGlmICh0YWIuaWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgdGFiVGl0bGVzLnNldCh0YWIuaWQsIHRhYi50aXRsZSB8fCAnVW50aXRsZWQnKTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIENvbnZlcnQgdG8gVGFiTWV0YWRhdGEgZm9yIGNvbnRleHQgYW5hbHlzaXNcbiAgY29uc3QgbWFwcGVkVGFiczogVGFiTWV0YWRhdGFbXSA9IGdldE1hcHBlZFRhYnMoKTtcblxuICAvLyBBbmFseXplIGNvbnRleHRcbiAgdHJ5IHtcbiAgICAgIGN1cnJlbnRDb250ZXh0TWFwID0gYXdhaXQgYW5hbHl6ZVRhYkNvbnRleHQobWFwcGVkVGFicyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGFuYWx5emUgY29udGV4dFwiLCBlcnJvcik7XG4gICAgICBjdXJyZW50Q29udGV4dE1hcC5jbGVhcigpO1xuICB9XG5cbiAgcmVuZGVyVGFibGUoKTtcbn1cblxuZnVuY3Rpb24gZ2V0TWFwcGVkVGFicygpOiBUYWJNZXRhZGF0YVtdIHtcbiAgcmV0dXJuIGN1cnJlbnRUYWJzXG4gICAgLm1hcCh0YWIgPT4ge1xuICAgICAgICBjb25zdCBtZXRhZGF0YSA9IG1hcENocm9tZVRhYih0YWIpO1xuICAgICAgICBpZiAoIW1ldGFkYXRhKSByZXR1cm4gbnVsbDtcblxuICAgICAgICBjb25zdCBjb250ZXh0UmVzdWx0ID0gY3VycmVudENvbnRleHRNYXAuZ2V0KG1ldGFkYXRhLmlkKTtcbiAgICAgICAgaWYgKGNvbnRleHRSZXN1bHQpIHtcbiAgICAgICAgICAgIG1ldGFkYXRhLmNvbnRleHQgPSBjb250ZXh0UmVzdWx0LmNvbnRleHQ7XG4gICAgICAgICAgICBtZXRhZGF0YS5jb250ZXh0RGF0YSA9IGNvbnRleHRSZXN1bHQuZGF0YTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWV0YWRhdGE7XG4gICAgfSlcbiAgICAuZmlsdGVyKCh0KTogdCBpcyBUYWJNZXRhZGF0YSA9PiB0ICE9PSBudWxsKTtcbn1cblxuZnVuY3Rpb24gaGFuZGxlU29ydChrZXk6IHN0cmluZykge1xuICBpZiAoc29ydEtleSA9PT0ga2V5KSB7XG4gICAgc29ydERpcmVjdGlvbiA9IHNvcnREaXJlY3Rpb24gPT09ICdhc2MnID8gJ2Rlc2MnIDogJ2FzYyc7XG4gIH0gZWxzZSB7XG4gICAgc29ydEtleSA9IGtleTtcbiAgICBzb3J0RGlyZWN0aW9uID0gJ2FzYyc7XG4gIH1cbiAgdXBkYXRlSGVhZGVyU3R5bGVzKCk7XG4gIHJlbmRlclRhYmxlKCk7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUhlYWRlclN0eWxlcygpIHtcbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgndGguc29ydGFibGUnKS5mb3JFYWNoKHRoID0+IHtcbiAgICB0aC5jbGFzc0xpc3QucmVtb3ZlKCdzb3J0LWFzYycsICdzb3J0LWRlc2MnKTtcbiAgICBpZiAodGguZ2V0QXR0cmlidXRlKCdkYXRhLWtleScpID09PSBzb3J0S2V5KSB7XG4gICAgICB0aC5jbGFzc0xpc3QuYWRkKHNvcnREaXJlY3Rpb24gPT09ICdhc2MnID8gJ3NvcnQtYXNjJyA6ICdzb3J0LWRlc2MnKTtcbiAgICB9XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBnZXRTb3J0VmFsdWUodGFiOiBjaHJvbWUudGFicy5UYWIsIGtleTogc3RyaW5nKTogYW55IHtcbiAgc3dpdGNoIChrZXkpIHtcbiAgICBjYXNlICdwYXJlbnRUaXRsZSc6XG4gICAgICByZXR1cm4gdGFiLm9wZW5lclRhYklkID8gKHRhYlRpdGxlcy5nZXQodGFiLm9wZW5lclRhYklkKSB8fCAnJykgOiAnJztcbiAgICBjYXNlICdnZW5yZSc6XG4gICAgICByZXR1cm4gKHRhYi5pZCAmJiBjdXJyZW50Q29udGV4dE1hcC5nZXQodGFiLmlkKT8uZGF0YT8uZ2VucmUpIHx8ICcnO1xuICAgIGNhc2UgJ2NvbnRleHQnOlxuICAgICAgcmV0dXJuICh0YWIuaWQgJiYgY3VycmVudENvbnRleHRNYXAuZ2V0KHRhYi5pZCk/LmNvbnRleHQpIHx8ICcnO1xuICAgIGNhc2UgJ2FjdGl2ZSc6XG4gICAgY2FzZSAncGlubmVkJzpcbiAgICAgIHJldHVybiAodGFiIGFzIGFueSlba2V5XSA/IDEgOiAwO1xuICAgIGNhc2UgJ2lkJzpcbiAgICBjYXNlICdpbmRleCc6XG4gICAgY2FzZSAnd2luZG93SWQnOlxuICAgIGNhc2UgJ2dyb3VwSWQnOlxuICAgIGNhc2UgJ29wZW5lclRhYklkJzpcbiAgICAgIHJldHVybiAodGFiIGFzIGFueSlba2V5XSB8fCAtMTtcbiAgICBjYXNlICdsYXN0QWNjZXNzZWQnOlxuICAgICAgcmV0dXJuICh0YWIgYXMgYW55KVtrZXldIHx8IDA7XG4gICAgY2FzZSAndGl0bGUnOlxuICAgIGNhc2UgJ3VybCc6XG4gICAgY2FzZSAnc3RhdHVzJzpcbiAgICAgIHJldHVybiAoKHRhYiBhcyBhbnkpW2tleV0gfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAodGFiIGFzIGFueSlba2V5XTtcbiAgfVxufVxuXG5mdW5jdGlvbiByZW5kZXJUYWJsZSgpIHtcbiAgY29uc3QgdGJvZHkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjdGFic1RhYmxlIHRib2R5Jyk7XG4gIGlmICghdGJvZHkpIHJldHVybjtcblxuICAvLyAxLiBGaWx0ZXJcbiAgbGV0IHRhYnNEaXNwbGF5ID0gY3VycmVudFRhYnMuZmlsdGVyKHRhYiA9PiB7XG4gICAgICAvLyBHbG9iYWwgU2VhcmNoXG4gICAgICBpZiAoZ2xvYmFsU2VhcmNoUXVlcnkpIHtcbiAgICAgICAgICBjb25zdCBxID0gZ2xvYmFsU2VhcmNoUXVlcnkudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICBjb25zdCBzZWFyY2hhYmxlVGV4dCA9IGAke3RhYi50aXRsZX0gJHt0YWIudXJsfSAke3RhYi5pZH1gLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgaWYgKCFzZWFyY2hhYmxlVGV4dC5pbmNsdWRlcyhxKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICAvLyBDb2x1bW4gRmlsdGVyc1xuICAgICAgZm9yIChjb25zdCBba2V5LCBmaWx0ZXJdIG9mIE9iamVjdC5lbnRyaWVzKGNvbHVtbkZpbHRlcnMpKSB7XG4gICAgICAgICAgaWYgKCFmaWx0ZXIpIGNvbnRpbnVlO1xuICAgICAgICAgIGNvbnN0IHZhbCA9IFN0cmluZyhnZXRTb3J0VmFsdWUodGFiLCBrZXkpKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgIGlmICghdmFsLmluY2x1ZGVzKGZpbHRlci50b0xvd2VyQ2FzZSgpKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgfSk7XG5cbiAgLy8gMi4gU29ydFxuICBpZiAoc29ydEtleSkge1xuICAgIHRhYnNEaXNwbGF5LnNvcnQoKGEsIGIpID0+IHtcbiAgICAgIGxldCB2YWxBOiBhbnkgPSBnZXRTb3J0VmFsdWUoYSwgc29ydEtleSEpO1xuICAgICAgbGV0IHZhbEI6IGFueSA9IGdldFNvcnRWYWx1ZShiLCBzb3J0S2V5ISk7XG5cbiAgICAgIGlmICh2YWxBIDwgdmFsQikgcmV0dXJuIHNvcnREaXJlY3Rpb24gPT09ICdhc2MnID8gLTEgOiAxO1xuICAgICAgaWYgKHZhbEEgPiB2YWxCKSByZXR1cm4gc29ydERpcmVjdGlvbiA9PT0gJ2FzYycgPyAxIDogLTE7XG4gICAgICByZXR1cm4gMDtcbiAgICB9KTtcbiAgfVxuXG4gIHRib2R5LmlubmVySFRNTCA9ICcnOyAvLyBDbGVhciBleGlzdGluZyByb3dzXG5cbiAgLy8gMy4gUmVuZGVyXG4gIGNvbnN0IHZpc2libGVDb2xzID0gY29sdW1ucy5maWx0ZXIoYyA9PiBjLnZpc2libGUpO1xuXG4gIHRhYnNEaXNwbGF5LmZvckVhY2godGFiID0+IHtcbiAgICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0cicpO1xuXG4gICAgdmlzaWJsZUNvbHMuZm9yRWFjaChjb2wgPT4ge1xuICAgICAgICBjb25zdCB0ZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RkJyk7XG4gICAgICAgIGlmIChjb2wua2V5ID09PSAndGl0bGUnKSB0ZC5jbGFzc0xpc3QuYWRkKCd0aXRsZS1jZWxsJyk7XG4gICAgICAgIGlmIChjb2wua2V5ID09PSAndXJsJykgdGQuY2xhc3NMaXN0LmFkZCgndXJsLWNlbGwnKTtcblxuICAgICAgICBjb25zdCB2YWwgPSBnZXRDZWxsVmFsdWUodGFiLCBjb2wua2V5KTtcblxuICAgICAgICBpZiAodmFsIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpIHtcbiAgICAgICAgICAgIHRkLmFwcGVuZENoaWxkKHZhbCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0ZC5pbm5lckhUTUwgPSB2YWw7XG4gICAgICAgICAgICB0ZC50aXRsZSA9IHN0cmlwSHRtbChTdHJpbmcodmFsKSk7XG4gICAgICAgIH1cbiAgICAgICAgcm93LmFwcGVuZENoaWxkKHRkKTtcbiAgICB9KTtcblxuICAgIHRib2R5LmFwcGVuZENoaWxkKHJvdyk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBzdHJpcEh0bWwoaHRtbDogc3RyaW5nKSB7XG4gICAgbGV0IHRtcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJESVZcIik7XG4gICAgdG1wLmlubmVySFRNTCA9IGh0bWw7XG4gICAgcmV0dXJuIHRtcC50ZXh0Q29udGVudCB8fCB0bXAuaW5uZXJUZXh0IHx8IFwiXCI7XG59XG5cblxuZnVuY3Rpb24gZ2V0Q2VsbFZhbHVlKHRhYjogY2hyb21lLnRhYnMuVGFiLCBrZXk6IHN0cmluZyk6IHN0cmluZyB8IEhUTUxFbGVtZW50IHtcbiAgICBjb25zdCBlc2NhcGUgPSBlc2NhcGVIdG1sO1xuXG4gICAgc3dpdGNoIChrZXkpIHtcbiAgICAgICAgY2FzZSAnaWQnOiByZXR1cm4gU3RyaW5nKHRhYi5pZCA/PyAnTi9BJyk7XG4gICAgICAgIGNhc2UgJ2luZGV4JzogcmV0dXJuIFN0cmluZyh0YWIuaW5kZXgpO1xuICAgICAgICBjYXNlICd3aW5kb3dJZCc6IHJldHVybiBTdHJpbmcodGFiLndpbmRvd0lkKTtcbiAgICAgICAgY2FzZSAnZ3JvdXBJZCc6IHJldHVybiBTdHJpbmcodGFiLmdyb3VwSWQpO1xuICAgICAgICBjYXNlICd0aXRsZSc6IHJldHVybiBlc2NhcGUodGFiLnRpdGxlIHx8ICcnKTtcbiAgICAgICAgY2FzZSAndXJsJzogcmV0dXJuIGVzY2FwZSh0YWIudXJsIHx8ICcnKTtcbiAgICAgICAgY2FzZSAnc3RhdHVzJzogcmV0dXJuIGVzY2FwZSh0YWIuc3RhdHVzIHx8ICcnKTtcbiAgICAgICAgY2FzZSAnYWN0aXZlJzogcmV0dXJuIHRhYi5hY3RpdmUgPyAnWWVzJyA6ICdObyc7XG4gICAgICAgIGNhc2UgJ3Bpbm5lZCc6IHJldHVybiB0YWIucGlubmVkID8gJ1llcycgOiAnTm8nO1xuICAgICAgICBjYXNlICdvcGVuZXJUYWJJZCc6IHJldHVybiBTdHJpbmcodGFiLm9wZW5lclRhYklkID8/ICctJyk7XG4gICAgICAgIGNhc2UgJ3BhcmVudFRpdGxlJzpcbiAgICAgICAgICAgICByZXR1cm4gZXNjYXBlKHRhYi5vcGVuZXJUYWJJZCA/ICh0YWJUaXRsZXMuZ2V0KHRhYi5vcGVuZXJUYWJJZCkgfHwgJ1Vua25vd24nKSA6ICctJyk7XG4gICAgICAgIGNhc2UgJ2dlbnJlJzpcbiAgICAgICAgICAgICByZXR1cm4gZXNjYXBlKCh0YWIuaWQgJiYgY3VycmVudENvbnRleHRNYXAuZ2V0KHRhYi5pZCk/LmRhdGE/LmdlbnJlKSB8fCAnLScpO1xuICAgICAgICBjYXNlICdjb250ZXh0Jzoge1xuICAgICAgICAgICAgY29uc3QgY29udGV4dFJlc3VsdCA9IHRhYi5pZCA/IGN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpIDogdW5kZWZpbmVkO1xuICAgICAgICAgICAgaWYgKCFjb250ZXh0UmVzdWx0KSByZXR1cm4gJ04vQSc7XG5cbiAgICAgICAgICAgIGxldCBjZWxsU3R5bGUgPSAnJztcbiAgICAgICAgICAgIGxldCBhaUNvbnRleHQgPSAnJztcblxuICAgICAgICAgICAgaWYgKGNvbnRleHRSZXN1bHQuc3RhdHVzID09PSAnUkVTVFJJQ1RFRCcpIHtcbiAgICAgICAgICAgICAgICBhaUNvbnRleHQgPSAnVW5leHRyYWN0YWJsZSAocmVzdHJpY3RlZCknO1xuICAgICAgICAgICAgICAgIGNlbGxTdHlsZSA9ICdjb2xvcjogZ3JheTsgZm9udC1zdHlsZTogaXRhbGljOyc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNvbnRleHRSZXN1bHQuZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBhaUNvbnRleHQgPSBgRXJyb3IgKCR7Y29udGV4dFJlc3VsdC5lcnJvcn0pYDtcbiAgICAgICAgICAgICAgICBjZWxsU3R5bGUgPSAnY29sb3I6IHJlZDsnO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjb250ZXh0UmVzdWx0LnNvdXJjZSA9PT0gJ0V4dHJhY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgYWlDb250ZXh0ID0gYCR7Y29udGV4dFJlc3VsdC5jb250ZXh0fSAoRXh0cmFjdGVkKWA7XG4gICAgICAgICAgICAgICAgY2VsbFN0eWxlID0gJ2NvbG9yOiBncmVlbjsgZm9udC13ZWlnaHQ6IGJvbGQ7JztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgIGFpQ29udGV4dCA9IGAke2NvbnRleHRSZXN1bHQuY29udGV4dH1gO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuICAgICAgICAgICAgY29udGFpbmVyLnN0eWxlLmZsZXhEaXJlY3Rpb24gPSAnY29sdW1uJztcbiAgICAgICAgICAgIGNvbnRhaW5lci5zdHlsZS5nYXAgPSAnNXB4JztcblxuICAgICAgICAgICAgY29uc3Qgc3VtbWFyeURpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgc3VtbWFyeURpdi5zdHlsZS5jc3NUZXh0ID0gY2VsbFN0eWxlO1xuICAgICAgICAgICAgc3VtbWFyeURpdi50ZXh0Q29udGVudCA9IGFpQ29udGV4dDtcbiAgICAgICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChzdW1tYXJ5RGl2KTtcblxuICAgICAgICAgICAgaWYgKGNvbnRleHRSZXN1bHQuZGF0YSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRldGFpbHMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwcmUnKTtcbiAgICAgICAgICAgICAgICBkZXRhaWxzLnN0eWxlLmNzc1RleHQgPSAnbWF4LWhlaWdodDogMzAwcHg7IG92ZXJmbG93OiBhdXRvOyBmb250LXNpemU6IDExcHg7IHRleHQtYWxpZ246IGxlZnQ7IGJhY2tncm91bmQ6ICNmNWY1ZjU7IHBhZGRpbmc6IDVweDsgYm9yZGVyOiAxcHggc29saWQgI2RkZDsgbWFyZ2luOiAwOyB3aGl0ZS1zcGFjZTogcHJlLXdyYXA7IGZvbnQtZmFtaWx5OiBtb25vc3BhY2U7JztcbiAgICAgICAgICAgICAgICBkZXRhaWxzLnRleHRDb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoY29udGV4dFJlc3VsdC5kYXRhLCBudWxsLCAyKTtcbiAgICAgICAgICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZGV0YWlscyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBjb250YWluZXI7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSAnbGFzdEFjY2Vzc2VkJzpcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGF0ZSgodGFiIGFzIGFueSkubGFzdEFjY2Vzc2VkIHx8IDApLnRvTG9jYWxlU3RyaW5nKCk7XG4gICAgICAgIGNhc2UgJ2FjdGlvbnMnOiB7XG4gICAgICAgICAgICBjb25zdCB3cmFwcGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICB3cmFwcGVyLmlubmVySFRNTCA9IGBcbiAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZ290by10YWItYnRuXCIgZGF0YS10YWItaWQ9XCIke3RhYi5pZH1cIiBkYXRhLXdpbmRvdy1pZD1cIiR7dGFiLndpbmRvd0lkfVwiPkdvPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImNsb3NlLXRhYi1idG5cIiBkYXRhLXRhYi1pZD1cIiR7dGFiLmlkfVwiIHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjogI2RjMzU0NTsgbWFyZ2luLWxlZnQ6IDJweDtcIj5YPC9idXR0b24+XG4gICAgICAgICAgICBgO1xuICAgICAgICAgICAgcmV0dXJuIHdyYXBwZXI7XG4gICAgICAgIH1cbiAgICAgICAgZGVmYXVsdDogcmV0dXJuICcnO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gcmVuZGVyQWxnb3JpdGhtc1ZpZXcoKSB7XG4gIC8vIFVzZSB1cGRhdGVkIHN0cmF0ZWdpZXMgbGlzdCBpbmNsdWRpbmcgY3VzdG9tIG9uZXNcbiAgcmVuZGVyU3RyYXRlZ3lDb25maWcoKTtcblxuICBjb25zdCBncm91cGluZ1JlZiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdncm91cGluZy1yZWYnKTtcbiAgY29uc3Qgc29ydGluZ1JlZiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzb3J0aW5nLXJlZicpO1xuXG4gIGlmIChncm91cGluZ1JlZikge1xuICAgICAgLy8gUmUtcmVuZGVyIGJlY2F1c2Ugc3RyYXRlZ3kgbGlzdCBtaWdodCBjaGFuZ2VcbiAgICAgIGNvbnN0IGFsbFN0cmF0ZWdpZXM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0gZ2V0U3RyYXRlZ2llcyhsb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgICAgY29uc3QgZ3JvdXBpbmdzID0gYWxsU3RyYXRlZ2llcy5maWx0ZXIocyA9PiBzLmlzR3JvdXBpbmcpO1xuXG4gICAgICBncm91cGluZ1JlZi5pbm5lckhUTUwgPSBncm91cGluZ3MubWFwKGcgPT4ge1xuICAgICAgICAgY29uc3QgaXNDdXN0b20gPSBsb2NhbEN1c3RvbVN0cmF0ZWdpZXMuc29tZShzID0+IHMuaWQgPT09IGcuaWQpO1xuICAgICAgICAgbGV0IGRlc2MgPSBcIkJ1aWx0LWluIHN0cmF0ZWd5XCI7XG4gICAgICAgICBpZiAoaXNDdXN0b20pIGRlc2MgPSBcIkN1c3RvbSBzdHJhdGVneSBkZWZpbmVkIGJ5IHJ1bGVzLlwiO1xuICAgICAgICAgZWxzZSBpZiAoZy5pZCA9PT0gJ2RvbWFpbicpIGRlc2MgPSAnR3JvdXBzIHRhYnMgYnkgdGhlaXIgZG9tYWluIG5hbWUuJztcbiAgICAgICAgIGVsc2UgaWYgKGcuaWQgPT09ICd0b3BpYycpIGRlc2MgPSAnR3JvdXBzIGJhc2VkIG9uIGtleXdvcmRzIGluIHRoZSB0aXRsZS4nO1xuXG4gICAgICAgICByZXR1cm4gYFxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1pdGVtXCI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktbmFtZVwiPiR7Zy5sYWJlbH0gKCR7Zy5pZH0pICR7aXNDdXN0b20gPyAnPHNwYW4gc3R5bGU9XCJjb2xvcjogYmx1ZTsgZm9udC1zaXplOiAwLjhlbTtcIj5DdXN0b208L3NwYW4+JyA6ICcnfTwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInN0cmF0ZWd5LWRlc2NcIj4ke2Rlc2N9PC9kaXY+XG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwic3RyYXRlZ3ktdmlldy1idG5cIiBkYXRhLXR5cGU9XCJncm91cGluZ1wiIGRhdGEtbmFtZT1cIiR7Zy5pZH1cIj5WaWV3IExvZ2ljPC9idXR0b24+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgIGA7XG4gICAgICB9KS5qb2luKCcnKTtcbiAgfVxuXG4gIGlmIChzb3J0aW5nUmVmKSB7XG4gICAgLy8gUmUtcmVuZGVyIHNvcnRpbmcgc3RyYXRlZ2llcyB0b29cbiAgICBjb25zdCBhbGxTdHJhdGVnaWVzOiBTdHJhdGVneURlZmluaXRpb25bXSA9IGdldFN0cmF0ZWdpZXMobG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcbiAgICBjb25zdCBzb3J0aW5ncyA9IGFsbFN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gcy5pc1NvcnRpbmcpO1xuXG4gICAgc29ydGluZ1JlZi5pbm5lckhUTUwgPSBzb3J0aW5ncy5tYXAocyA9PiB7XG4gICAgICAgIGxldCBkZXNjID0gXCJCdWlsdC1pbiBzb3J0aW5nXCI7XG4gICAgICAgIGlmIChzLmlkID09PSAncmVjZW5jeScpIGRlc2MgPSAnU29ydHMgYnkgbGFzdCBhY2Nlc3NlZCB0aW1lIChtb3N0IHJlY2VudCBmaXJzdCkuJztcbiAgICAgICAgZWxzZSBpZiAocy5pZCA9PT0gJ25lc3RpbmcnKSBkZXNjID0gJ1NvcnRzIGJhc2VkIG9uIGhpZXJhcmNoeSAocm9vdHMgdnMgY2hpbGRyZW4pLic7XG4gICAgICAgIGVsc2UgaWYgKHMuaWQgPT09ICdwaW5uZWQnKSBkZXNjID0gJ0tlZXBzIHBpbm5lZCB0YWJzIGF0IHRoZSBiZWdpbm5pbmcgb2YgdGhlIGxpc3QuJztcblxuICAgICAgICByZXR1cm4gYFxuICAgICAgPGRpdiBjbGFzcz1cInN0cmF0ZWd5LWl0ZW1cIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cInN0cmF0ZWd5LW5hbWVcIj4ke3MubGFiZWx9PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1kZXNjXCI+JHtkZXNjfTwvZGl2PlxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwic3RyYXRlZ3ktdmlldy1idG5cIiBkYXRhLXR5cGU9XCJzb3J0aW5nXCIgZGF0YS1uYW1lPVwiJHtzLmlkfVwiPlZpZXcgTG9naWM8L2J1dHRvbj5cbiAgICAgIDwvZGl2PlxuICAgIGA7XG4gICAgfSkuam9pbignJyk7XG4gIH1cblxuICBjb25zdCByZWdpc3RyeVJlZiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZWdpc3RyeS1yZWYnKTtcbiAgaWYgKHJlZ2lzdHJ5UmVmICYmIHJlZ2lzdHJ5UmVmLmNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmVnaXN0cnlSZWYuaW5uZXJIVE1MID0gYFxuICAgICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktaXRlbVwiPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInN0cmF0ZWd5LW5hbWVcIj5HZW5lcmEgUmVnaXN0cnk8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1kZXNjXCI+U3RhdGljIGxvb2t1cCB0YWJsZSBmb3IgZG9tYWluIGNsYXNzaWZpY2F0aW9uIChhcHByb3ggJHtPYmplY3Qua2V5cyhHRU5FUkFfUkVHSVNUUlkpLmxlbmd0aH0gZW50cmllcykuPC9kaXY+XG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwic3RyYXRlZ3ktdmlldy1idG5cIiBkYXRhLXR5cGU9XCJyZWdpc3RyeVwiIGRhdGEtbmFtZT1cImdlbmVyYVwiPlZpZXcgVGFibGU8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICBgO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlbmRlclN0cmF0ZWd5Q29uZmlnKCkge1xuICBjb25zdCBncm91cGluZ0xpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2ltLWdyb3VwaW5nLWxpc3QnKTtcbiAgY29uc3Qgc29ydGluZ0xpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2ltLXNvcnRpbmctbGlzdCcpO1xuXG4gIC8vIFVzZSBkeW5hbWljIHN0cmF0ZWd5IGxpc3RcbiAgY29uc3Qgc3RyYXRlZ2llczogU3RyYXRlZ3lEZWZpbml0aW9uW10gPSBnZXRTdHJhdGVnaWVzKGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyk7XG5cbiAgaWYgKGdyb3VwaW5nTGlzdCkge1xuICAgICAgY29uc3QgZ3JvdXBpbmdTdHJhdGVnaWVzID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiBzLmlzR3JvdXBpbmcpO1xuICAgICAgLy8gV2Ugc2hvdWxkIHByZXNlcnZlIGNoZWNrZWQgc3RhdGUgaWYgcmUtcmVuZGVyaW5nLCBidXQgZm9yIG5vdyBqdXN0IGRlZmF1bHRpbmcgaXMgb2theSBvciByZWFkaW5nIGN1cnJlbnQgRE9NXG4gICAgICAvLyBTaW1wbGlmaWNhdGlvbjoganVzdCByZS1yZW5kZXIuXG4gICAgICByZW5kZXJTdHJhdGVneUxpc3QoZ3JvdXBpbmdMaXN0LCBncm91cGluZ1N0cmF0ZWdpZXMsIFsnZG9tYWluJywgJ3RvcGljJ10pO1xuICB9XG5cbiAgaWYgKHNvcnRpbmdMaXN0KSB7XG4gICAgICBjb25zdCBzb3J0aW5nU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gcy5pc1NvcnRpbmcpO1xuICAgICAgcmVuZGVyU3RyYXRlZ3lMaXN0KHNvcnRpbmdMaXN0LCBzb3J0aW5nU3RyYXRlZ2llcywgWydwaW5uZWQnLCAncmVjZW5jeSddKTtcbiAgfVxufVxuXG5mdW5jdGlvbiByZW5kZXJTdHJhdGVneUxpc3QoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgc3RyYXRlZ2llczogU3RyYXRlZ3lEZWZpbml0aW9uW10sIGRlZmF1bHRFbmFibGVkOiBzdHJpbmdbXSkge1xuICAgIGNvbnRhaW5lci5pbm5lckhUTUwgPSAnJztcblxuICAgIC8vIFNvcnQgZW5hYmxlZCBieSB0aGVpciBpbmRleCBpbiBkZWZhdWx0RW5hYmxlZFxuICAgIGNvbnN0IGVuYWJsZWQgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IGRlZmF1bHRFbmFibGVkLmluY2x1ZGVzKHMuaWQgYXMgc3RyaW5nKSk7XG4gICAgLy8gU2FmZSBpbmRleG9mIGNoZWNrIHNpbmNlIGlkcyBhcmUgc3RyaW5ncyBpbiBkZWZhdWx0RW5hYmxlZFxuICAgIGVuYWJsZWQuc29ydCgoYSwgYikgPT4gZGVmYXVsdEVuYWJsZWQuaW5kZXhPZihhLmlkIGFzIHN0cmluZykgLSBkZWZhdWx0RW5hYmxlZC5pbmRleE9mKGIuaWQgYXMgc3RyaW5nKSk7XG5cbiAgICBjb25zdCBkaXNhYmxlZCA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gIWRlZmF1bHRFbmFibGVkLmluY2x1ZGVzKHMuaWQgYXMgc3RyaW5nKSk7XG5cbiAgICAvLyBJbml0aWFsIHJlbmRlciBvcmRlcjogRW5hYmxlZCAob3JkZXJlZCkgdGhlbiBEaXNhYmxlZFxuICAgIGNvbnN0IG9yZGVyZWQgPSBbLi4uZW5hYmxlZCwgLi4uZGlzYWJsZWRdO1xuXG4gICAgb3JkZXJlZC5mb3JFYWNoKHN0cmF0ZWd5ID0+IHtcbiAgICAgICAgY29uc3QgaXNDaGVja2VkID0gZGVmYXVsdEVuYWJsZWQuaW5jbHVkZXMoc3RyYXRlZ3kuaWQpO1xuICAgICAgICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgcm93LmNsYXNzTmFtZSA9IGBzdHJhdGVneS1yb3cgJHtpc0NoZWNrZWQgPyAnJyA6ICdkaXNhYmxlZCd9YDtcbiAgICAgICAgcm93LmRhdGFzZXQuaWQgPSBzdHJhdGVneS5pZDtcbiAgICAgICAgcm93LmRyYWdnYWJsZSA9IHRydWU7XG5cbiAgICAgICAgcm93LmlubmVySFRNTCA9IGBcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJkcmFnLWhhbmRsZVwiPlx1MjYzMDwvZGl2PlxuICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiICR7aXNDaGVja2VkID8gJ2NoZWNrZWQnIDogJyd9PlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJzdHJhdGVneS1sYWJlbFwiPiR7c3RyYXRlZ3kubGFiZWx9PC9zcGFuPlxuICAgICAgICBgO1xuXG4gICAgICAgIC8vIEFkZCBsaXN0ZW5lcnNcbiAgICAgICAgY29uc3QgY2hlY2tib3ggPSByb3cucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJyk7XG4gICAgICAgIGNoZWNrYm94Py5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY2hlY2tlZCA9IChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS5jaGVja2VkO1xuICAgICAgICAgICAgcm93LmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgIWNoZWNrZWQpO1xuICAgICAgICB9KTtcblxuICAgICAgICBhZGREbkRMaXN0ZW5lcnMocm93LCBjb250YWluZXIpO1xuXG4gICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChyb3cpO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBhZGREbkRMaXN0ZW5lcnMocm93OiBIVE1MRWxlbWVudCwgY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICByb3cuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ3N0YXJ0JywgKGUpID0+IHtcbiAgICByb3cuY2xhc3NMaXN0LmFkZCgnZHJhZ2dpbmcnKTtcbiAgICBpZiAoZS5kYXRhVHJhbnNmZXIpIHtcbiAgICAgICAgZS5kYXRhVHJhbnNmZXIuZWZmZWN0QWxsb3dlZCA9ICdtb3ZlJztcbiAgICAgICAgLy8gU2V0IGEgdHJhbnNwYXJlbnQgaW1hZ2Ugb3Igc2ltaWxhciBpZiBkZXNpcmVkLCBidXQgZGVmYXVsdCBpcyB1c3VhbGx5IGZpbmVcbiAgICB9XG4gIH0pO1xuXG4gIHJvdy5hZGRFdmVudExpc3RlbmVyKCdkcmFnZW5kJywgKCkgPT4ge1xuICAgIHJvdy5jbGFzc0xpc3QucmVtb3ZlKCdkcmFnZ2luZycpO1xuICB9KTtcblxuICAvLyBUaGUgY29udGFpbmVyIGhhbmRsZXMgdGhlIGRyb3Agem9uZSBsb2dpYyB2aWEgZHJhZ292ZXJcbiAgY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdvdmVyJywgKGUpID0+IHtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgY29uc3QgYWZ0ZXJFbGVtZW50ID0gZ2V0RHJhZ0FmdGVyRWxlbWVudChjb250YWluZXIsIGUuY2xpZW50WSwgJy5zdHJhdGVneS1yb3c6bm90KC5kcmFnZ2luZyknKTtcbiAgICBjb25zdCBkcmFnZ2FibGUgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignLmRyYWdnaW5nJyk7XG4gICAgaWYgKGRyYWdnYWJsZSkge1xuICAgICAgaWYgKGFmdGVyRWxlbWVudCA9PSBudWxsKSB7XG4gICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChkcmFnZ2FibGUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29udGFpbmVyLmluc2VydEJlZm9yZShkcmFnZ2FibGUsIGFmdGVyRWxlbWVudCk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbn1cblxuZnVuY3Rpb24gc2hvd01vZGFsKHRpdGxlOiBzdHJpbmcsIGNvbnRlbnQ6IEhUTUxFbGVtZW50IHwgc3RyaW5nKSB7XG4gICAgY29uc3QgbW9kYWxPdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgbW9kYWxPdmVybGF5LmNsYXNzTmFtZSA9ICdtb2RhbC1vdmVybGF5JztcbiAgICBtb2RhbE92ZXJsYXkuaW5uZXJIVE1MID0gYFxuICAgICAgICA8ZGl2IGNsYXNzPVwibW9kYWxcIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1oZWFkZXJcIj5cbiAgICAgICAgICAgICAgICA8aDM+JHtlc2NhcGVIdG1sKHRpdGxlKX08L2gzPlxuICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJtb2RhbC1jbG9zZVwiPiZ0aW1lczs8L2J1dHRvbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cIm1vZGFsLWNvbnRlbnRcIj48L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgYDtcblxuICAgIGNvbnN0IGNvbnRlbnRDb250YWluZXIgPSBtb2RhbE92ZXJsYXkucXVlcnlTZWxlY3RvcignLm1vZGFsLWNvbnRlbnQnKSBhcyBIVE1MRWxlbWVudDtcbiAgICBpZiAodHlwZW9mIGNvbnRlbnQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGNvbnRlbnRDb250YWluZXIuaW5uZXJIVE1MID0gY29udGVudDtcbiAgICB9IGVsc2Uge1xuICAgICAgICBjb250ZW50Q29udGFpbmVyLmFwcGVuZENoaWxkKGNvbnRlbnQpO1xuICAgIH1cblxuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQobW9kYWxPdmVybGF5KTtcblxuICAgIGNvbnN0IGNsb3NlQnRuID0gbW9kYWxPdmVybGF5LnF1ZXJ5U2VsZWN0b3IoJy5tb2RhbC1jbG9zZScpO1xuICAgIGNsb3NlQnRuPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZChtb2RhbE92ZXJsYXkpO1xuICAgIH0pO1xuXG4gICAgbW9kYWxPdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgICAgaWYgKGUudGFyZ2V0ID09PSBtb2RhbE92ZXJsYXkpIHtcbiAgICAgICAgICAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKG1vZGFsT3ZlcmxheSk7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gc2hvd1N0cmF0ZWd5RGV0YWlscyh0eXBlOiBzdHJpbmcsIG5hbWU6IHN0cmluZykge1xuICAgIGxldCBjb250ZW50ID0gXCJcIjtcbiAgICBsZXQgdGl0bGUgPSBgJHtuYW1lfSAoJHt0eXBlfSlgO1xuXG4gICAgaWYgKHR5cGUgPT09ICdncm91cGluZycpIHtcbiAgICAgICAgaWYgKG5hbWUgPT09ICdkb21haW4nKSB7XG4gICAgICAgICAgICBjb250ZW50ID0gYFxuPGgzPkxvZ2ljOiBEb21haW4gRXh0cmFjdGlvbjwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChkb21haW5Gcm9tVXJsLnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5cbjxoMz5Mb2dpYzogR3JvdXBpbmcgS2V5PC9oMz5cbjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKGdyb3VwaW5nS2V5LnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5cbiAgICAgICAgICAgIGA7XG4gICAgICAgIH0gZWxzZSBpZiAobmFtZSA9PT0gJ3RvcGljJykge1xuICAgICAgICAgICAgY29udGVudCA9IGBcbjxoMz5Mb2dpYzogU2VtYW50aWMgQnVja2V0aW5nPC9oMz5cbjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKHNlbWFudGljQnVja2V0LnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5cbjxoMz5Mb2dpYzogR3JvdXBpbmcgS2V5PC9oMz5cbjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKGdyb3VwaW5nS2V5LnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5cbiAgICAgICAgICAgIGA7XG4gICAgICAgIH0gZWxzZSBpZiAobmFtZSA9PT0gJ2xpbmVhZ2UnKSB7XG4gICAgICAgICAgICBjb250ZW50ID0gYFxuPGgzPkxvZ2ljOiBOYXZpZ2F0aW9uIEtleTwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChuYXZpZ2F0aW9uS2V5LnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5cbjxoMz5Mb2dpYzogR3JvdXBpbmcgS2V5PC9oMz5cbjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKGdyb3VwaW5nS2V5LnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5cbiAgICAgICAgICAgIGA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBDaGVjayBmb3IgY3VzdG9tIHN0cmF0ZWd5IGRldGFpbHNcbiAgICAgICAgICAgIGNvbnN0IGN1c3RvbSA9IGxvY2FsQ3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gbmFtZSk7XG4gICAgICAgICAgICBpZiAoY3VzdG9tKSB7XG4gICAgICAgICAgICAgICAgY29udGVudCA9IGBcbjxoMz5DdXN0b20gU3RyYXRlZ3k6ICR7ZXNjYXBlSHRtbChjdXN0b20ubGFiZWwpfTwvaDM+XG48cD48Yj5Db25maWd1cmF0aW9uOjwvYj48L3A+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChKU09OLnN0cmluZ2lmeShjdXN0b20sIG51bGwsIDIpKX08L2NvZGU+PC9wcmU+XG48aDM+TG9naWM6IEdyb3VwaW5nIEtleTwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChncm91cGluZ0tleS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG4gICAgICAgICAgICAgICAgYDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29udGVudCA9IGBcbjxoMz5Mb2dpYzogR3JvdXBpbmcgS2V5PC9oMz5cbjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKGdyb3VwaW5nS2V5LnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5cbiAgICAgICAgICAgICAgICBgO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAnc29ydGluZycpIHtcbiAgICAgICAgY29udGVudCA9IGBcbjxoMz5Mb2dpYzogQ29tcGFyaXNvbiBGdW5jdGlvbjwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChjb21wYXJlQnkudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPlxuICAgICAgICBgO1xuXG4gICAgICAgIGlmIChuYW1lID09PSAncmVjZW5jeScpIHtcbiAgICAgICAgICAgICBjb250ZW50ICs9IGA8aDM+TG9naWM6IFJlY2VuY3kgU2NvcmU8L2gzPjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKHJlY2VuY3lTY29yZS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+YDtcbiAgICAgICAgfSBlbHNlIGlmIChuYW1lID09PSAnbmVzdGluZycpIHtcbiAgICAgICAgICAgICBjb250ZW50ICs9IGA8aDM+TG9naWM6IEhpZXJhcmNoeSBTY29yZTwvaDM+PHByZT48Y29kZT4ke2VzY2FwZUh0bWwoaGllcmFyY2h5U2NvcmUudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPmA7XG4gICAgICAgIH0gZWxzZSBpZiAobmFtZSA9PT0gJ3Bpbm5lZCcpIHtcbiAgICAgICAgICAgICBjb250ZW50ICs9IGA8aDM+TG9naWM6IFBpbm5lZCBTY29yZTwvaDM+PHByZT48Y29kZT4ke2VzY2FwZUh0bWwocGlubmVkU2NvcmUudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPmA7XG4gICAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdyZWdpc3RyeScgJiYgbmFtZSA9PT0gJ2dlbmVyYScpIHtcbiAgICAgICAgY29uc3QganNvbiA9IEpTT04uc3RyaW5naWZ5KEdFTkVSQV9SRUdJU1RSWSwgbnVsbCwgMik7XG4gICAgICAgIGNvbnRlbnQgPSBgXG48aDM+R2VuZXJhIFJlZ2lzdHJ5IERhdGE8L2gzPlxuPHA+TWFwcGluZyBvZiBkb21haW4gbmFtZXMgdG8gY2F0ZWdvcmllcy48L3A+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChqc29uKX08L2NvZGU+PC9wcmU+XG4gICAgICAgIGA7XG4gICAgfVxuXG4gICAgc2hvd01vZGFsKHRpdGxlLCBjb250ZW50KTtcbn1cblxuZnVuY3Rpb24gZ2V0RW5hYmxlZFN0cmF0ZWdpZXNGcm9tVUkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IFNvcnRpbmdTdHJhdGVneVtdIHtcbiAgICByZXR1cm4gQXJyYXkuZnJvbShjb250YWluZXIuY2hpbGRyZW4pXG4gICAgICAgIC5maWx0ZXIocm93ID0+IChyb3cucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJykgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZClcbiAgICAgICAgLm1hcChyb3cgPT4gKHJvdyBhcyBIVE1MRWxlbWVudCkuZGF0YXNldC5pZCBhcyBTb3J0aW5nU3RyYXRlZ3kpO1xufVxuXG5mdW5jdGlvbiBydW5TaW11bGF0aW9uKCkge1xuICBjb25zdCBncm91cGluZ0xpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2ltLWdyb3VwaW5nLWxpc3QnKTtcbiAgY29uc3Qgc29ydGluZ0xpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2ltLXNvcnRpbmctbGlzdCcpO1xuICBjb25zdCByZXN1bHRDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2ltUmVzdWx0cycpO1xuXG4gIGlmICghZ3JvdXBpbmdMaXN0IHx8ICFzb3J0aW5nTGlzdCB8fCAhcmVzdWx0Q29udGFpbmVyKSByZXR1cm47XG5cbiAgY29uc3QgZ3JvdXBpbmdTdHJhdHMgPSBnZXRFbmFibGVkU3RyYXRlZ2llc0Zyb21VSShncm91cGluZ0xpc3QpO1xuICBjb25zdCBzb3J0aW5nU3RyYXRzID0gZ2V0RW5hYmxlZFN0cmF0ZWdpZXNGcm9tVUkoc29ydGluZ0xpc3QpO1xuXG4gIC8vIFByZXBhcmUgZGF0YVxuICBsZXQgdGFicyA9IGdldE1hcHBlZFRhYnMoKTtcblxuICAvLyAxLiBTb3J0XG4gIGlmIChzb3J0aW5nU3RyYXRzLmxlbmd0aCA+IDApIHtcbiAgICB0YWJzID0gc29ydFRhYnModGFicywgc29ydGluZ1N0cmF0cyk7XG4gIH1cblxuICAvLyAyLiBHcm91cFxuICBjb25zdCBncm91cHMgPSBncm91cFRhYnModGFicywgZ3JvdXBpbmdTdHJhdHMpO1xuXG4gIC8vIDMuIFJlbmRlclxuICBpZiAoZ3JvdXBzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmVzdWx0Q29udGFpbmVyLmlubmVySFRNTCA9ICc8cD5ObyBncm91cHMgY3JlYXRlZCAoYXJlIHRoZXJlIGFueSB0YWJzPykuPC9wPic7XG4gICAgICByZXR1cm47XG4gIH1cblxuICByZXN1bHRDb250YWluZXIuaW5uZXJIVE1MID0gZ3JvdXBzLm1hcChncm91cCA9PiBgXG4gICAgPGRpdiBjbGFzcz1cImdyb3VwLXJlc3VsdFwiPlxuICAgICAgPGRpdiBjbGFzcz1cImdyb3VwLWhlYWRlclwiIHN0eWxlPVwiYm9yZGVyLWxlZnQ6IDVweCBzb2xpZCAke2dyb3VwLmNvbG9yfVwiPlxuICAgICAgICA8c3Bhbj4ke2VzY2FwZUh0bWwoZ3JvdXAubGFiZWwgfHwgJ1VuZ3JvdXBlZCcpfTwvc3Bhbj5cbiAgICAgICAgPHNwYW4gY2xhc3M9XCJncm91cC1tZXRhXCI+JHtncm91cC50YWJzLmxlbmd0aH0gdGFicyAmYnVsbDsgUmVhc29uOiAke2VzY2FwZUh0bWwoZ3JvdXAucmVhc29uKX08L3NwYW4+XG4gICAgICA8L2Rpdj5cbiAgICAgIDx1bCBjbGFzcz1cImdyb3VwLXRhYnNcIj5cbiAgICAgICAgJHtncm91cC50YWJzLm1hcCh0YWIgPT4gYFxuICAgICAgICAgIDxsaSBjbGFzcz1cImdyb3VwLXRhYi1pdGVtXCI+XG4gICAgICAgICAgICAke3RhYi5mYXZJY29uVXJsID8gYDxpbWcgc3JjPVwiJHtlc2NhcGVIdG1sKHRhYi5mYXZJY29uVXJsKX1cIiBjbGFzcz1cInRhYi1pY29uXCIgb25lcnJvcj1cInRoaXMuc3R5bGUuZGlzcGxheT0nbm9uZSdcIj5gIDogJzxkaXYgY2xhc3M9XCJ0YWItaWNvblwiPjwvZGl2Pid9XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cInRpdGxlLWNlbGxcIiB0aXRsZT1cIiR7ZXNjYXBlSHRtbCh0YWIudGl0bGUpfVwiPiR7ZXNjYXBlSHRtbCh0YWIudGl0bGUpfTwvc3Bhbj5cbiAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiY29sb3I6ICM5OTk7IGZvbnQtc2l6ZTogMC44ZW07IG1hcmdpbi1sZWZ0OiBhdXRvO1wiPiR7ZXNjYXBlSHRtbChuZXcgVVJMKHRhYi51cmwpLmhvc3RuYW1lKX08L3NwYW4+XG4gICAgICAgICAgPC9saT5cbiAgICAgICAgYCkuam9pbignJyl9XG4gICAgICA8L3VsPlxuICAgIDwvZGl2PlxuICBgKS5qb2luKCcnKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gYXBwbHlUb0Jyb3dzZXIoKSB7XG4gICAgY29uc3QgZ3JvdXBpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1ncm91cGluZy1saXN0Jyk7XG4gICAgY29uc3Qgc29ydGluZ0xpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2ltLXNvcnRpbmctbGlzdCcpO1xuXG4gICAgaWYgKCFncm91cGluZ0xpc3QgfHwgIXNvcnRpbmdMaXN0KSByZXR1cm47XG5cbiAgICBjb25zdCBncm91cGluZ1N0cmF0cyA9IGdldEVuYWJsZWRTdHJhdGVnaWVzRnJvbVVJKGdyb3VwaW5nTGlzdCk7XG4gICAgY29uc3Qgc29ydGluZ1N0cmF0cyA9IGdldEVuYWJsZWRTdHJhdGVnaWVzRnJvbVVJKHNvcnRpbmdMaXN0KTtcblxuICAgIC8vIENvbWJpbmUgc3RyYXRlZ2llcy5cbiAgICAvLyBXZSBwcmlvcml0aXplIGdyb3VwaW5nIHN0cmF0ZWdpZXMgZmlyc3QsIHRoZW4gc29ydGluZyBzdHJhdGVnaWVzLFxuICAgIC8vIGFzIHRoZSBiYWNrZW5kIGZpbHRlcnMgdGhlbSB3aGVuIHBlcmZvcm1pbmcgYWN0aW9ucy5cbiAgICBjb25zdCBhbGxTdHJhdGVnaWVzID0gWy4uLmdyb3VwaW5nU3RyYXRzLCAuLi5zb3J0aW5nU3RyYXRzXTtcblxuICAgIHRyeSB7XG4gICAgICAgIC8vIDEuIFNhdmUgUHJlZmVyZW5jZXNcbiAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgdHlwZTogJ3NhdmVQcmVmZXJlbmNlcycsXG4gICAgICAgICAgICBwYXlsb2FkOiB7IHNvcnRpbmc6IGFsbFN0cmF0ZWdpZXMgfVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyAyLiBUcmlnZ2VyIEFwcGx5IEdyb3VwaW5nICh3aGljaCB1c2VzIHRoZSBuZXcgcHJlZmVyZW5jZXMpXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgdHlwZTogJ2FwcGx5R3JvdXBpbmcnLFxuICAgICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgICAgIHNvcnRpbmc6IGFsbFN0cmF0ZWdpZXMgLy8gUGFzcyBleHBsaWNpdGx5IHRvIGVuc3VyZSBpbW1lZGlhdGUgZWZmZWN0XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vaykge1xuICAgICAgICAgICAgYWxlcnQoXCJBcHBsaWVkIHN1Y2Nlc3NmdWxseSFcIik7XG4gICAgICAgICAgICBsb2FkVGFicygpOyAvLyBSZWZyZXNoIGRhdGFcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGFsZXJ0KFwiRmFpbGVkIHRvIGFwcGx5OiBcIiArIChyZXNwb25zZS5lcnJvciB8fCAnVW5rbm93biBlcnJvcicpKTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkFwcGx5IGZhaWxlZFwiLCBlKTtcbiAgICAgICAgYWxlcnQoXCJBcHBseSBmYWlsZWQ6IFwiICsgZSk7XG4gICAgfVxufVxuXG5cbmZ1bmN0aW9uIGVzY2FwZUh0bWwodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKCF0ZXh0KSByZXR1cm4gJyc7XG4gIHJldHVybiB0ZXh0XG4gICAgLnJlcGxhY2UoLyYvZywgJyZhbXA7JylcbiAgICAucmVwbGFjZSgvPC9nLCAnJmx0OycpXG4gICAgLnJlcGxhY2UoLz4vZywgJyZndDsnKVxuICAgIC5yZXBsYWNlKC9cIi9nLCAnJnF1b3Q7JylcbiAgICAucmVwbGFjZSgvJy9nLCAnJiMwMzk7Jyk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlbmRlckxpdmVWaWV3KCkge1xuICAgIGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsaXZlLXZpZXctY29udGFpbmVyJyk7XG4gICAgaWYgKCFjb250YWluZXIpIHJldHVybjtcblxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7fSk7XG4gICAgICAgIGNvbnN0IGdyb3VwcyA9IGF3YWl0IGNocm9tZS50YWJHcm91cHMucXVlcnkoe30pO1xuICAgICAgICBjb25zdCBncm91cE1hcCA9IG5ldyBNYXAoZ3JvdXBzLm1hcChnID0+IFtnLmlkLCBnXSkpO1xuXG4gICAgICAgIGNvbnN0IHdpbmRvd3MgPSBuZXcgU2V0KHRhYnMubWFwKHQgPT4gdC53aW5kb3dJZCkpO1xuICAgICAgICBjb25zdCB3aW5kb3dJZHMgPSBBcnJheS5mcm9tKHdpbmRvd3MpLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcblxuICAgICAgICBsZXQgaHRtbCA9ICc8ZGl2IHN0eWxlPVwiZm9udC1zaXplOiAwLjllbTsgY29sb3I6ICM2NjY7IG1hcmdpbi1ib3R0b206IDEwcHg7XCI+U2VsZWN0IGl0ZW1zIGJlbG93IHRvIHNpbXVsYXRlIHNwZWNpZmljIHNlbGVjdGlvbiBzdGF0ZXMuPC9kaXY+JztcblxuICAgICAgICBmb3IgKGNvbnN0IHdpbklkIG9mIHdpbmRvd0lkcykge1xuICAgICAgICAgICAgY29uc3Qgd2luVGFicyA9IHRhYnMuZmlsdGVyKHQgPT4gdC53aW5kb3dJZCA9PT0gd2luSWQpO1xuICAgICAgICAgICAgY29uc3Qgd2luU2VsZWN0ZWQgPSB3aW5UYWJzLmV2ZXJ5KHQgPT4gdC5pZCAmJiBzaW11bGF0ZWRTZWxlY3Rpb24uaGFzKHQuaWQpKTtcblxuICAgICAgICAgICAgaHRtbCArPSBgPGRpdiBjbGFzcz1cInNlbGVjdGFibGUtaXRlbSAke3dpblNlbGVjdGVkID8gJ3NlbGVjdGVkJyA6ICcnfVwiIGRhdGEtdHlwZT1cIndpbmRvd1wiIGRhdGEtaWQ9XCIke3dpbklkfVwiIHN0eWxlPVwibWFyZ2luLWJvdHRvbTogMTVweDsgYm9yZGVyLXJhZGl1czogNHB4OyBwYWRkaW5nOiA1cHg7XCI+YDtcbiAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgc3R5bGU9XCJmb250LXdlaWdodDogYm9sZDtcIj5XaW5kb3cgJHt3aW5JZH08L2Rpdj5gO1xuXG4gICAgICAgICAgICAvLyBPcmdhbml6ZSBieSBncm91cFxuICAgICAgICAgICAgY29uc3Qgd2luR3JvdXBzID0gbmV3IE1hcDxudW1iZXIsIGNocm9tZS50YWJzLlRhYltdPigpO1xuICAgICAgICAgICAgY29uc3QgdW5ncm91cGVkOiBjaHJvbWUudGFicy5UYWJbXSA9IFtdO1xuXG4gICAgICAgICAgICB3aW5UYWJzLmZvckVhY2godCA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHQuZ3JvdXBJZCAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF3aW5Hcm91cHMuaGFzKHQuZ3JvdXBJZCkpIHdpbkdyb3Vwcy5zZXQodC5ncm91cElkLCBbXSk7XG4gICAgICAgICAgICAgICAgICAgIHdpbkdyb3Vwcy5nZXQodC5ncm91cElkKSEucHVzaCh0KTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB1bmdyb3VwZWQucHVzaCh0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gUmVuZGVyIFVuZ3JvdXBlZFxuICAgICAgICAgICAgaWYgKHVuZ3JvdXBlZC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgc3R5bGU9XCJtYXJnaW4tbGVmdDogMTBweDsgbWFyZ2luLXRvcDogNXB4O1wiPmA7XG4gICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgc3R5bGU9XCJmb250LXNpemU6IDAuOWVtOyBjb2xvcjogIzU1NTtcIj5Vbmdyb3VwZWQgKCR7dW5ncm91cGVkLmxlbmd0aH0pPC9kaXY+YDtcbiAgICAgICAgICAgICAgICAgdW5ncm91cGVkLmZvckVhY2godCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICBjb25zdCBpc1NlbGVjdGVkID0gdC5pZCAmJiBzaW11bGF0ZWRTZWxlY3Rpb24uaGFzKHQuaWQpO1xuICAgICAgICAgICAgICAgICAgICAgaHRtbCArPSBgPGRpdiBjbGFzcz1cInNlbGVjdGFibGUtaXRlbSAke2lzU2VsZWN0ZWQgPyAnc2VsZWN0ZWQnIDogJyd9XCIgZGF0YS10eXBlPVwidGFiXCIgZGF0YS1pZD1cIiR7dC5pZH1cIiBzdHlsZT1cIm1hcmdpbi1sZWZ0OiAxMHB4OyBwYWRkaW5nOiAycHggNXB4OyBib3JkZXItcmFkaXVzOiAzcHg7IGN1cnNvcjogcG9pbnRlcjsgY29sb3I6ICMzMzM7IHdoaXRlLXNwYWNlOiBub3dyYXA7IG92ZXJmbG93OiBoaWRkZW47IHRleHQtb3ZlcmZsb3c6IGVsbGlwc2lzO1wiPi0gJHtlc2NhcGVIdG1sKHQudGl0bGUgfHwgJ1VudGl0bGVkJyl9PC9kaXY+YDtcbiAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgIGh0bWwgKz0gYDwvZGl2PmA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFJlbmRlciBHcm91cHNcbiAgICAgICAgICAgIGZvciAoY29uc3QgW2dyb3VwSWQsIGdUYWJzXSBvZiB3aW5Hcm91cHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBncm91cEluZm8gPSBncm91cE1hcC5nZXQoZ3JvdXBJZCk7XG4gICAgICAgICAgICAgICAgY29uc3QgY29sb3IgPSBncm91cEluZm8/LmNvbG9yIHx8ICdncmV5JztcbiAgICAgICAgICAgICAgICBjb25zdCB0aXRsZSA9IGdyb3VwSW5mbz8udGl0bGUgfHwgJ1VudGl0bGVkIEdyb3VwJztcbiAgICAgICAgICAgICAgICBjb25zdCBncm91cFNlbGVjdGVkID0gZ1RhYnMuZXZlcnkodCA9PiB0LmlkICYmIHNpbXVsYXRlZFNlbGVjdGlvbi5oYXModC5pZCkpO1xuXG4gICAgICAgICAgICAgICAgaHRtbCArPSBgPGRpdiBjbGFzcz1cInNlbGVjdGFibGUtaXRlbSAke2dyb3VwU2VsZWN0ZWQgPyAnc2VsZWN0ZWQnIDogJyd9XCIgZGF0YS10eXBlPVwiZ3JvdXBcIiBkYXRhLWlkPVwiJHtncm91cElkfVwiIHN0eWxlPVwibWFyZ2luLWxlZnQ6IDEwcHg7IG1hcmdpbi10b3A6IDVweDsgYm9yZGVyLWxlZnQ6IDNweCBzb2xpZCAke2NvbG9yfTsgcGFkZGluZy1sZWZ0OiA1cHg7IHBhZGRpbmc6IDVweDsgYm9yZGVyLXJhZGl1czogM3B4O1wiPmA7XG4gICAgICAgICAgICAgICAgaHRtbCArPSBgPGRpdiBzdHlsZT1cImZvbnQtd2VpZ2h0OiBib2xkOyBmb250LXNpemU6IDAuOWVtO1wiPiR7ZXNjYXBlSHRtbCh0aXRsZSl9ICgke2dUYWJzLmxlbmd0aH0pPC9kaXY+YDtcbiAgICAgICAgICAgICAgICBnVGFicy5mb3JFYWNoKHQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNTZWxlY3RlZCA9IHQuaWQgJiYgc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJzZWxlY3RhYmxlLWl0ZW0gJHtpc1NlbGVjdGVkID8gJ3NlbGVjdGVkJyA6ICcnfVwiIGRhdGEtdHlwZT1cInRhYlwiIGRhdGEtaWQ9XCIke3QuaWR9XCIgc3R5bGU9XCJtYXJnaW4tbGVmdDogMTBweDsgcGFkZGluZzogMnB4IDVweDsgYm9yZGVyLXJhZGl1czogM3B4OyBjdXJzb3I6IHBvaW50ZXI7IGNvbG9yOiAjMzMzOyB3aGl0ZS1zcGFjZTogbm93cmFwOyBvdmVyZmxvdzogaGlkZGVuOyB0ZXh0LW92ZXJmbG93OiBlbGxpcHNpcztcIj4tICR7ZXNjYXBlSHRtbCh0LnRpdGxlIHx8ICdVbnRpdGxlZCcpfTwvZGl2PmA7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaHRtbCArPSBgPC9kaXY+YDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaHRtbCArPSBgPC9kaXY+YDtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnRhaW5lci5pbm5lckhUTUwgPSBodG1sO1xuXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb250YWluZXIuaW5uZXJIVE1MID0gYDxwIHN0eWxlPVwiY29sb3I6cmVkXCI+RXJyb3IgbG9hZGluZyBsaXZlIHZpZXc6ICR7ZX08L3A+YDtcbiAgICB9XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gTE9HIFZJRVdFUiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmxldCBjdXJyZW50TG9nczogTG9nRW50cnlbXSA9IFtdO1xuXG5hc3luYyBmdW5jdGlvbiBsb2FkTG9ncygpIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2dldExvZ3MnIH0pO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgICAgICAgY3VycmVudExvZ3MgPSByZXNwb25zZS5kYXRhO1xuICAgICAgICAgICAgcmVuZGVyTG9ncygpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgbG9nc1wiLCBlKTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNsZWFyUmVtb3RlTG9ncygpIHtcbiAgICB0cnkge1xuICAgICAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdjbGVhckxvZ3MnIH0pO1xuICAgICAgICBsb2FkTG9ncygpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBjbGVhciBsb2dzXCIsIGUpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gcmVuZGVyTG9ncygpIHtcbiAgICBjb25zdCB0Ym9keSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2dzLXRhYmxlLWJvZHknKTtcbiAgICBjb25zdCBsZXZlbEZpbHRlciA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9nLWxldmVsLWZpbHRlcicpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICBjb25zdCBzZWFyY2hUZXh0ID0gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2ctc2VhcmNoJykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUudG9Mb3dlckNhc2UoKTtcblxuICAgIGlmICghdGJvZHkpIHJldHVybjtcblxuICAgIHRib2R5LmlubmVySFRNTCA9ICcnO1xuXG4gICAgY29uc3QgZmlsdGVyZWQgPSBjdXJyZW50TG9ncy5maWx0ZXIoZW50cnkgPT4ge1xuICAgICAgICBpZiAobGV2ZWxGaWx0ZXIgIT09ICdhbGwnICYmIGVudHJ5LmxldmVsICE9PSBsZXZlbEZpbHRlcikgcmV0dXJuIGZhbHNlO1xuICAgICAgICBpZiAoc2VhcmNoVGV4dCkge1xuICAgICAgICAgICAgY29uc3QgdGV4dCA9IGAke2VudHJ5Lm1lc3NhZ2V9ICR7SlNPTi5zdHJpbmdpZnkoZW50cnkuY29udGV4dCB8fCB7fSl9YC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgaWYgKCF0ZXh0LmluY2x1ZGVzKHNlYXJjaFRleHQpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSk7XG5cbiAgICBpZiAoZmlsdGVyZWQubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHRib2R5LmlubmVySFRNTCA9ICc8dHI+PHRkIGNvbHNwYW49XCI0XCIgc3R5bGU9XCJwYWRkaW5nOiAxMHB4OyB0ZXh0LWFsaWduOiBjZW50ZXI7IGNvbG9yOiAjODg4O1wiPk5vIGxvZ3MgZm91bmQuPC90ZD48L3RyPic7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBmaWx0ZXJlZC5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndHInKTtcblxuICAgICAgICAvLyBDb2xvciBjb2RlIGxldmVsXG4gICAgICAgIGxldCBjb2xvciA9ICcjMzMzJztcbiAgICAgICAgaWYgKGVudHJ5LmxldmVsID09PSAnZXJyb3InIHx8IGVudHJ5LmxldmVsID09PSAnY3JpdGljYWwnKSBjb2xvciA9ICdyZWQnO1xuICAgICAgICBlbHNlIGlmIChlbnRyeS5sZXZlbCA9PT0gJ3dhcm4nKSBjb2xvciA9ICdvcmFuZ2UnO1xuICAgICAgICBlbHNlIGlmIChlbnRyeS5sZXZlbCA9PT0gJ2RlYnVnJykgY29sb3IgPSAnYmx1ZSc7XG5cbiAgICAgICAgcm93LmlubmVySFRNTCA9IGBcbiAgICAgICAgICAgIDx0ZCBzdHlsZT1cInBhZGRpbmc6IDhweDsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICNlZWU7IHdoaXRlLXNwYWNlOiBub3dyYXA7XCI+JHtuZXcgRGF0ZShlbnRyeS50aW1lc3RhbXApLnRvTG9jYWxlVGltZVN0cmluZygpfSAoJHtlbnRyeS50aW1lc3RhbXB9KTwvdGQ+XG4gICAgICAgICAgICA8dGQgc3R5bGU9XCJwYWRkaW5nOiA4cHg7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAjZWVlOyBjb2xvcjogJHtjb2xvcn07IGZvbnQtd2VpZ2h0OiBib2xkO1wiPiR7ZW50cnkubGV2ZWwudG9VcHBlckNhc2UoKX08L3RkPlxuICAgICAgICAgICAgPHRkIHN0eWxlPVwicGFkZGluZzogOHB4OyBib3JkZXItYm90dG9tOiAxcHggc29saWQgI2VlZTtcIj4ke2VzY2FwZUh0bWwoZW50cnkubWVzc2FnZSl9PC90ZD5cbiAgICAgICAgICAgIDx0ZCBzdHlsZT1cInBhZGRpbmc6IDhweDsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICNlZWU7XCI+XG4gICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwibWF4LWhlaWdodDogMTAwcHg7IG92ZXJmbG93LXk6IGF1dG87XCI+XG4gICAgICAgICAgICAgICAgICAke2VudHJ5LmNvbnRleHQgPyBgPHByZSBzdHlsZT1cIm1hcmdpbjogMDtcIj4ke2VzY2FwZUh0bWwoSlNPTi5zdHJpbmdpZnkoZW50cnkuY29udGV4dCwgbnVsbCwgMikpfTwvcHJlPmAgOiAnLSd9XG4gICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvdGQ+XG4gICAgICAgIGA7XG4gICAgICAgIHRib2R5LmFwcGVuZENoaWxkKHJvdyk7XG4gICAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRHbG9iYWxMb2dMZXZlbCgpIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvYWRQcmVmZXJlbmNlcycgfSk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmcyA9IHJlc3BvbnNlLmRhdGEgYXMgUHJlZmVyZW5jZXM7XG4gICAgICAgICAgICBjb25zdCBzZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2xvYmFsLWxvZy1sZXZlbCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgaWYgKHNlbGVjdCkge1xuICAgICAgICAgICAgICAgIHNlbGVjdC52YWx1ZSA9IHByZWZzLmxvZ0xldmVsIHx8ICdpbmZvJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIHByZWZzIGZvciBsb2dzXCIsIGUpO1xuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gdXBkYXRlR2xvYmFsTG9nTGV2ZWwoKSB7XG4gICAgY29uc3Qgc2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dsb2JhbC1sb2ctbGV2ZWwnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICBpZiAoIXNlbGVjdCkgcmV0dXJuO1xuICAgIGNvbnN0IGxldmVsID0gc2VsZWN0LnZhbHVlIGFzIExvZ0xldmVsO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgdHlwZTogJ3NhdmVQcmVmZXJlbmNlcycsXG4gICAgICAgICAgICBwYXlsb2FkOiB7IGxvZ0xldmVsOiBsZXZlbCB9XG4gICAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzYXZlIGxvZyBsZXZlbFwiLCBlKTtcbiAgICB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBRUEsSUFBTSxTQUFTO0FBRWYsSUFBTSxpQkFBMkM7QUFBQSxFQUMvQyxPQUFPO0FBQUEsRUFDUCxNQUFNO0FBQUEsRUFDTixNQUFNO0FBQUEsRUFDTixPQUFPO0FBQUEsRUFDUCxVQUFVO0FBQ1o7QUFFQSxJQUFJLGVBQXlCO0FBQzdCLElBQUksT0FBbUIsQ0FBQztBQUN4QixJQUFNLFdBQVc7QUFDakIsSUFBTSxjQUFjO0FBR3BCLElBQU0sa0JBQWtCLE9BQU8sU0FBUyxlQUNoQixPQUFRLEtBQWEsNkJBQTZCLGVBQ2xELGdCQUFpQixLQUFhO0FBQ3RELElBQUksV0FBVztBQUNmLElBQUksY0FBYztBQUNsQixJQUFJLFlBQWtEO0FBRXRELElBQU0sU0FBUyxNQUFNO0FBQ2pCLE1BQUksQ0FBQyxtQkFBbUIsQ0FBQyxRQUFRLFNBQVMsV0FBVyxVQUFVO0FBQzNELGtCQUFjO0FBQ2Q7QUFBQSxFQUNKO0FBRUEsYUFBVztBQUNYLGdCQUFjO0FBRWQsU0FBTyxRQUFRLFFBQVEsSUFBSSxFQUFFLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUMzRCxlQUFXO0FBQ1gsUUFBSSxhQUFhO0FBQ2Isd0JBQWtCO0FBQUEsSUFDdEI7QUFBQSxFQUNKLENBQUMsRUFBRSxNQUFN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QUFDO0FBRUQsTUFBSSxTQUFTLFdBQVcsR0FBRztBQUN2QixVQUFNLFlBQVk7QUFDbEI7QUFBQSxFQUNKO0FBRUEsV0FBUyxRQUFRLFdBQVM7QUFDdEIsVUFBTSxNQUFNLFNBQVMsY0FBYyxJQUFJO0FBR3ZDLFFBQUksUUFBUTtBQUNaLFFBQUksTUFBTSxVQUFVLFdBQVcsTUFBTSxVQUFVLFdBQVksU0FBUTtBQUFBLGFBQzFELE1BQU0sVUFBVSxPQUFRLFNBQVE7QUFBQSxhQUNoQyxNQUFNLFVBQVUsUUFBUyxTQUFRO0FBRTFDLFFBQUksWUFBWTtBQUFBLDRGQUNvRSxJQUFJLEtBQUssTUFBTSxTQUFTLEVBQUUsbUJBQW1CLENBQUMsS0FBSyxNQUFNLFNBQVM7QUFBQSw2RUFDakYsS0FBSyx5QkFBeUIsTUFBTSxNQUFNLFlBQVksQ0FBQztBQUFBLHVFQUM3RCxXQUFXLE1BQU0sT0FBTyxDQUFDO0FBQUE7QUFBQTtBQUFBLG9CQUc1RSxNQUFNLFVBQVUsMkJBQTJCLFdBQVcsS0FBSyxVQUFVLE1BQU0sU0FBUyxNQUFNLENBQUMsQ0FBQyxDQUFDLFdBQVcsR0FBRztBQUFBO0FBQUE7QUFBQTtBQUl2SCxVQUFNLFlBQVksR0FBRztBQUFBLEVBQ3pCLENBQUM7QUFDTDtBQUVBLGVBQWUscUJBQXFCO0FBQ2hDLE1BQUk7QUFDQSxVQUFNLFdBQVcsTUFBTSxPQUFPLFFBQVEsWUFBWSxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFDN0UsUUFBSSxZQUFZLFNBQVMsTUFBTSxTQUFTLE1BQU07QUFDMUMsWUFBTSxRQUFRLFNBQVM7QUFDdkIsWUFBTSxTQUFTLFNBQVMsZUFBZSxrQkFBa0I7QUFDekQsVUFBSSxRQUFRO0FBQ1IsZUFBTyxRQUFRLE1BQU0sWUFBWTtBQUFBLE1BQ3JDO0FBQUEsSUFDSjtBQUFBLEVBQ0osU0FBUyxHQUFHO0FBQ1IsWUFBUSxNQUFNLGlDQUFpQyxDQUFDO0FBQUEsRUFDcEQ7QUFDSjtBQUVBLGVBQWUsdUJBQXVCO0FBQ2xDLFFBQU0sU0FBUyxTQUFTLGVBQWUsa0JBQWtCO0FBQ3pELE1BQUksQ0FBQyxPQUFRO0FBQ2IsUUFBTSxRQUFRLE9BQU87QUFFckIsTUFBSTtBQUNBLFVBQU0sT0FBTyxRQUFRLFlBQVk7QUFBQSxNQUM3QixNQUFNO0FBQUEsTUFDTixTQUFTLEVBQUUsVUFBVSxNQUFNO0FBQUEsSUFDL0IsQ0FBQztBQUFBLEVBQ0wsU0FBUyxHQUFHO0FBQ1IsWUFBUSxNQUFNLDRCQUE0QixDQUFDO0FBQUEsRUFDL0M7QUFDSjsiLAogICJuYW1lcyI6IFsicGFydHMiLCAiY3VzdG9tU3RyYXRlZ2llcyIsICJncm91cFRhYnMiXQp9Cg==
