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
function extractJsonLdFields(jsonLd) {
  let author = null;
  let publishedAt = null;
  let modifiedAt = null;
  let tags = [];
  let breadcrumbs = [];
  const mainEntity = jsonLd.find((i) => i && (i["@type"] === "Article" || i["@type"] === "VideoObject" || i["@type"] === "NewsArticle")) || jsonLd[0];
  if (mainEntity) {
    if (mainEntity.author) {
      if (typeof mainEntity.author === "string") author = mainEntity.author;
      else if (mainEntity.author.name) author = mainEntity.author.name;
      else if (Array.isArray(mainEntity.author) && mainEntity.author[0]?.name) author = mainEntity.author[0].name;
    }
    if (mainEntity.datePublished) publishedAt = mainEntity.datePublished;
    if (mainEntity.dateModified) modifiedAt = mainEntity.dateModified;
    if (mainEntity.keywords) {
      if (typeof mainEntity.keywords === "string") tags = mainEntity.keywords.split(",").map((s) => s.trim());
      else if (Array.isArray(mainEntity.keywords)) tags = mainEntity.keywords;
    }
  }
  const breadcrumbLd = jsonLd.find((i) => i && i["@type"] === "BreadcrumbList");
  if (breadcrumbLd && Array.isArray(breadcrumbLd.itemListElement)) {
    const list = breadcrumbLd.itemListElement.sort((a, b) => a.position - b.position);
    list.forEach((item) => {
      if (item.name) breadcrumbs.push(item.name);
      else if (item.item && item.item.name) breadcrumbs.push(item.item.name);
    });
  }
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
var analyzeTabContext = async (tabs, onProgress) => {
  const contextMap = /* @__PURE__ */ new Map();
  let completed = 0;
  const total = tabs.length;
  const promises = tabs.map(async (tab) => {
    try {
      const cacheKey = `${tab.id}::${tab.url}`;
      if (contextCache.has(cacheKey)) {
        contextMap.set(tab.id, contextCache.get(cacheKey));
        return;
      }
      const result = await fetchContextForTab(tab);
      contextCache.set(cacheKey, result);
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
      for (const sId of appliedStrategies) {
        const rule = getStrategyColorRule(sId);
        if (rule) {
          groupColor = rule.color;
          colorField = rule.colorField;
          break;
        }
      }
      if (groupColor === "match") {
        groupColor = colorForKey(valueKey, 0);
      } else if (groupColor === "field" && colorField) {
        const val = getFieldValue(tab, colorField);
        const key = val !== void 0 && val !== null ? String(val) : "";
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
  groupDiv.style.border = "1px solid #e0e0e0";
  groupDiv.style.borderRadius = "5px";
  groupDiv.style.padding = "10px";
  groupDiv.style.marginBottom = "10px";
  groupDiv.style.backgroundColor = "#fafafa";
  groupDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
            <span style="font-weight: bold; color: #555; font-size: 0.9em;">Group (AND)</span>
            <button class="small-btn btn-del-group" style="background: #ffcccc; color: darkred;">Delete Group</button>
        </div>
        <div class="conditions-container"></div>
        <button class="small-btn btn-add-condition" style="margin-top: 5px;">+ Add Condition</button>
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
    const toggleColor = () => {
      if (randomCheck.checked) {
        colorInput.disabled = true;
        colorInput.style.opacity = "0.5";
        colorFieldSelect.style.display = "none";
      } else {
        colorInput.disabled = false;
        colorInput.style.opacity = "1";
        if (colorInput.value === "field") {
          colorFieldSelect.style.display = "inline-block";
        } else {
          colorFieldSelect.style.display = "none";
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
        }
      } else {
        randomCheck.checked = true;
      }
      randomCheck.dispatchEvent(new Event("change"));
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
    let color = "random";
    let colorField;
    if (!randomCheck.checked) {
      color = colorInput.value;
      if (color === "field") {
        colorField = colorFieldSelect.value;
      }
    }
    if (value) {
      groupingRules.push({ source, value, color, colorField, transform, transformPattern: transform === "regex" ? transformPattern : void 0, windowMode });
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
    const afterElement = getDragAfterElement(container, e.clientY);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC9sb2dnZXIudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZXh0cmFjdGlvbi9sb2dpYy50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9leHRyYWN0aW9uL2dlbmVyYVJlZ2lzdHJ5LnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3N0b3JhZ2UudHMiLCAiLi4vLi4vc3JjL3NoYXJlZC91dGlscy50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9wcmVmZXJlbmNlcy50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9leHRyYWN0aW9uL2luZGV4LnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2NvbnRleHRBbmFseXNpcy50cyIsICIuLi8uLi9zcmMvc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy91aS9kZXZ0b29scy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgTG9nRW50cnksIExvZ0xldmVsLCBQcmVmZXJlbmNlcyB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmNvbnN0IFBSRUZJWCA9IFwiW1RhYlNvcnRlcl1cIjtcblxuY29uc3QgTEVWRUxfUFJJT1JJVFk6IFJlY29yZDxMb2dMZXZlbCwgbnVtYmVyPiA9IHtcbiAgZGVidWc6IDAsXG4gIGluZm86IDEsXG4gIHdhcm46IDIsXG4gIGVycm9yOiAzLFxuICBjcml0aWNhbDogNFxufTtcblxubGV0IGN1cnJlbnRMZXZlbDogTG9nTGV2ZWwgPSBcImluZm9cIjtcbmxldCBsb2dzOiBMb2dFbnRyeVtdID0gW107XG5jb25zdCBNQVhfTE9HUyA9IDEwMDA7XG5jb25zdCBTVE9SQUdFX0tFWSA9IFwic2Vzc2lvbkxvZ3NcIjtcblxuLy8gU2FmZSBjb250ZXh0IGNoZWNrXG5jb25zdCBpc1NlcnZpY2VXb3JrZXIgPSB0eXBlb2Ygc2VsZiAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZSAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYgaW5zdGFuY2VvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZTtcbmxldCBpc1NhdmluZyA9IGZhbHNlO1xubGV0IHBlbmRpbmdTYXZlID0gZmFsc2U7XG5sZXQgc2F2ZVRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuXG5jb25zdCBkb1NhdmUgPSAoKSA9PiB7XG4gICAgaWYgKCFpc1NlcnZpY2VXb3JrZXIgfHwgIWNocm9tZT8uc3RvcmFnZT8uc2Vzc2lvbiB8fCBpc1NhdmluZykge1xuICAgICAgICBwZW5kaW5nU2F2ZSA9IHRydWU7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpc1NhdmluZyA9IHRydWU7XG4gICAgcGVuZGluZ1NhdmUgPSBmYWxzZTtcblxuICAgIGNocm9tZS5zdG9yYWdlLnNlc3Npb24uc2V0KHsgW1NUT1JBR0VfS0VZXTogbG9ncyB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICAgICAgaWYgKHBlbmRpbmdTYXZlKSB7XG4gICAgICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgICAgICB9XG4gICAgfSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzYXZlIGxvZ3NcIiwgZXJyKTtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IHNhdmVMb2dzVG9TdG9yYWdlID0gKCkgPT4ge1xuICAgIGlmIChzYXZlVGltZXIpIGNsZWFyVGltZW91dChzYXZlVGltZXIpO1xuICAgIHNhdmVUaW1lciA9IHNldFRpbWVvdXQoZG9TYXZlLCAxMDAwKTtcbn07XG5cbmxldCByZXNvbHZlTG9nZ2VyUmVhZHk6ICgpID0+IHZvaWQ7XG5leHBvcnQgY29uc3QgbG9nZ2VyUmVhZHkgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcbiAgICByZXNvbHZlTG9nZ2VyUmVhZHkgPSByZXNvbHZlO1xufSk7XG5cbmV4cG9ydCBjb25zdCBpbml0TG9nZ2VyID0gYXN5bmMgKCkgPT4ge1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIgJiYgY2hyb21lPy5zdG9yYWdlPy5zZXNzaW9uKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uLmdldChTVE9SQUdFX0tFWSk7XG4gICAgICAgICAgICBpZiAocmVzdWx0W1NUT1JBR0VfS0VZXSAmJiBBcnJheS5pc0FycmF5KHJlc3VsdFtTVE9SQUdFX0tFWV0pKSB7XG4gICAgICAgICAgICAgICAgbG9ncyA9IHJlc3VsdFtTVE9SQUdFX0tFWV07XG4gICAgICAgICAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIGxvZ3MgPSBsb2dzLnNsaWNlKDAsIE1BWF9MT0dTKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byByZXN0b3JlIGxvZ3NcIiwgZSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHJlc29sdmVMb2dnZXJSZWFkeSkgcmVzb2x2ZUxvZ2dlclJlYWR5KCk7XG59O1xuXG5leHBvcnQgY29uc3Qgc2V0TG9nZ2VyUHJlZmVyZW5jZXMgPSAocHJlZnM6IFByZWZlcmVuY2VzKSA9PiB7XG4gIGlmIChwcmVmcy5sb2dMZXZlbCkge1xuICAgIGN1cnJlbnRMZXZlbCA9IHByZWZzLmxvZ0xldmVsO1xuICB9IGVsc2UgaWYgKHByZWZzLmRlYnVnKSB7XG4gICAgY3VycmVudExldmVsID0gXCJkZWJ1Z1wiO1xuICB9IGVsc2Uge1xuICAgIGN1cnJlbnRMZXZlbCA9IFwiaW5mb1wiO1xuICB9XG59O1xuXG5jb25zdCBzaG91bGRMb2cgPSAobGV2ZWw6IExvZ0xldmVsKTogYm9vbGVhbiA9PiB7XG4gIHJldHVybiBMRVZFTF9QUklPUklUWVtsZXZlbF0gPj0gTEVWRUxfUFJJT1JJVFlbY3VycmVudExldmVsXTtcbn07XG5cbmNvbnN0IGZvcm1hdE1lc3NhZ2UgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgcmV0dXJuIGNvbnRleHQgPyBgJHttZXNzYWdlfSA6OiAke0pTT04uc3RyaW5naWZ5KGNvbnRleHQpfWAgOiBtZXNzYWdlO1xufTtcblxuY29uc3QgYWRkTG9nID0gKGxldmVsOiBMb2dMZXZlbCwgbWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgLy8gQWx3YXlzIGFkZCB0byBidWZmZXIgcmVnYXJkbGVzcyBvZiBjdXJyZW50IGNvbnNvbGUgbGV2ZWwgc2V0dGluZyxcbiAgLy8gb3Igc2hvdWxkIHdlIHJlc3BlY3QgaXQ/IFVzdWFsbHkgZGVidWcgbG9ncyBhcmUgbm9pc3kuXG4gIC8vIExldCdzIHJlc3BlY3Qgc2hvdWxkTG9nIGZvciB0aGUgYnVmZmVyIHRvbyB0byBzYXZlIG1lbW9yeS9ub2lzZSxcbiAgLy8gT1Igd2UgY2FuIHN0b3JlIGV2ZXJ5dGhpbmcgYnV0IGZpbHRlciBvbiB2aWV3LlxuICAvLyBHaXZlbiB3ZSB3YW50IHRvIGRlYnVnIGlzc3Vlcywgc3RvcmluZyBldmVyeXRoaW5nIG1pZ2h0IGJlIGJldHRlcixcbiAgLy8gYnV0IGlmIHdlIHN0b3JlIGV2ZXJ5dGhpbmcgd2UgbWlnaHQgZmlsbCBidWZmZXIgd2l0aCBkZWJ1ZyBub2lzZSBxdWlja2x5LlxuICAvLyBMZXQncyBzdGljayB0byBzdG9yaW5nIHdoYXQgaXMgY29uZmlndXJlZCB0byBiZSBsb2dnZWQuXG4gIC8vIFdhaXQsIGlmIEkgd2FudCB0byBcImRlYnVnXCIgc29tZXRoaW5nLCBJIHVzdWFsbHkgdHVybiBvbiBkZWJ1ZyBsb2dzLlxuICAvLyBJZiBJIGNhbid0IHNlZSBwYXN0IGxvZ3MgYmVjYXVzZSB0aGV5IHdlcmVuJ3Qgc3RvcmVkLCBJIGhhdmUgdG8gcmVwcm8uXG4gIC8vIExldCdzIHN0b3JlIGlmIGl0IHBhc3NlcyBgc2hvdWxkTG9nYC5cblxuICBpZiAoc2hvdWxkTG9nKGxldmVsKSkge1xuICAgICAgY29uc3QgZW50cnk6IExvZ0VudHJ5ID0ge1xuICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgICAgICBsZXZlbCxcbiAgICAgICAgICBtZXNzYWdlLFxuICAgICAgICAgIGNvbnRleHRcbiAgICAgIH07XG5cbiAgICAgIGlmIChpc1NlcnZpY2VXb3JrZXIpIHtcbiAgICAgICAgICBsb2dzLnVuc2hpZnQoZW50cnkpO1xuICAgICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICAgIGxvZ3MucG9wKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEluIG90aGVyIGNvbnRleHRzLCBzZW5kIHRvIFNXXG4gICAgICAgICAgaWYgKGNocm9tZT8ucnVudGltZT8uc2VuZE1lc3NhZ2UpIHtcbiAgICAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2dFbnRyeScsIHBheWxvYWQ6IGVudHJ5IH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgLy8gSWdub3JlIGlmIG1lc3NhZ2UgZmFpbHMgKGUuZy4gY29udGV4dCBpbnZhbGlkYXRlZClcbiAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICB9XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBhZGRMb2dFbnRyeSA9IChlbnRyeTogTG9nRW50cnkpID0+IHtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSB7XG4gICAgICAgIGxvZ3MudW5zaGlmdChlbnRyeSk7XG4gICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICBsb2dzLnBvcCgpO1xuICAgICAgICB9XG4gICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGdldExvZ3MgPSAoKSA9PiBbLi4ubG9nc107XG5leHBvcnQgY29uc3QgY2xlYXJMb2dzID0gKCkgPT4ge1xuICAgIGxvZ3MubGVuZ3RoID0gMDtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSBzYXZlTG9nc1RvU3RvcmFnZSgpO1xufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0RlYnVnID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImRlYnVnXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiZGVidWdcIikpIHtcbiAgICBjb25zb2xlLmRlYnVnKGAke1BSRUZJWH0gW0RFQlVHXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dJbmZvID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImluZm9cIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJpbmZvXCIpKSB7XG4gICAgY29uc29sZS5pbmZvKGAke1BSRUZJWH0gW0lORk9dICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ1dhcm4gPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwid2FyblwiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcIndhcm5cIikpIHtcbiAgICBjb25zb2xlLndhcm4oYCR7UFJFRklYfSBbV0FSTl0gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nRXJyb3IgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiZXJyb3JcIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJlcnJvclwiKSkge1xuICAgIGNvbnNvbGUuZXJyb3IoYCR7UFJFRklYfSBbRVJST1JdICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0NyaXRpY2FsID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImNyaXRpY2FsXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiY3JpdGljYWxcIikpIHtcbiAgICAvLyBDcml0aWNhbCBsb2dzIHVzZSBlcnJvciBjb25zb2xlIGJ1dCB3aXRoIGRpc3RpbmN0IHByZWZpeCBhbmQgbWF5YmUgc3R5bGluZyBpZiBzdXBwb3J0ZWRcbiAgICBjb25zb2xlLmVycm9yKGAke1BSRUZJWH0gW0NSSVRJQ0FMXSBcdUQ4M0RcdURFQTggJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuIiwgIi8vIGxvZ2ljLnRzXG4vLyBQdXJlIGZ1bmN0aW9ucyBmb3IgZXh0cmFjdGlvbiBsb2dpY1xuXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplVXJsKHVybFN0cjogc3RyaW5nKTogc3RyaW5nIHtcbiAgdHJ5IHtcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHVybFN0cik7XG4gICAgY29uc3QgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh1cmwuc2VhcmNoKTtcbiAgICBjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICAgIHBhcmFtcy5mb3JFYWNoKChfLCBrZXkpID0+IGtleXMucHVzaChrZXkpKTtcbiAgICBjb25zdCBob3N0bmFtZSA9IHVybC5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgJycpO1xuXG4gICAgY29uc3QgVFJBQ0tJTkcgPSBbL151dG1fLywgL15mYmNsaWQkLywgL15nY2xpZCQvLCAvXl9nYSQvLCAvXnJlZiQvLCAvXnljbGlkJC8sIC9eX2hzL107XG4gICAgY29uc3QgaXNZb3V0dWJlID0gaG9zdG5hbWUuZW5kc1dpdGgoJ3lvdXR1YmUuY29tJykgfHwgaG9zdG5hbWUuZW5kc1dpdGgoJ3lvdXR1LmJlJyk7XG4gICAgY29uc3QgaXNHb29nbGUgPSBob3N0bmFtZS5lbmRzV2l0aCgnZ29vZ2xlLmNvbScpO1xuXG4gICAgY29uc3Qga2VlcDogc3RyaW5nW10gPSBbXTtcbiAgICBpZiAoaXNZb3V0dWJlKSBrZWVwLnB1c2goJ3YnLCAnbGlzdCcsICd0JywgJ2MnLCAnY2hhbm5lbCcsICdwbGF5bGlzdCcpO1xuICAgIGlmIChpc0dvb2dsZSkga2VlcC5wdXNoKCdxJywgJ2lkJywgJ3NvdXJjZWlkJyk7XG5cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgICBpZiAoVFJBQ0tJTkcuc29tZShyID0+IHIudGVzdChrZXkpKSkge1xuICAgICAgICAgcGFyYW1zLmRlbGV0ZShrZXkpO1xuICAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoKGlzWW91dHViZSB8fCBpc0dvb2dsZSkgJiYgIWtlZXAuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgICAgcGFyYW1zLmRlbGV0ZShrZXkpO1xuICAgICAgfVxuICAgIH1cbiAgICB1cmwuc2VhcmNoID0gcGFyYW1zLnRvU3RyaW5nKCk7XG4gICAgcmV0dXJuIHVybC50b1N0cmluZygpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIHVybFN0cjtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VZb3VUdWJlVXJsKHVybFN0cjogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgdXJsID0gbmV3IFVSTCh1cmxTdHIpO1xuICAgICAgICBjb25zdCB2ID0gdXJsLnNlYXJjaFBhcmFtcy5nZXQoJ3YnKTtcbiAgICAgICAgY29uc3QgaXNTaG9ydHMgPSB1cmwucGF0aG5hbWUuaW5jbHVkZXMoJy9zaG9ydHMvJyk7XG4gICAgICAgIGxldCB2aWRlb0lkID1cbiAgICAgICAgICB2IHx8XG4gICAgICAgICAgKGlzU2hvcnRzID8gdXJsLnBhdGhuYW1lLnNwbGl0KCcvc2hvcnRzLycpWzFdIDogbnVsbCkgfHxcbiAgICAgICAgICAodXJsLmhvc3RuYW1lID09PSAneW91dHUuYmUnID8gdXJsLnBhdGhuYW1lLnJlcGxhY2UoJy8nLCAnJykgOiBudWxsKTtcblxuICAgICAgICBjb25zdCBwbGF5bGlzdElkID0gdXJsLnNlYXJjaFBhcmFtcy5nZXQoJ2xpc3QnKTtcbiAgICAgICAgY29uc3QgcGxheWxpc3RJbmRleCA9IHBhcnNlSW50KHVybC5zZWFyY2hQYXJhbXMuZ2V0KCdpbmRleCcpIHx8ICcwJywgMTApO1xuXG4gICAgICAgIHJldHVybiB7IHZpZGVvSWQsIGlzU2hvcnRzLCBwbGF5bGlzdElkLCBwbGF5bGlzdEluZGV4IH07XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4geyB2aWRlb0lkOiBudWxsLCBpc1Nob3J0czogZmFsc2UsIHBsYXlsaXN0SWQ6IG51bGwsIHBsYXlsaXN0SW5kZXg6IG51bGwgfTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0SnNvbkxkRmllbGRzKGpzb25MZDogYW55W10pIHtcbiAgICBsZXQgYXV0aG9yOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgcHVibGlzaGVkQXQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIGxldCBtb2RpZmllZEF0OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgdGFnczogc3RyaW5nW10gPSBbXTtcbiAgICBsZXQgYnJlYWRjcnVtYnM6IHN0cmluZ1tdID0gW107XG5cbiAgICAvLyBGaW5kIG1haW4gZW50aXR5XG4gICAgLy8gQWRkZWQgc2FmZXR5IGNoZWNrOiBpICYmIGlbJ0B0eXBlJ11cbiAgICBjb25zdCBtYWluRW50aXR5ID0ganNvbkxkLmZpbmQoaSA9PiBpICYmIChpWydAdHlwZSddID09PSAnQXJ0aWNsZScgfHwgaVsnQHR5cGUnXSA9PT0gJ1ZpZGVvT2JqZWN0JyB8fCBpWydAdHlwZSddID09PSAnTmV3c0FydGljbGUnKSkgfHwganNvbkxkWzBdO1xuXG4gICAgaWYgKG1haW5FbnRpdHkpIHtcbiAgICAgICBpZiAobWFpbkVudGl0eS5hdXRob3IpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIG1haW5FbnRpdHkuYXV0aG9yID09PSAnc3RyaW5nJykgYXV0aG9yID0gbWFpbkVudGl0eS5hdXRob3I7XG4gICAgICAgICAgZWxzZSBpZiAobWFpbkVudGl0eS5hdXRob3IubmFtZSkgYXV0aG9yID0gbWFpbkVudGl0eS5hdXRob3IubmFtZTtcbiAgICAgICAgICBlbHNlIGlmIChBcnJheS5pc0FycmF5KG1haW5FbnRpdHkuYXV0aG9yKSAmJiBtYWluRW50aXR5LmF1dGhvclswXT8ubmFtZSkgYXV0aG9yID0gbWFpbkVudGl0eS5hdXRob3JbMF0ubmFtZTtcbiAgICAgICB9XG4gICAgICAgaWYgKG1haW5FbnRpdHkuZGF0ZVB1Ymxpc2hlZCkgcHVibGlzaGVkQXQgPSBtYWluRW50aXR5LmRhdGVQdWJsaXNoZWQ7XG4gICAgICAgaWYgKG1haW5FbnRpdHkuZGF0ZU1vZGlmaWVkKSBtb2RpZmllZEF0ID0gbWFpbkVudGl0eS5kYXRlTW9kaWZpZWQ7XG4gICAgICAgaWYgKG1haW5FbnRpdHkua2V5d29yZHMpIHtcbiAgICAgICAgIGlmICh0eXBlb2YgbWFpbkVudGl0eS5rZXl3b3JkcyA9PT0gJ3N0cmluZycpIHRhZ3MgPSBtYWluRW50aXR5LmtleXdvcmRzLnNwbGl0KCcsJykubWFwKChzOiBzdHJpbmcpID0+IHMudHJpbSgpKTtcbiAgICAgICAgIGVsc2UgaWYgKEFycmF5LmlzQXJyYXkobWFpbkVudGl0eS5rZXl3b3JkcykpIHRhZ3MgPSBtYWluRW50aXR5LmtleXdvcmRzO1xuICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBZGRlZCBzYWZldHkgY2hlY2s6IGkgJiYgaVsnQHR5cGUnXVxuICAgIGNvbnN0IGJyZWFkY3J1bWJMZCA9IGpzb25MZC5maW5kKGkgPT4gaSAmJiBpWydAdHlwZSddID09PSAnQnJlYWRjcnVtYkxpc3QnKTtcbiAgICBpZiAoYnJlYWRjcnVtYkxkICYmIEFycmF5LmlzQXJyYXkoYnJlYWRjcnVtYkxkLml0ZW1MaXN0RWxlbWVudCkpIHtcbiAgICAgICBjb25zdCBsaXN0ID0gYnJlYWRjcnVtYkxkLml0ZW1MaXN0RWxlbWVudC5zb3J0KChhOiBhbnksIGI6IGFueSkgPT4gYS5wb3NpdGlvbiAtIGIucG9zaXRpb24pO1xuICAgICAgIGxpc3QuZm9yRWFjaCgoaXRlbTogYW55KSA9PiB7XG4gICAgICAgICBpZiAoaXRlbS5uYW1lKSBicmVhZGNydW1icy5wdXNoKGl0ZW0ubmFtZSk7XG4gICAgICAgICBlbHNlIGlmIChpdGVtLml0ZW0gJiYgaXRlbS5pdGVtLm5hbWUpIGJyZWFkY3J1bWJzLnB1c2goaXRlbS5pdGVtLm5hbWUpO1xuICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiB7IGF1dGhvciwgcHVibGlzaGVkQXQsIG1vZGlmaWVkQXQsIHRhZ3MsIGJyZWFkY3J1bWJzIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0WW91VHViZUNoYW5uZWxGcm9tSHRtbChodG1sOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgLy8gMS4gVHJ5IEpTT04tTERcbiAgLy8gTG9vayBmb3IgPHNjcmlwdCB0eXBlPVwiYXBwbGljYXRpb24vbGQranNvblwiPi4uLjwvc2NyaXB0PlxuICAvLyBXZSBuZWVkIHRvIGxvb3AgYmVjYXVzZSB0aGVyZSBtaWdodCBiZSBtdWx0aXBsZSBzY3JpcHRzXG4gIGNvbnN0IHNjcmlwdFJlZ2V4ID0gLzxzY3JpcHRcXHMrdHlwZT1bXCInXWFwcGxpY2F0aW9uXFwvbGRcXCtqc29uW1wiJ11bXj5dKj4oW1xcc1xcU10qPyk8XFwvc2NyaXB0Pi9naTtcbiAgbGV0IG1hdGNoO1xuICB3aGlsZSAoKG1hdGNoID0gc2NyaXB0UmVnZXguZXhlYyhodG1sKSkgIT09IG51bGwpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QganNvbiA9IEpTT04ucGFyc2UobWF0Y2hbMV0pO1xuICAgICAgICAgIGNvbnN0IGFycmF5ID0gQXJyYXkuaXNBcnJheShqc29uKSA/IGpzb24gOiBbanNvbl07XG4gICAgICAgICAgY29uc3QgZmllbGRzID0gZXh0cmFjdEpzb25MZEZpZWxkcyhhcnJheSk7XG4gICAgICAgICAgaWYgKGZpZWxkcy5hdXRob3IpIHJldHVybiBmaWVsZHMuYXV0aG9yO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIC8vIGlnbm9yZSBwYXJzZSBlcnJvcnNcbiAgICAgIH1cbiAgfVxuXG4gIC8vIDIuIFRyeSA8bGluayBpdGVtcHJvcD1cIm5hbWVcIiBjb250ZW50PVwiLi4uXCI+IChZb3VUdWJlIG9mdGVuIHB1dHMgY2hhbm5lbCBuYW1lIGhlcmUgaW4gc29tZSBjb250ZXh0cylcbiAgLy8gT3IgPG1ldGEgaXRlbXByb3A9XCJjaGFubmVsSWRcIiBjb250ZW50PVwiLi4uXCI+IC0+IGJ1dCB0aGF0J3MgSUQuXG4gIC8vIDxsaW5rIGl0ZW1wcm9wPVwibmFtZVwiIGNvbnRlbnQ9XCJDaGFubmVsIE5hbWVcIj5cbiAgLy8gPHNwYW4gaXRlbXByb3A9XCJhdXRob3JcIiBpdGVtc2NvcGUgaXRlbXR5cGU9XCJodHRwOi8vc2NoZW1hLm9yZy9QZXJzb25cIj48bGluayBpdGVtcHJvcD1cIm5hbWVcIiBjb250ZW50PVwiQ2hhbm5lbCBOYW1lXCI+PC9zcGFuPlxuICBjb25zdCBsaW5rTmFtZVJlZ2V4ID0gLzxsaW5rXFxzK2l0ZW1wcm9wPVtcIiddbmFtZVtcIiddXFxzK2NvbnRlbnQ9W1wiJ10oW15cIiddKylbXCInXVxccypcXC8/Pi9pO1xuICBjb25zdCBsaW5rTWF0Y2ggPSBsaW5rTmFtZVJlZ2V4LmV4ZWMoaHRtbCk7XG4gIGlmIChsaW5rTWF0Y2ggJiYgbGlua01hdGNoWzFdKSByZXR1cm4gZGVjb2RlSHRtbEVudGl0aWVzKGxpbmtNYXRjaFsxXSk7XG5cbiAgLy8gMy4gVHJ5IG1ldGEgYXV0aG9yXG4gIGNvbnN0IG1ldGFBdXRob3JSZWdleCA9IC88bWV0YVxccytuYW1lPVtcIiddYXV0aG9yW1wiJ11cXHMrY29udGVudD1bXCInXShbXlwiJ10rKVtcIiddXFxzKlxcLz8+L2k7XG4gIGNvbnN0IG1ldGFNYXRjaCA9IG1ldGFBdXRob3JSZWdleC5leGVjKGh0bWwpO1xuICBpZiAobWV0YU1hdGNoICYmIG1ldGFNYXRjaFsxXSkge1xuICAgICAgLy8gWW91VHViZSBtZXRhIGF1dGhvciBpcyBvZnRlbiBcIkNoYW5uZWwgTmFtZVwiXG4gICAgICByZXR1cm4gZGVjb2RlSHRtbEVudGl0aWVzKG1ldGFNYXRjaFsxXSk7XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RZb3VUdWJlR2VucmVGcm9tSHRtbChodG1sOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgLy8gMS4gVHJ5IDxtZXRhIGl0ZW1wcm9wPVwiZ2VucmVcIiBjb250ZW50PVwiLi4uXCI+XG4gIGNvbnN0IG1ldGFHZW5yZVJlZ2V4ID0gLzxtZXRhXFxzK2l0ZW1wcm9wPVtcIiddZ2VucmVbXCInXVxccytjb250ZW50PVtcIiddKFteXCInXSspW1wiJ11cXHMqXFwvPz4vaTtcbiAgY29uc3QgbWV0YU1hdGNoID0gbWV0YUdlbnJlUmVnZXguZXhlYyhodG1sKTtcbiAgaWYgKG1ldGFNYXRjaCAmJiBtZXRhTWF0Y2hbMV0pIHtcbiAgICAgIHJldHVybiBkZWNvZGVIdG1sRW50aXRpZXMobWV0YU1hdGNoWzFdKTtcbiAgfVxuXG4gIC8vIDIuIFRyeSBKU09OIFwiY2F0ZWdvcnlcIiBpbiBzY3JpcHRzXG4gIC8vIFwiY2F0ZWdvcnlcIjpcIkdhbWluZ1wiXG4gIGNvbnN0IGNhdGVnb3J5UmVnZXggPSAvXCJjYXRlZ29yeVwiXFxzKjpcXHMqXCIoW15cIl0rKVwiLztcbiAgY29uc3QgY2F0TWF0Y2ggPSBjYXRlZ29yeVJlZ2V4LmV4ZWMoaHRtbCk7XG4gIGlmIChjYXRNYXRjaCAmJiBjYXRNYXRjaFsxXSkge1xuICAgICAgcmV0dXJuIGRlY29kZUh0bWxFbnRpdGllcyhjYXRNYXRjaFsxXSk7XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gZGVjb2RlSHRtbEVudGl0aWVzKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGlmICghdGV4dCkgcmV0dXJuIHRleHQ7XG5cbiAgY29uc3QgZW50aXRpZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgJyZhbXA7JzogJyYnLFxuICAgICcmbHQ7JzogJzwnLFxuICAgICcmZ3Q7JzogJz4nLFxuICAgICcmcXVvdDsnOiAnXCInLFxuICAgICcmIzM5Oyc6IFwiJ1wiLFxuICAgICcmYXBvczsnOiBcIidcIixcbiAgICAnJm5ic3A7JzogJyAnXG4gIH07XG5cbiAgcmV0dXJuIHRleHQucmVwbGFjZSgvJihbYS16MC05XSt8I1swLTldezEsNn18I3hbMC05YS1mQS1GXXsxLDZ9KTsvaWcsIChtYXRjaCkgPT4ge1xuICAgICAgY29uc3QgbG93ZXIgPSBtYXRjaC50b0xvd2VyQ2FzZSgpO1xuICAgICAgaWYgKGVudGl0aWVzW2xvd2VyXSkgcmV0dXJuIGVudGl0aWVzW2xvd2VyXTtcbiAgICAgIGlmIChlbnRpdGllc1ttYXRjaF0pIHJldHVybiBlbnRpdGllc1ttYXRjaF07XG5cbiAgICAgIGlmIChsb3dlci5zdGFydHNXaXRoKCcmI3gnKSkge1xuICAgICAgICAgIHRyeSB7IHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnNlSW50KGxvd2VyLnNsaWNlKDMsIC0xKSwgMTYpKTsgfSBjYXRjaCB7IHJldHVybiBtYXRjaDsgfVxuICAgICAgfVxuICAgICAgaWYgKGxvd2VyLnN0YXJ0c1dpdGgoJyYjJykpIHtcbiAgICAgICAgICB0cnkgeyByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJzZUludChsb3dlci5zbGljZSgyLCAtMSksIDEwKSk7IH0gY2F0Y2ggeyByZXR1cm4gbWF0Y2g7IH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBtYXRjaDtcbiAgfSk7XG59XG4iLCAiXG5leHBvcnQgY29uc3QgR0VORVJBX1JFR0lTVFJZOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAvLyBTZWFyY2hcbiAgJ2dvb2dsZS5jb20nOiAnU2VhcmNoJyxcbiAgJ2JpbmcuY29tJzogJ1NlYXJjaCcsXG4gICdkdWNrZHVja2dvLmNvbSc6ICdTZWFyY2gnLFxuICAneWFob28uY29tJzogJ1NlYXJjaCcsXG4gICdiYWlkdS5jb20nOiAnU2VhcmNoJyxcbiAgJ3lhbmRleC5jb20nOiAnU2VhcmNoJyxcbiAgJ2thZ2kuY29tJzogJ1NlYXJjaCcsXG4gICdlY29zaWEub3JnJzogJ1NlYXJjaCcsXG5cbiAgLy8gU29jaWFsXG4gICdmYWNlYm9vay5jb20nOiAnU29jaWFsJyxcbiAgJ3R3aXR0ZXIuY29tJzogJ1NvY2lhbCcsXG4gICd4LmNvbSc6ICdTb2NpYWwnLFxuICAnaW5zdGFncmFtLmNvbSc6ICdTb2NpYWwnLFxuICAnbGlua2VkaW4uY29tJzogJ1NvY2lhbCcsXG4gICdyZWRkaXQuY29tJzogJ1NvY2lhbCcsXG4gICd0aWt0b2suY29tJzogJ1NvY2lhbCcsXG4gICdwaW50ZXJlc3QuY29tJzogJ1NvY2lhbCcsXG4gICdzbmFwY2hhdC5jb20nOiAnU29jaWFsJyxcbiAgJ3R1bWJsci5jb20nOiAnU29jaWFsJyxcbiAgJ3RocmVhZHMubmV0JzogJ1NvY2lhbCcsXG4gICdibHVlc2t5LmFwcCc6ICdTb2NpYWwnLFxuICAnbWFzdG9kb24uc29jaWFsJzogJ1NvY2lhbCcsXG5cbiAgLy8gVmlkZW9cbiAgJ3lvdXR1YmUuY29tJzogJ1ZpZGVvJyxcbiAgJ3lvdXR1LmJlJzogJ1ZpZGVvJyxcbiAgJ3ZpbWVvLmNvbSc6ICdWaWRlbycsXG4gICd0d2l0Y2gudHYnOiAnVmlkZW8nLFxuICAnbmV0ZmxpeC5jb20nOiAnVmlkZW8nLFxuICAnaHVsdS5jb20nOiAnVmlkZW8nLFxuICAnZGlzbmV5cGx1cy5jb20nOiAnVmlkZW8nLFxuICAnZGFpbHltb3Rpb24uY29tJzogJ1ZpZGVvJyxcbiAgJ3ByaW1ldmlkZW8uY29tJzogJ1ZpZGVvJyxcbiAgJ2hib21heC5jb20nOiAnVmlkZW8nLFxuICAnbWF4LmNvbSc6ICdWaWRlbycsXG4gICdwZWFjb2NrdHYuY29tJzogJ1ZpZGVvJyxcblxuICAvLyBEZXZlbG9wbWVudFxuICAnZ2l0aHViLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdnaXRsYWIuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ3N0YWNrb3ZlcmZsb3cuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ25wbWpzLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdweXBpLm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICdkZXZlbG9wZXIubW96aWxsYS5vcmcnOiAnRGV2ZWxvcG1lbnQnLFxuICAndzNzY2hvb2xzLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdnZWVrc2ZvcmdlZWtzLm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICdqaXJhLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdhdGxhc3NpYW4ubmV0JzogJ0RldmVsb3BtZW50JywgLy8gb2Z0ZW4gamlyYVxuICAnYml0YnVja2V0Lm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICdkZXYudG8nOiAnRGV2ZWxvcG1lbnQnLFxuICAnaGFzaG5vZGUuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ21lZGl1bS5jb20nOiAnRGV2ZWxvcG1lbnQnLCAvLyBHZW5lcmFsIGJ1dCBvZnRlbiBkZXZcbiAgJ3ZlcmNlbC5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnbmV0bGlmeS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnaGVyb2t1LmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdhd3MuYW1hem9uLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdjb25zb2xlLmF3cy5hbWF6b24uY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2Nsb3VkLmdvb2dsZS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnYXp1cmUubWljcm9zb2Z0LmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdwb3J0YWwuYXp1cmUuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2RvY2tlci5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAna3ViZXJuZXRlcy5pbyc6ICdEZXZlbG9wbWVudCcsXG5cbiAgLy8gTmV3c1xuICAnY25uLmNvbSc6ICdOZXdzJyxcbiAgJ2JiYy5jb20nOiAnTmV3cycsXG4gICdueXRpbWVzLmNvbSc6ICdOZXdzJyxcbiAgJ3dhc2hpbmd0b25wb3N0LmNvbSc6ICdOZXdzJyxcbiAgJ3RoZWd1YXJkaWFuLmNvbSc6ICdOZXdzJyxcbiAgJ2ZvcmJlcy5jb20nOiAnTmV3cycsXG4gICdibG9vbWJlcmcuY29tJzogJ05ld3MnLFxuICAncmV1dGVycy5jb20nOiAnTmV3cycsXG4gICd3c2ouY29tJzogJ05ld3MnLFxuICAnY25iYy5jb20nOiAnTmV3cycsXG4gICdodWZmcG9zdC5jb20nOiAnTmV3cycsXG4gICduZXdzLmdvb2dsZS5jb20nOiAnTmV3cycsXG4gICdmb3huZXdzLmNvbSc6ICdOZXdzJyxcbiAgJ25iY25ld3MuY29tJzogJ05ld3MnLFxuICAnYWJjbmV3cy5nby5jb20nOiAnTmV3cycsXG4gICd1c2F0b2RheS5jb20nOiAnTmV3cycsXG5cbiAgLy8gU2hvcHBpbmdcbiAgJ2FtYXpvbi5jb20nOiAnU2hvcHBpbmcnLFxuICAnZWJheS5jb20nOiAnU2hvcHBpbmcnLFxuICAnd2FsbWFydC5jb20nOiAnU2hvcHBpbmcnLFxuICAnZXRzeS5jb20nOiAnU2hvcHBpbmcnLFxuICAndGFyZ2V0LmNvbSc6ICdTaG9wcGluZycsXG4gICdiZXN0YnV5LmNvbSc6ICdTaG9wcGluZycsXG4gICdhbGlleHByZXNzLmNvbSc6ICdTaG9wcGluZycsXG4gICdzaG9waWZ5LmNvbSc6ICdTaG9wcGluZycsXG4gICd0ZW11LmNvbSc6ICdTaG9wcGluZycsXG4gICdzaGVpbi5jb20nOiAnU2hvcHBpbmcnLFxuICAnd2F5ZmFpci5jb20nOiAnU2hvcHBpbmcnLFxuICAnY29zdGNvLmNvbSc6ICdTaG9wcGluZycsXG5cbiAgLy8gQ29tbXVuaWNhdGlvblxuICAnbWFpbC5nb29nbGUuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnb3V0bG9vay5saXZlLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3NsYWNrLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ2Rpc2NvcmQuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnem9vbS51cyc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3RlYW1zLm1pY3Jvc29mdC5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICd3aGF0c2FwcC5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICd0ZWxlZ3JhbS5vcmcnOiAnQ29tbXVuaWNhdGlvbicsXG4gICdtZXNzZW5nZXIuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnc2t5cGUuY29tJzogJ0NvbW11bmljYXRpb24nLFxuXG4gIC8vIEZpbmFuY2VcbiAgJ3BheXBhbC5jb20nOiAnRmluYW5jZScsXG4gICdjaGFzZS5jb20nOiAnRmluYW5jZScsXG4gICdiYW5rb2ZhbWVyaWNhLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3dlbGxzZmFyZ28uY29tJzogJ0ZpbmFuY2UnLFxuICAnYW1lcmljYW5leHByZXNzLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3N0cmlwZS5jb20nOiAnRmluYW5jZScsXG4gICdjb2luYmFzZS5jb20nOiAnRmluYW5jZScsXG4gICdiaW5hbmNlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2tyYWtlbi5jb20nOiAnRmluYW5jZScsXG4gICdyb2Jpbmhvb2QuY29tJzogJ0ZpbmFuY2UnLFxuICAnZmlkZWxpdHkuY29tJzogJ0ZpbmFuY2UnLFxuICAndmFuZ3VhcmQuY29tJzogJ0ZpbmFuY2UnLFxuICAnc2Nod2FiLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ21pbnQuaW50dWl0LmNvbSc6ICdGaW5hbmNlJyxcblxuICAvLyBFZHVjYXRpb25cbiAgJ3dpa2lwZWRpYS5vcmcnOiAnRWR1Y2F0aW9uJyxcbiAgJ2NvdXJzZXJhLm9yZyc6ICdFZHVjYXRpb24nLFxuICAndWRlbXkuY29tJzogJ0VkdWNhdGlvbicsXG4gICdlZHgub3JnJzogJ0VkdWNhdGlvbicsXG4gICdraGFuYWNhZGVteS5vcmcnOiAnRWR1Y2F0aW9uJyxcbiAgJ3F1aXpsZXQuY29tJzogJ0VkdWNhdGlvbicsXG4gICdkdW9saW5nby5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2NhbnZhcy5pbnN0cnVjdHVyZS5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2JsYWNrYm9hcmQuY29tJzogJ0VkdWNhdGlvbicsXG4gICdtaXQuZWR1JzogJ0VkdWNhdGlvbicsXG4gICdoYXJ2YXJkLmVkdSc6ICdFZHVjYXRpb24nLFxuICAnc3RhbmZvcmQuZWR1JzogJ0VkdWNhdGlvbicsXG4gICdhY2FkZW1pYS5lZHUnOiAnRWR1Y2F0aW9uJyxcbiAgJ3Jlc2VhcmNoZ2F0ZS5uZXQnOiAnRWR1Y2F0aW9uJyxcblxuICAvLyBEZXNpZ25cbiAgJ2ZpZ21hLmNvbSc6ICdEZXNpZ24nLFxuICAnY2FudmEuY29tJzogJ0Rlc2lnbicsXG4gICdiZWhhbmNlLm5ldCc6ICdEZXNpZ24nLFxuICAnZHJpYmJibGUuY29tJzogJ0Rlc2lnbicsXG4gICdhZG9iZS5jb20nOiAnRGVzaWduJyxcbiAgJ3Vuc3BsYXNoLmNvbSc6ICdEZXNpZ24nLFxuICAncGV4ZWxzLmNvbSc6ICdEZXNpZ24nLFxuICAncGl4YWJheS5jb20nOiAnRGVzaWduJyxcbiAgJ3NodXR0ZXJzdG9jay5jb20nOiAnRGVzaWduJyxcblxuICAvLyBQcm9kdWN0aXZpdHlcbiAgJ2RvY3MuZ29vZ2xlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnc2hlZXRzLmdvb2dsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ3NsaWRlcy5nb29nbGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdkcml2ZS5nb29nbGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdub3Rpb24uc28nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ3RyZWxsby5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2FzYW5hLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnbW9uZGF5LmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnYWlydGFibGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdldmVybm90ZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2Ryb3Bib3guY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdjbGlja3VwLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnbGluZWFyLmFwcCc6ICdQcm9kdWN0aXZpdHknLFxuICAnbWlyby5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2x1Y2lkY2hhcnQuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG5cbiAgLy8gQUlcbiAgJ29wZW5haS5jb20nOiAnQUknLFxuICAnY2hhdGdwdC5jb20nOiAnQUknLFxuICAnYW50aHJvcGljLmNvbSc6ICdBSScsXG4gICdtaWRqb3VybmV5LmNvbSc6ICdBSScsXG4gICdodWdnaW5nZmFjZS5jbyc6ICdBSScsXG4gICdiYXJkLmdvb2dsZS5jb20nOiAnQUknLFxuICAnZ2VtaW5pLmdvb2dsZS5jb20nOiAnQUknLFxuICAnY2xhdWRlLmFpJzogJ0FJJyxcbiAgJ3BlcnBsZXhpdHkuYWknOiAnQUknLFxuICAncG9lLmNvbSc6ICdBSScsXG5cbiAgLy8gTXVzaWMvQXVkaW9cbiAgJ3Nwb3RpZnkuY29tJzogJ011c2ljJyxcbiAgJ3NvdW5kY2xvdWQuY29tJzogJ011c2ljJyxcbiAgJ211c2ljLmFwcGxlLmNvbSc6ICdNdXNpYycsXG4gICdwYW5kb3JhLmNvbSc6ICdNdXNpYycsXG4gICd0aWRhbC5jb20nOiAnTXVzaWMnLFxuICAnYmFuZGNhbXAuY29tJzogJ011c2ljJyxcbiAgJ2F1ZGlibGUuY29tJzogJ011c2ljJyxcblxuICAvLyBHYW1pbmdcbiAgJ3N0ZWFtcG93ZXJlZC5jb20nOiAnR2FtaW5nJyxcbiAgJ3JvYmxveC5jb20nOiAnR2FtaW5nJyxcbiAgJ2VwaWNnYW1lcy5jb20nOiAnR2FtaW5nJyxcbiAgJ3hib3guY29tJzogJ0dhbWluZycsXG4gICdwbGF5c3RhdGlvbi5jb20nOiAnR2FtaW5nJyxcbiAgJ25pbnRlbmRvLmNvbSc6ICdHYW1pbmcnLFxuICAnaWduLmNvbSc6ICdHYW1pbmcnLFxuICAnZ2FtZXNwb3QuY29tJzogJ0dhbWluZycsXG4gICdrb3Rha3UuY29tJzogJ0dhbWluZycsXG4gICdwb2x5Z29uLmNvbSc6ICdHYW1pbmcnXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0R2VuZXJhKGhvc3RuYW1lOiBzdHJpbmcsIGN1c3RvbVJlZ2lzdHJ5PzogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IHN0cmluZyB8IG51bGwge1xuICBpZiAoIWhvc3RuYW1lKSByZXR1cm4gbnVsbDtcblxuICAvLyAwLiBDaGVjayBjdXN0b20gcmVnaXN0cnkgZmlyc3RcbiAgaWYgKGN1c3RvbVJlZ2lzdHJ5KSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IGhvc3RuYW1lLnNwbGl0KCcuJyk7XG4gICAgICAvLyBDaGVjayBmdWxsIGhvc3RuYW1lIGFuZCBwcm9ncmVzc2l2ZWx5IHNob3J0ZXIgc3VmZml4ZXNcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGFydHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgICAgY29uc3QgZG9tYWluID0gcGFydHMuc2xpY2UoaSkuam9pbignLicpO1xuICAgICAgICAgIGlmIChjdXN0b21SZWdpc3RyeVtkb21haW5dKSB7XG4gICAgICAgICAgICAgIHJldHVybiBjdXN0b21SZWdpc3RyeVtkb21haW5dO1xuICAgICAgICAgIH1cbiAgICAgIH1cbiAgfVxuXG4gIC8vIDEuIEV4YWN0IG1hdGNoXG4gIGlmIChHRU5FUkFfUkVHSVNUUllbaG9zdG5hbWVdKSB7XG4gICAgcmV0dXJuIEdFTkVSQV9SRUdJU1RSWVtob3N0bmFtZV07XG4gIH1cblxuICAvLyAyLiBTdWJkb21haW4gY2hlY2sgKHN0cmlwcGluZyBzdWJkb21haW5zKVxuICAvLyBlLmcuIFwiY29uc29sZS5hd3MuYW1hem9uLmNvbVwiIC0+IFwiYXdzLmFtYXpvbi5jb21cIiAtPiBcImFtYXpvbi5jb21cIlxuICBjb25zdCBwYXJ0cyA9IGhvc3RuYW1lLnNwbGl0KCcuJyk7XG5cbiAgLy8gVHJ5IG1hdGNoaW5nIHByb2dyZXNzaXZlbHkgc2hvcnRlciBzdWZmaXhlc1xuICAvLyBlLmcuIGEuYi5jLmNvbSAtPiBiLmMuY29tIC0+IGMuY29tXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcGFydHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICBjb25zdCBkb21haW4gPSBwYXJ0cy5zbGljZShpKS5qb2luKCcuJyk7XG4gICAgICBpZiAoR0VORVJBX1JFR0lTVFJZW2RvbWFpbl0pIHtcbiAgICAgICAgICByZXR1cm4gR0VORVJBX1JFR0lTVFJZW2RvbWFpbl07XG4gICAgICB9XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cbiIsICJleHBvcnQgY29uc3QgZ2V0U3RvcmVkVmFsdWUgPSBhc3luYyA8VD4oa2V5OiBzdHJpbmcpOiBQcm9taXNlPFQgfCBudWxsPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChrZXksIChpdGVtcykgPT4ge1xuICAgICAgcmVzb2x2ZSgoaXRlbXNba2V5XSBhcyBUKSA/PyBudWxsKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG5leHBvcnQgY29uc3Qgc2V0U3RvcmVkVmFsdWUgPSBhc3luYyA8VD4oa2V5OiBzdHJpbmcsIHZhbHVlOiBUKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IFtrZXldOiB2YWx1ZSB9LCAoKSA9PiByZXNvbHZlKCkpO1xuICB9KTtcbn07XG4iLCAiaW1wb3J0IHsgUHJlZmVyZW5jZXMsIFNvcnRpbmdTdHJhdGVneSwgVGFiTWV0YWRhdGEgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5leHBvcnQgY29uc3QgbWFwQ2hyb21lVGFiID0gKHRhYjogY2hyb21lLnRhYnMuVGFiKTogVGFiTWV0YWRhdGEgfCBudWxsID0+IHtcbiAgaWYgKCF0YWIuaWQgfHwgdGFiLmlkID09PSBjaHJvbWUudGFicy5UQUJfSURfTk9ORSB8fCAhdGFiLndpbmRvd0lkKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBpZDogdGFiLmlkLFxuICAgIHdpbmRvd0lkOiB0YWIud2luZG93SWQsXG4gICAgdGl0bGU6IHRhYi50aXRsZSB8fCBcIlVudGl0bGVkXCIsXG4gICAgdXJsOiB0YWIudXJsIHx8IFwiYWJvdXQ6YmxhbmtcIixcbiAgICBwaW5uZWQ6IEJvb2xlYW4odGFiLnBpbm5lZCksXG4gICAgbGFzdEFjY2Vzc2VkOiB0YWIubGFzdEFjY2Vzc2VkLFxuICAgIG9wZW5lclRhYklkOiB0YWIub3BlbmVyVGFiSWQgPz8gdW5kZWZpbmVkLFxuICAgIGZhdkljb25Vcmw6IHRhYi5mYXZJY29uVXJsLFxuICAgIGdyb3VwSWQ6IHRhYi5ncm91cElkLFxuICAgIGluZGV4OiB0YWIuaW5kZXgsXG4gICAgYWN0aXZlOiB0YWIuYWN0aXZlLFxuICAgIHN0YXR1czogdGFiLnN0YXR1cyxcbiAgICBzZWxlY3RlZDogdGFiLmhpZ2hsaWdodGVkXG4gIH07XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0U3RvcmVkUHJlZmVyZW5jZXMgPSBhc3luYyAoKTogUHJvbWlzZTxQcmVmZXJlbmNlcyB8IG51bGw+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFwicHJlZmVyZW5jZXNcIiwgKGl0ZW1zKSA9PiB7XG4gICAgICByZXNvbHZlKChpdGVtc1tcInByZWZlcmVuY2VzXCJdIGFzIFByZWZlcmVuY2VzKSA/PyBudWxsKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG5leHBvcnQgY29uc3QgYXNBcnJheSA9IDxUPih2YWx1ZTogdW5rbm93bik6IFRbXSA9PiB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSByZXR1cm4gdmFsdWUgYXMgVFtdO1xuICAgIHJldHVybiBbXTtcbn07XG4iLCAiaW1wb3J0IHsgQ3VzdG9tU3RyYXRlZ3ksIFByZWZlcmVuY2VzLCBTb3J0aW5nU3RyYXRlZ3kgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBnZXRTdG9yZWRWYWx1ZSwgc2V0U3RvcmVkVmFsdWUgfSBmcm9tIFwiLi9zdG9yYWdlLmpzXCI7XG5pbXBvcnQgeyBzZXRMb2dnZXJQcmVmZXJlbmNlcywgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxuY29uc3QgUFJFRkVSRU5DRVNfS0VZID0gXCJwcmVmZXJlbmNlc1wiO1xuXG5leHBvcnQgY29uc3QgZGVmYXVsdFByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyA9IHtcbiAgc29ydGluZzogW1wicGlubmVkXCIsIFwicmVjZW5jeVwiXSxcbiAgZGVidWc6IGZhbHNlLFxuICBsb2dMZXZlbDogXCJpbmZvXCIsXG4gIHRoZW1lOiBcImRhcmtcIixcbiAgY3VzdG9tR2VuZXJhOiB7fVxufTtcblxuY29uc3Qgbm9ybWFsaXplU29ydGluZyA9IChzb3J0aW5nOiB1bmtub3duKTogU29ydGluZ1N0cmF0ZWd5W10gPT4ge1xuICBpZiAoQXJyYXkuaXNBcnJheShzb3J0aW5nKSkge1xuICAgIHJldHVybiBzb3J0aW5nLmZpbHRlcigodmFsdWUpOiB2YWx1ZSBpcyBTb3J0aW5nU3RyYXRlZ3kgPT4gdHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiKTtcbiAgfVxuICBpZiAodHlwZW9mIHNvcnRpbmcgPT09IFwic3RyaW5nXCIpIHtcbiAgICByZXR1cm4gW3NvcnRpbmddO1xuICB9XG4gIHJldHVybiBbLi4uZGVmYXVsdFByZWZlcmVuY2VzLnNvcnRpbmddO1xufTtcblxuY29uc3Qgbm9ybWFsaXplU3RyYXRlZ2llcyA9IChzdHJhdGVnaWVzOiB1bmtub3duKTogQ3VzdG9tU3RyYXRlZ3lbXSA9PiB7XG4gICAgY29uc3QgYXJyID0gYXNBcnJheTxhbnk+KHN0cmF0ZWdpZXMpLmZpbHRlcihzID0+IHR5cGVvZiBzID09PSAnb2JqZWN0JyAmJiBzICE9PSBudWxsKTtcbiAgICByZXR1cm4gYXJyLm1hcChzID0+ICh7XG4gICAgICAgIC4uLnMsXG4gICAgICAgIGdyb3VwaW5nUnVsZXM6IGFzQXJyYXkocy5ncm91cGluZ1J1bGVzKSxcbiAgICAgICAgc29ydGluZ1J1bGVzOiBhc0FycmF5KHMuc29ydGluZ1J1bGVzKSxcbiAgICAgICAgZ3JvdXBTb3J0aW5nUnVsZXM6IHMuZ3JvdXBTb3J0aW5nUnVsZXMgPyBhc0FycmF5KHMuZ3JvdXBTb3J0aW5nUnVsZXMpIDogdW5kZWZpbmVkLFxuICAgICAgICBmaWx0ZXJzOiBzLmZpbHRlcnMgPyBhc0FycmF5KHMuZmlsdGVycykgOiB1bmRlZmluZWQsXG4gICAgICAgIGZpbHRlckdyb3Vwczogcy5maWx0ZXJHcm91cHMgPyBhc0FycmF5KHMuZmlsdGVyR3JvdXBzKS5tYXAoKGc6IGFueSkgPT4gYXNBcnJheShnKSkgOiB1bmRlZmluZWQsXG4gICAgICAgIHJ1bGVzOiBzLnJ1bGVzID8gYXNBcnJheShzLnJ1bGVzKSA6IHVuZGVmaW5lZFxuICAgIH0pKTtcbn07XG5cbmNvbnN0IG5vcm1hbGl6ZVByZWZlcmVuY2VzID0gKHByZWZzPzogUGFydGlhbDxQcmVmZXJlbmNlcz4gfCBudWxsKTogUHJlZmVyZW5jZXMgPT4ge1xuICBjb25zdCBtZXJnZWQgPSB7IC4uLmRlZmF1bHRQcmVmZXJlbmNlcywgLi4uKHByZWZzID8/IHt9KSB9O1xuICByZXR1cm4ge1xuICAgIC4uLm1lcmdlZCxcbiAgICBzb3J0aW5nOiBub3JtYWxpemVTb3J0aW5nKG1lcmdlZC5zb3J0aW5nKSxcbiAgICBjdXN0b21TdHJhdGVnaWVzOiBub3JtYWxpemVTdHJhdGVnaWVzKG1lcmdlZC5jdXN0b21TdHJhdGVnaWVzKVxuICB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGxvYWRQcmVmZXJlbmNlcyA9IGFzeW5jICgpOiBQcm9taXNlPFByZWZlcmVuY2VzPiA9PiB7XG4gIGNvbnN0IHN0b3JlZCA9IGF3YWl0IGdldFN0b3JlZFZhbHVlPFByZWZlcmVuY2VzPihQUkVGRVJFTkNFU19LRVkpO1xuICBjb25zdCBtZXJnZWQgPSBub3JtYWxpemVQcmVmZXJlbmNlcyhzdG9yZWQgPz8gdW5kZWZpbmVkKTtcbiAgc2V0TG9nZ2VyUHJlZmVyZW5jZXMobWVyZ2VkKTtcbiAgcmV0dXJuIG1lcmdlZDtcbn07XG5cbmV4cG9ydCBjb25zdCBzYXZlUHJlZmVyZW5jZXMgPSBhc3luYyAocHJlZnM6IFBhcnRpYWw8UHJlZmVyZW5jZXM+KTogUHJvbWlzZTxQcmVmZXJlbmNlcz4gPT4ge1xuICBsb2dEZWJ1ZyhcIlVwZGF0aW5nIHByZWZlcmVuY2VzXCIsIHsga2V5czogT2JqZWN0LmtleXMocHJlZnMpIH0pO1xuICBjb25zdCBjdXJyZW50ID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gIGNvbnN0IG1lcmdlZCA9IG5vcm1hbGl6ZVByZWZlcmVuY2VzKHsgLi4uY3VycmVudCwgLi4ucHJlZnMgfSk7XG4gIGF3YWl0IHNldFN0b3JlZFZhbHVlKFBSRUZFUkVOQ0VTX0tFWSwgbWVyZ2VkKTtcbiAgc2V0TG9nZ2VyUHJlZmVyZW5jZXMobWVyZ2VkKTtcbiAgcmV0dXJuIG1lcmdlZDtcbn07XG4iLCAiaW1wb3J0IHsgUGFnZUNvbnRleHQsIFRhYk1ldGFkYXRhIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgbm9ybWFsaXplVXJsLCBwYXJzZVlvdVR1YmVVcmwsIGV4dHJhY3RZb3VUdWJlQ2hhbm5lbEZyb21IdG1sLCBleHRyYWN0WW91VHViZUdlbnJlRnJvbUh0bWwgfSBmcm9tIFwiLi9sb2dpYy5qc1wiO1xuaW1wb3J0IHsgZ2V0R2VuZXJhIH0gZnJvbSBcIi4vZ2VuZXJhUmVnaXN0cnkuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGxvYWRQcmVmZXJlbmNlcyB9IGZyb20gXCIuLi9wcmVmZXJlbmNlcy5qc1wiO1xuXG5pbnRlcmZhY2UgRXh0cmFjdGlvblJlc3BvbnNlIHtcbiAgZGF0YTogUGFnZUNvbnRleHQgfCBudWxsO1xuICBlcnJvcj86IHN0cmluZztcbiAgc3RhdHVzOlxuICAgIHwgJ09LJ1xuICAgIHwgJ1JFU1RSSUNURUQnXG4gICAgfCAnSU5KRUNUSU9OX0ZBSUxFRCdcbiAgICB8ICdOT19SRVNQT05TRSdcbiAgICB8ICdOT19IT1NUX1BFUk1JU1NJT04nXG4gICAgfCAnRlJBTUVfQUNDRVNTX0RFTklFRCc7XG59XG5cbi8vIFNpbXBsZSBjb25jdXJyZW5jeSBjb250cm9sXG5sZXQgYWN0aXZlRmV0Y2hlcyA9IDA7XG5jb25zdCBNQVhfQ09OQ1VSUkVOVF9GRVRDSEVTID0gNTsgLy8gQ29uc2VydmF0aXZlIGxpbWl0IHRvIGF2b2lkIHJhdGUgbGltaXRpbmdcbmNvbnN0IEZFVENIX1FVRVVFOiAoKCkgPT4gdm9pZClbXSA9IFtdO1xuXG5jb25zdCBmZXRjaFdpdGhUaW1lb3V0ID0gYXN5bmMgKHVybDogc3RyaW5nLCB0aW1lb3V0ID0gMjAwMCk6IFByb21pc2U8UmVzcG9uc2U+ID0+IHtcbiAgICBjb25zdCBjb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuICAgIGNvbnN0IGlkID0gc2V0VGltZW91dCgoKSA9PiBjb250cm9sbGVyLmFib3J0KCksIHRpbWVvdXQpO1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCB7IHNpZ25hbDogY29udHJvbGxlci5zaWduYWwgfSk7XG4gICAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgICBjbGVhclRpbWVvdXQoaWQpO1xuICAgIH1cbn07XG5cbmNvbnN0IGVucXVldWVGZXRjaCA9IGFzeW5jIDxUPihmbjogKCkgPT4gUHJvbWlzZTxUPik6IFByb21pc2U8VD4gPT4ge1xuICAgIGlmIChhY3RpdmVGZXRjaGVzID49IE1BWF9DT05DVVJSRU5UX0ZFVENIRVMpIHtcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBGRVRDSF9RVUVVRS5wdXNoKHJlc29sdmUpKTtcbiAgICB9XG4gICAgYWN0aXZlRmV0Y2hlcysrO1xuICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBhd2FpdCBmbigpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICAgIGFjdGl2ZUZldGNoZXMtLTtcbiAgICAgICAgaWYgKEZFVENIX1FVRVVFLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnN0IG5leHQgPSBGRVRDSF9RVUVVRS5zaGlmdCgpO1xuICAgICAgICAgICAgaWYgKG5leHQpIG5leHQoKTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmV4cG9ydCBjb25zdCBleHRyYWN0UGFnZUNvbnRleHQgPSBhc3luYyAodGFiOiBUYWJNZXRhZGF0YSB8IGNocm9tZS50YWJzLlRhYik6IFByb21pc2U8RXh0cmFjdGlvblJlc3BvbnNlPiA9PiB7XG4gIHRyeSB7XG4gICAgaWYgKCF0YWIgfHwgIXRhYi51cmwpIHtcbiAgICAgICAgcmV0dXJuIHsgZGF0YTogbnVsbCwgZXJyb3I6IFwiVGFiIG5vdCBmb3VuZCBvciBubyBVUkxcIiwgc3RhdHVzOiAnTk9fUkVTUE9OU0UnIH07XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdjaHJvbWU6Ly8nKSB8fFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdlZGdlOi8vJykgfHxcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnYWJvdXQ6JykgfHxcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnY2hyb21lLWV4dGVuc2lvbjovLycpIHx8XG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2Nocm9tZS1lcnJvcjovLycpXG4gICAgKSB7XG4gICAgICAgIHJldHVybiB7IGRhdGE6IG51bGwsIGVycm9yOiBcIlJlc3RyaWN0ZWQgVVJMIHNjaGVtZVwiLCBzdGF0dXM6ICdSRVNUUklDVEVEJyB9O1xuICAgIH1cblxuICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgbGV0IGJhc2VsaW5lID0gYnVpbGRCYXNlbGluZUNvbnRleHQodGFiIGFzIGNocm9tZS50YWJzLlRhYiwgcHJlZnMuY3VzdG9tR2VuZXJhKTtcblxuICAgIC8vIEZldGNoIGFuZCBlbnJpY2ggZm9yIFlvdVR1YmUgaWYgYXV0aG9yIGlzIG1pc3NpbmcgYW5kIGl0IGlzIGEgdmlkZW9cbiAgICBjb25zdCB0YXJnZXRVcmwgPSB0YWIudXJsO1xuICAgIGNvbnN0IHVybE9iaiA9IG5ldyBVUkwodGFyZ2V0VXJsKTtcbiAgICBjb25zdCBob3N0bmFtZSA9IHVybE9iai5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgJycpO1xuICAgIGlmICgoaG9zdG5hbWUuZW5kc1dpdGgoJ3lvdXR1YmUuY29tJykgfHwgaG9zdG5hbWUuZW5kc1dpdGgoJ3lvdXR1LmJlJykpICYmICghYmFzZWxpbmUuYXV0aG9yT3JDcmVhdG9yIHx8IGJhc2VsaW5lLmdlbnJlID09PSAnVmlkZW8nKSkge1xuICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAvLyBXZSB1c2UgYSBxdWV1ZSB0byBwcmV2ZW50IGZsb29kaW5nIHJlcXVlc3RzXG4gICAgICAgICAgICAgYXdhaXQgZW5xdWV1ZUZldGNoKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaFdpdGhUaW1lb3V0KHRhcmdldFVybCk7XG4gICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZS5vaykge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgaHRtbCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNoYW5uZWwgPSBleHRyYWN0WW91VHViZUNoYW5uZWxGcm9tSHRtbChodG1sKTtcbiAgICAgICAgICAgICAgICAgICAgIGlmIChjaGFubmVsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgYmFzZWxpbmUuYXV0aG9yT3JDcmVhdG9yID0gY2hhbm5lbDtcbiAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGdlbnJlID0gZXh0cmFjdFlvdVR1YmVHZW5yZUZyb21IdG1sKGh0bWwpO1xuICAgICAgICAgICAgICAgICAgICAgaWYgKGdlbnJlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgYmFzZWxpbmUuZ2VucmUgPSBnZW5yZTtcbiAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgIH0pO1xuICAgICAgICAgfSBjYXRjaCAoZmV0Y2hFcnIpIHtcbiAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkZhaWxlZCB0byBmZXRjaCBZb3VUdWJlIHBhZ2UgY29udGVudFwiLCB7IGVycm9yOiBTdHJpbmcoZmV0Y2hFcnIpIH0pO1xuICAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBkYXRhOiBiYXNlbGluZSxcbiAgICAgIHN0YXR1czogJ09LJ1xuICAgIH07XG5cbiAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgbG9nRGVidWcoYEV4dHJhY3Rpb24gZmFpbGVkIGZvciB0YWIgJHt0YWIuaWR9YCwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgIHJldHVybiB7XG4gICAgICBkYXRhOiBudWxsLFxuICAgICAgZXJyb3I6IFN0cmluZyhlKSxcbiAgICAgIHN0YXR1czogJ0lOSkVDVElPTl9GQUlMRUQnXG4gICAgfTtcbiAgfVxufTtcblxuY29uc3QgYnVpbGRCYXNlbGluZUNvbnRleHQgPSAodGFiOiBjaHJvbWUudGFicy5UYWIsIGN1c3RvbUdlbmVyYT86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBQYWdlQ29udGV4dCA9PiB7XG4gIGNvbnN0IHVybCA9IHRhYi51cmwgfHwgXCJcIjtcbiAgbGV0IGhvc3RuYW1lID0gXCJcIjtcbiAgdHJ5IHtcbiAgICBob3N0bmFtZSA9IG5ldyBVUkwodXJsKS5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgJycpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgaG9zdG5hbWUgPSBcIlwiO1xuICB9XG5cbiAgLy8gRGV0ZXJtaW5lIE9iamVjdCBUeXBlIGZpcnN0XG4gIGxldCBvYmplY3RUeXBlOiBQYWdlQ29udGV4dFsnb2JqZWN0VHlwZSddID0gJ3Vua25vd24nO1xuICBsZXQgYXV0aG9yT3JDcmVhdG9yOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuICBpZiAodXJsLmluY2x1ZGVzKCcvbG9naW4nKSB8fCB1cmwuaW5jbHVkZXMoJy9zaWduaW4nKSkge1xuICAgICAgb2JqZWN0VHlwZSA9ICdsb2dpbic7XG4gIH0gZWxzZSBpZiAoaG9zdG5hbWUuaW5jbHVkZXMoJ3lvdXR1YmUuY29tJykgfHwgaG9zdG5hbWUuaW5jbHVkZXMoJ3lvdXR1LmJlJykpIHtcbiAgICAgIGNvbnN0IHsgdmlkZW9JZCB9ID0gcGFyc2VZb3VUdWJlVXJsKHVybCk7XG4gICAgICBpZiAodmlkZW9JZCkgb2JqZWN0VHlwZSA9ICd2aWRlbyc7XG5cbiAgICAgIC8vIFRyeSB0byBndWVzcyBjaGFubmVsIGZyb20gVVJMIGlmIHBvc3NpYmxlXG4gICAgICBpZiAodXJsLmluY2x1ZGVzKCcvQCcpKSB7XG4gICAgICAgICAgY29uc3QgcGFydHMgPSB1cmwuc3BsaXQoJy9AJyk7XG4gICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgY29uc3QgaGFuZGxlID0gcGFydHNbMV0uc3BsaXQoJy8nKVswXTtcbiAgICAgICAgICAgICAgYXV0aG9yT3JDcmVhdG9yID0gJ0AnICsgaGFuZGxlO1xuICAgICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodXJsLmluY2x1ZGVzKCcvYy8nKSkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzID0gdXJsLnNwbGl0KCcvYy8nKTtcbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICBhdXRob3JPckNyZWF0b3IgPSBkZWNvZGVVUklDb21wb25lbnQocGFydHNbMV0uc3BsaXQoJy8nKVswXSk7XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh1cmwuaW5jbHVkZXMoJy91c2VyLycpKSB7XG4gICAgICAgICAgY29uc3QgcGFydHMgPSB1cmwuc3BsaXQoJy91c2VyLycpO1xuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIGF1dGhvck9yQ3JlYXRvciA9IGRlY29kZVVSSUNvbXBvbmVudChwYXJ0c1sxXS5zcGxpdCgnLycpWzBdKTtcbiAgICAgICAgICB9XG4gICAgICB9XG4gIH0gZWxzZSBpZiAoaG9zdG5hbWUgPT09ICdnaXRodWIuY29tJyAmJiB1cmwuaW5jbHVkZXMoJy9wdWxsLycpKSB7XG4gICAgICBvYmplY3RUeXBlID0gJ3RpY2tldCc7XG4gIH0gZWxzZSBpZiAoaG9zdG5hbWUgPT09ICdnaXRodWIuY29tJyAmJiAhdXJsLmluY2x1ZGVzKCcvcHVsbC8nKSAmJiB1cmwuc3BsaXQoJy8nKS5sZW5ndGggPj0gNSkge1xuICAgICAgLy8gcm91Z2ggY2hlY2sgZm9yIHJlcG9cbiAgICAgIG9iamVjdFR5cGUgPSAncmVwbyc7XG4gIH1cblxuICAvLyBEZXRlcm1pbmUgR2VucmVcbiAgLy8gUHJpb3JpdHkgMTogU2l0ZS1zcGVjaWZpYyBleHRyYWN0aW9uIChkZXJpdmVkIGZyb20gb2JqZWN0VHlwZSlcbiAgbGV0IGdlbnJlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgaWYgKG9iamVjdFR5cGUgPT09ICd2aWRlbycpIGdlbnJlID0gJ1ZpZGVvJztcbiAgZWxzZSBpZiAob2JqZWN0VHlwZSA9PT0gJ3JlcG8nIHx8IG9iamVjdFR5cGUgPT09ICd0aWNrZXQnKSBnZW5yZSA9ICdEZXZlbG9wbWVudCc7XG5cbiAgLy8gUHJpb3JpdHkgMjogRmFsbGJhY2sgdG8gUmVnaXN0cnlcbiAgaWYgKCFnZW5yZSkge1xuICAgICBnZW5yZSA9IGdldEdlbmVyYShob3N0bmFtZSwgY3VzdG9tR2VuZXJhKSB8fCB1bmRlZmluZWQ7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNhbm9uaWNhbFVybDogdXJsIHx8IG51bGwsXG4gICAgbm9ybWFsaXplZFVybDogbm9ybWFsaXplVXJsKHVybCksXG4gICAgc2l0ZU5hbWU6IGhvc3RuYW1lIHx8IG51bGwsXG4gICAgcGxhdGZvcm06IGhvc3RuYW1lIHx8IG51bGwsXG4gICAgb2JqZWN0VHlwZSxcbiAgICBvYmplY3RJZDogdXJsIHx8IG51bGwsXG4gICAgdGl0bGU6IHRhYi50aXRsZSB8fCBudWxsLFxuICAgIGdlbnJlLFxuICAgIGRlc2NyaXB0aW9uOiBudWxsLFxuICAgIGF1dGhvck9yQ3JlYXRvcjogYXV0aG9yT3JDcmVhdG9yLFxuICAgIHB1Ymxpc2hlZEF0OiBudWxsLFxuICAgIG1vZGlmaWVkQXQ6IG51bGwsXG4gICAgbGFuZ3VhZ2U6IG51bGwsXG4gICAgdGFnczogW10sXG4gICAgYnJlYWRjcnVtYnM6IFtdLFxuICAgIGlzQXVkaWJsZTogZmFsc2UsXG4gICAgaXNNdXRlZDogZmFsc2UsXG4gICAgaXNDYXB0dXJpbmc6IGZhbHNlLFxuICAgIHByb2dyZXNzOiBudWxsLFxuICAgIGhhc1Vuc2F2ZWRDaGFuZ2VzTGlrZWx5OiBmYWxzZSxcbiAgICBpc0F1dGhlbnRpY2F0ZWRMaWtlbHk6IGZhbHNlLFxuICAgIHNvdXJjZXM6IHtcbiAgICAgIGNhbm9uaWNhbFVybDogJ3VybCcsXG4gICAgICBub3JtYWxpemVkVXJsOiAndXJsJyxcbiAgICAgIHNpdGVOYW1lOiAndXJsJyxcbiAgICAgIHBsYXRmb3JtOiAndXJsJyxcbiAgICAgIG9iamVjdFR5cGU6ICd1cmwnLFxuICAgICAgdGl0bGU6IHRhYi50aXRsZSA/ICd0YWInIDogJ3VybCcsXG4gICAgICBnZW5yZTogJ3JlZ2lzdHJ5J1xuICAgIH0sXG4gICAgY29uZmlkZW5jZToge31cbiAgfTtcbn07XG4iLCAiaW1wb3J0IHsgVGFiTWV0YWRhdGEsIFBhZ2VDb250ZXh0IH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcsIGxvZ0Vycm9yIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGV4dHJhY3RQYWdlQ29udGV4dCB9IGZyb20gXCIuL2V4dHJhY3Rpb24vaW5kZXguanNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBDb250ZXh0UmVzdWx0IHtcbiAgY29udGV4dDogc3RyaW5nO1xuICBzb3VyY2U6ICdBSScgfCAnSGV1cmlzdGljJyB8ICdFeHRyYWN0aW9uJztcbiAgZGF0YT86IFBhZ2VDb250ZXh0O1xuICBlcnJvcj86IHN0cmluZztcbiAgc3RhdHVzPzogc3RyaW5nO1xufVxuXG5jb25zdCBjb250ZXh0Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgQ29udGV4dFJlc3VsdD4oKTtcblxuZXhwb3J0IGNvbnN0IGFuYWx5emVUYWJDb250ZXh0ID0gYXN5bmMgKFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBvblByb2dyZXNzPzogKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB2b2lkXG4pOiBQcm9taXNlPE1hcDxudW1iZXIsIENvbnRleHRSZXN1bHQ+PiA9PiB7XG4gIGNvbnN0IGNvbnRleHRNYXAgPSBuZXcgTWFwPG51bWJlciwgQ29udGV4dFJlc3VsdD4oKTtcbiAgbGV0IGNvbXBsZXRlZCA9IDA7XG4gIGNvbnN0IHRvdGFsID0gdGFicy5sZW5ndGg7XG5cbiAgY29uc3QgcHJvbWlzZXMgPSB0YWJzLm1hcChhc3luYyAodGFiKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNhY2hlS2V5ID0gYCR7dGFiLmlkfTo6JHt0YWIudXJsfWA7XG4gICAgICBpZiAoY29udGV4dENhY2hlLmhhcyhjYWNoZUtleSkpIHtcbiAgICAgICAgY29udGV4dE1hcC5zZXQodGFiLmlkLCBjb250ZXh0Q2FjaGUuZ2V0KGNhY2hlS2V5KSEpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoQ29udGV4dEZvclRhYih0YWIpO1xuXG4gICAgICAvLyBPbmx5IGNhY2hlIHZhbGlkIHJlc3VsdHMgdG8gYWxsb3cgcmV0cnlpbmcgb24gdHJhbnNpZW50IGVycm9ycz9cbiAgICAgIC8vIEFjdHVhbGx5LCBpZiB3ZSBjYWNoZSBlcnJvciwgd2Ugc3RvcCByZXRyeWluZy5cbiAgICAgIC8vIExldCdzIGNhY2hlIGV2ZXJ5dGhpbmcgZm9yIG5vdyB0byBwcmV2ZW50IHNwYW1taW5nIGlmIGl0IGtlZXBzIGZhaWxpbmcuXG4gICAgICBjb250ZXh0Q2FjaGUuc2V0KGNhY2hlS2V5LCByZXN1bHQpO1xuXG4gICAgICBjb250ZXh0TWFwLnNldCh0YWIuaWQsIHJlc3VsdCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ0Vycm9yKGBGYWlsZWQgdG8gYW5hbHl6ZSBjb250ZXh0IGZvciB0YWIgJHt0YWIuaWR9YCwgeyBlcnJvcjogU3RyaW5nKGVycm9yKSB9KTtcbiAgICAgIC8vIEV2ZW4gaWYgZmV0Y2hDb250ZXh0Rm9yVGFiIGZhaWxzIGNvbXBsZXRlbHksIHdlIHRyeSBhIHNhZmUgc3luYyBmYWxsYmFja1xuICAgICAgY29udGV4dE1hcC5zZXQodGFiLmlkLCB7IGNvbnRleHQ6IFwiVW5jYXRlZ29yaXplZFwiLCBzb3VyY2U6ICdIZXVyaXN0aWMnLCBlcnJvcjogU3RyaW5nKGVycm9yKSwgc3RhdHVzOiAnRVJST1InIH0pO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBjb21wbGV0ZWQrKztcbiAgICAgIGlmIChvblByb2dyZXNzKSBvblByb2dyZXNzKGNvbXBsZXRlZCwgdG90YWwpO1xuICAgIH1cbiAgfSk7XG5cbiAgYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICByZXR1cm4gY29udGV4dE1hcDtcbn07XG5cbmNvbnN0IGZldGNoQ29udGV4dEZvclRhYiA9IGFzeW5jICh0YWI6IFRhYk1ldGFkYXRhKTogUHJvbWlzZTxDb250ZXh0UmVzdWx0PiA9PiB7XG4gIC8vIDEuIFJ1biBHZW5lcmljIEV4dHJhY3Rpb24gKEFsd2F5cylcbiAgbGV0IGRhdGE6IFBhZ2VDb250ZXh0IHwgbnVsbCA9IG51bGw7XG4gIGxldCBlcnJvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICBsZXQgc3RhdHVzOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgdHJ5IHtcbiAgICAgIGNvbnN0IGV4dHJhY3Rpb24gPSBhd2FpdCBleHRyYWN0UGFnZUNvbnRleHQodGFiKTtcbiAgICAgIGRhdGEgPSBleHRyYWN0aW9uLmRhdGE7XG4gICAgICBlcnJvciA9IGV4dHJhY3Rpb24uZXJyb3I7XG4gICAgICBzdGF0dXMgPSBleHRyYWN0aW9uLnN0YXR1cztcbiAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nRGVidWcoYEV4dHJhY3Rpb24gZmFpbGVkIGZvciB0YWIgJHt0YWIuaWR9YCwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgZXJyb3IgPSBTdHJpbmcoZSk7XG4gICAgICBzdGF0dXMgPSAnRVJST1InO1xuICB9XG5cbiAgbGV0IGNvbnRleHQgPSBcIlVuY2F0ZWdvcml6ZWRcIjtcbiAgbGV0IHNvdXJjZTogQ29udGV4dFJlc3VsdFsnc291cmNlJ10gPSAnSGV1cmlzdGljJztcblxuICAvLyAyLiBUcnkgdG8gRGV0ZXJtaW5lIENhdGVnb3J5IGZyb20gRXh0cmFjdGlvbiBEYXRhXG4gIGlmIChkYXRhKSB7XG4gICAgICBpZiAoZGF0YS5wbGF0Zm9ybSA9PT0gJ1lvdVR1YmUnIHx8IGRhdGEucGxhdGZvcm0gPT09ICdOZXRmbGl4JyB8fCBkYXRhLnBsYXRmb3JtID09PSAnU3BvdGlmeScgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ1R3aXRjaCcpIHtcbiAgICAgICAgICBjb250ZXh0ID0gXCJFbnRlcnRhaW5tZW50XCI7XG4gICAgICAgICAgc291cmNlID0gJ0V4dHJhY3Rpb24nO1xuICAgICAgfSBlbHNlIGlmIChkYXRhLnBsYXRmb3JtID09PSAnR2l0SHViJyB8fCBkYXRhLnBsYXRmb3JtID09PSAnU3RhY2sgT3ZlcmZsb3cnIHx8IGRhdGEucGxhdGZvcm0gPT09ICdKaXJhJyB8fCBkYXRhLnBsYXRmb3JtID09PSAnR2l0TGFiJykge1xuICAgICAgICAgIGNvbnRleHQgPSBcIkRldmVsb3BtZW50XCI7XG4gICAgICAgICAgc291cmNlID0gJ0V4dHJhY3Rpb24nO1xuICAgICAgfSBlbHNlIGlmIChkYXRhLnBsYXRmb3JtID09PSAnR29vZ2xlJyAmJiAoZGF0YS5ub3JtYWxpemVkVXJsLmluY2x1ZGVzKCdkb2NzJykgfHwgZGF0YS5ub3JtYWxpemVkVXJsLmluY2x1ZGVzKCdzaGVldHMnKSB8fCBkYXRhLm5vcm1hbGl6ZWRVcmwuaW5jbHVkZXMoJ3NsaWRlcycpKSkge1xuICAgICAgICAgIGNvbnRleHQgPSBcIldvcmtcIjtcbiAgICAgICAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBJZiB3ZSBoYXZlIHN1Y2Nlc3NmdWwgZXh0cmFjdGlvbiBkYXRhIGJ1dCBubyBzcGVjaWZpYyBydWxlIG1hdGNoZWQsXG4gICAgICAgIC8vIHVzZSB0aGUgT2JqZWN0IFR5cGUgb3IgZ2VuZXJpYyBcIkdlbmVyYWwgV2ViXCIgdG8gaW5kaWNhdGUgZXh0cmFjdGlvbiB3b3JrZWQuXG4gICAgICAgIC8vIFdlIHByZWZlciBzcGVjaWZpYyBjYXRlZ29yaWVzLCBidXQgXCJBcnRpY2xlXCIgb3IgXCJWaWRlb1wiIGFyZSBiZXR0ZXIgdGhhbiBcIlVuY2F0ZWdvcml6ZWRcIi5cbiAgICAgICAgaWYgKGRhdGEub2JqZWN0VHlwZSAmJiBkYXRhLm9iamVjdFR5cGUgIT09ICd1bmtub3duJykge1xuICAgICAgICAgICAgIC8vIE1hcCBvYmplY3QgdHlwZXMgdG8gY2F0ZWdvcmllcyBpZiBwb3NzaWJsZVxuICAgICAgICAgICAgIGlmIChkYXRhLm9iamVjdFR5cGUgPT09ICd2aWRlbycpIGNvbnRleHQgPSAnRW50ZXJ0YWlubWVudCc7XG4gICAgICAgICAgICAgZWxzZSBpZiAoZGF0YS5vYmplY3RUeXBlID09PSAnYXJ0aWNsZScpIGNvbnRleHQgPSAnTmV3cyc7IC8vIExvb3NlIG1hcHBpbmcsIGJ1dCBiZXR0ZXIgdGhhbiBub3RoaW5nXG4gICAgICAgICAgICAgZWxzZSBjb250ZXh0ID0gZGF0YS5vYmplY3RUeXBlLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgZGF0YS5vYmplY3RUeXBlLnNsaWNlKDEpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgIGNvbnRleHQgPSBcIkdlbmVyYWwgV2ViXCI7XG4gICAgICAgIH1cbiAgICAgICAgc291cmNlID0gJ0V4dHJhY3Rpb24nO1xuICAgICAgfVxuICB9XG5cbiAgLy8gMy4gRmFsbGJhY2sgdG8gTG9jYWwgSGV1cmlzdGljIChVUkwgUmVnZXgpXG4gIGlmIChjb250ZXh0ID09PSBcIlVuY2F0ZWdvcml6ZWRcIikge1xuICAgICAgY29uc3QgaCA9IGF3YWl0IGxvY2FsSGV1cmlzdGljKHRhYik7XG4gICAgICBpZiAoaC5jb250ZXh0ICE9PSBcIlVuY2F0ZWdvcml6ZWRcIikge1xuICAgICAgICAgIGNvbnRleHQgPSBoLmNvbnRleHQ7XG4gICAgICAgICAgLy8gc291cmNlIHJlbWFpbnMgJ0hldXJpc3RpYycgKG9yIG1heWJlIHdlIHNob3VsZCBzYXkgJ0hldXJpc3RpYycgaXMgdGhlIHNvdXJjZT8pXG4gICAgICAgICAgLy8gVGhlIGxvY2FsSGV1cmlzdGljIGZ1bmN0aW9uIHJldHVybnMgeyBzb3VyY2U6ICdIZXVyaXN0aWMnIH1cbiAgICAgIH1cbiAgfVxuXG4gIC8vIDQuIEZhbGxiYWNrIHRvIEFJIChMTE0pIC0gUkVNT1ZFRFxuICAvLyBUaGUgSHVnZ2luZ0ZhY2UgQVBJIGVuZHBvaW50IGlzIDQxMCBHb25lIGFuZC9vciByZXF1aXJlcyBhdXRoZW50aWNhdGlvbiB3aGljaCB3ZSBkbyBub3QgaGF2ZS5cbiAgLy8gVGhlIGNvZGUgaGFzIGJlZW4gcmVtb3ZlZCB0byBwcmV2ZW50IGVycm9ycy5cblxuICBpZiAoY29udGV4dCAhPT0gXCJVbmNhdGVnb3JpemVkXCIgJiYgc291cmNlICE9PSBcIkV4dHJhY3Rpb25cIikge1xuICAgIGVycm9yID0gdW5kZWZpbmVkO1xuICAgIHN0YXR1cyA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIHJldHVybiB7IGNvbnRleHQsIHNvdXJjZSwgZGF0YTogZGF0YSB8fCB1bmRlZmluZWQsIGVycm9yLCBzdGF0dXMgfTtcbn07XG5cbmNvbnN0IGxvY2FsSGV1cmlzdGljID0gYXN5bmMgKHRhYjogVGFiTWV0YWRhdGEpOiBQcm9taXNlPENvbnRleHRSZXN1bHQ+ID0+IHtcbiAgY29uc3QgdXJsID0gdGFiLnVybC50b0xvd2VyQ2FzZSgpO1xuICBsZXQgY29udGV4dCA9IFwiVW5jYXRlZ29yaXplZFwiO1xuXG4gIGlmICh1cmwuaW5jbHVkZXMoXCJnaXRodWJcIikgfHwgdXJsLmluY2x1ZGVzKFwic3RhY2tvdmVyZmxvd1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJsb2NhbGhvc3RcIikgfHwgdXJsLmluY2x1ZGVzKFwiamlyYVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJnaXRsYWJcIikpIGNvbnRleHQgPSBcIkRldmVsb3BtZW50XCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImdvb2dsZVwiKSAmJiAodXJsLmluY2x1ZGVzKFwiZG9jc1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJzaGVldHNcIikgfHwgdXJsLmluY2x1ZGVzKFwic2xpZGVzXCIpKSkgY29udGV4dCA9IFwiV29ya1wiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJsaW5rZWRpblwiKSB8fCB1cmwuaW5jbHVkZXMoXCJzbGFja1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJ6b29tXCIpIHx8IHVybC5pbmNsdWRlcyhcInRlYW1zXCIpKSBjb250ZXh0ID0gXCJXb3JrXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcIm5ldGZsaXhcIikgfHwgdXJsLmluY2x1ZGVzKFwic3BvdGlmeVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJodWx1XCIpIHx8IHVybC5pbmNsdWRlcyhcImRpc25leVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ5b3V0dWJlXCIpKSBjb250ZXh0ID0gXCJFbnRlcnRhaW5tZW50XCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcInR3aXR0ZXJcIikgfHwgdXJsLmluY2x1ZGVzKFwiZmFjZWJvb2tcIikgfHwgdXJsLmluY2x1ZGVzKFwiaW5zdGFncmFtXCIpIHx8IHVybC5pbmNsdWRlcyhcInJlZGRpdFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ0aWt0b2tcIikgfHwgdXJsLmluY2x1ZGVzKFwicGludGVyZXN0XCIpKSBjb250ZXh0ID0gXCJTb2NpYWxcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwiYW1hem9uXCIpIHx8IHVybC5pbmNsdWRlcyhcImViYXlcIikgfHwgdXJsLmluY2x1ZGVzKFwid2FsbWFydFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ0YXJnZXRcIikgfHwgdXJsLmluY2x1ZGVzKFwic2hvcGlmeVwiKSkgY29udGV4dCA9IFwiU2hvcHBpbmdcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwiY25uXCIpIHx8IHVybC5pbmNsdWRlcyhcImJiY1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJueXRpbWVzXCIpIHx8IHVybC5pbmNsdWRlcyhcIndhc2hpbmd0b25wb3N0XCIpIHx8IHVybC5pbmNsdWRlcyhcImZveG5ld3NcIikpIGNvbnRleHQgPSBcIk5ld3NcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwiY291cnNlcmFcIikgfHwgdXJsLmluY2x1ZGVzKFwidWRlbXlcIikgfHwgdXJsLmluY2x1ZGVzKFwiZWR4XCIpIHx8IHVybC5pbmNsdWRlcyhcImtoYW5hY2FkZW15XCIpIHx8IHVybC5pbmNsdWRlcyhcImNhbnZhc1wiKSkgY29udGV4dCA9IFwiRWR1Y2F0aW9uXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImV4cGVkaWFcIikgfHwgdXJsLmluY2x1ZGVzKFwiYm9va2luZ1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJhaXJibmJcIikgfHwgdXJsLmluY2x1ZGVzKFwidHJpcGFkdmlzb3JcIikgfHwgdXJsLmluY2x1ZGVzKFwia2F5YWtcIikpIGNvbnRleHQgPSBcIlRyYXZlbFwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJ3ZWJtZFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJtYXlvY2xpbmljXCIpIHx8IHVybC5pbmNsdWRlcyhcIm5paC5nb3ZcIikgfHwgdXJsLmluY2x1ZGVzKFwiaGVhbHRoXCIpKSBjb250ZXh0ID0gXCJIZWFsdGhcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwiZXNwblwiKSB8fCB1cmwuaW5jbHVkZXMoXCJuYmFcIikgfHwgdXJsLmluY2x1ZGVzKFwibmZsXCIpIHx8IHVybC5pbmNsdWRlcyhcIm1sYlwiKSB8fCB1cmwuaW5jbHVkZXMoXCJmaWZhXCIpKSBjb250ZXh0ID0gXCJTcG9ydHNcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwidGVjaGNydW5jaFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ3aXJlZFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ0aGV2ZXJnZVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJhcnN0ZWNobmljYVwiKSkgY29udGV4dCA9IFwiVGVjaG5vbG9neVwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJzY2llbmNlXCIpIHx8IHVybC5pbmNsdWRlcyhcIm5hdHVyZS5jb21cIikgfHwgdXJsLmluY2x1ZGVzKFwibmFzYS5nb3ZcIikpIGNvbnRleHQgPSBcIlNjaWVuY2VcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwidHdpdGNoXCIpIHx8IHVybC5pbmNsdWRlcyhcInN0ZWFtXCIpIHx8IHVybC5pbmNsdWRlcyhcInJvYmxveFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJpZ25cIikgfHwgdXJsLmluY2x1ZGVzKFwiZ2FtZXNwb3RcIikpIGNvbnRleHQgPSBcIkdhbWluZ1wiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJzb3VuZGNsb3VkXCIpIHx8IHVybC5pbmNsdWRlcyhcImJhbmRjYW1wXCIpIHx8IHVybC5pbmNsdWRlcyhcImxhc3QuZm1cIikpIGNvbnRleHQgPSBcIk11c2ljXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImRldmlhbnRhcnRcIikgfHwgdXJsLmluY2x1ZGVzKFwiYmVoYW5jZVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJkcmliYmJsZVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJhcnRzdGF0aW9uXCIpKSBjb250ZXh0ID0gXCJBcnRcIjtcblxuICByZXR1cm4geyBjb250ZXh0LCBzb3VyY2U6ICdIZXVyaXN0aWMnIH07XG59O1xuIiwgImltcG9ydCB7IEN1c3RvbVN0cmF0ZWd5LCBTb3J0aW5nU3RyYXRlZ3kgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0cmF0ZWd5RGVmaW5pdGlvbiB7XG4gICAgaWQ6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZztcbiAgICBsYWJlbDogc3RyaW5nO1xuICAgIGlzR3JvdXBpbmc6IGJvb2xlYW47XG4gICAgaXNTb3J0aW5nOiBib29sZWFuO1xuICAgIHRhZ3M/OiBzdHJpbmdbXTtcbiAgICBhdXRvUnVuPzogYm9vbGVhbjtcbiAgICBpc0N1c3RvbT86IGJvb2xlYW47XG59XG5cbi8vIFJlc3RvcmVkIHN0cmF0ZWdpZXMgbWF0Y2hpbmcgYmFja2dyb3VuZCBjYXBhYmlsaXRpZXMuXG5leHBvcnQgY29uc3QgU1RSQVRFR0lFUzogU3RyYXRlZ3lEZWZpbml0aW9uW10gPSBbXG4gICAgeyBpZDogXCJkb21haW5cIiwgbGFiZWw6IFwiRG9tYWluXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJkb21haW5fZnVsbFwiLCBsYWJlbDogXCJGdWxsIERvbWFpblwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidG9waWNcIiwgbGFiZWw6IFwiVG9waWNcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImNvbnRleHRcIiwgbGFiZWw6IFwiQ29udGV4dFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwibGluZWFnZVwiLCBsYWJlbDogXCJMaW5lYWdlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJwaW5uZWRcIiwgbGFiZWw6IFwiUGlubmVkXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJyZWNlbmN5XCIsIGxhYmVsOiBcIlJlY2VuY3lcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImFnZVwiLCBsYWJlbDogXCJBZ2VcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInVybFwiLCBsYWJlbDogXCJVUkxcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcIm5lc3RpbmdcIiwgbGFiZWw6IFwiTmVzdGluZ1wiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidGl0bGVcIiwgbGFiZWw6IFwiVGl0bGVcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbl07XG5cbmV4cG9ydCBjb25zdCBnZXRTdHJhdGVnaWVzID0gKGN1c3RvbVN0cmF0ZWdpZXM/OiBDdXN0b21TdHJhdGVneVtdKTogU3RyYXRlZ3lEZWZpbml0aW9uW10gPT4ge1xuICAgIGlmICghY3VzdG9tU3RyYXRlZ2llcyB8fCBjdXN0b21TdHJhdGVnaWVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFNUUkFURUdJRVM7XG5cbiAgICAvLyBDdXN0b20gc3RyYXRlZ2llcyBjYW4gb3ZlcnJpZGUgYnVpbHQtaW5zIGlmIElEcyBtYXRjaCwgb3IgYWRkIG5ldyBvbmVzLlxuICAgIGNvbnN0IGNvbWJpbmVkID0gWy4uLlNUUkFURUdJRVNdO1xuXG4gICAgY3VzdG9tU3RyYXRlZ2llcy5mb3JFYWNoKGN1c3RvbSA9PiB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nSW5kZXggPSBjb21iaW5lZC5maW5kSW5kZXgocyA9PiBzLmlkID09PSBjdXN0b20uaWQpO1xuXG4gICAgICAgIC8vIERldGVybWluZSBjYXBhYmlsaXRpZXMgYmFzZWQgb24gcnVsZXMgcHJlc2VuY2VcbiAgICAgICAgY29uc3QgaGFzR3JvdXBpbmcgPSAoY3VzdG9tLmdyb3VwaW5nUnVsZXMgJiYgY3VzdG9tLmdyb3VwaW5nUnVsZXMubGVuZ3RoID4gMCkgfHwgKGN1c3RvbS5ydWxlcyAmJiBjdXN0b20ucnVsZXMubGVuZ3RoID4gMCkgfHwgZmFsc2U7XG4gICAgICAgIGNvbnN0IGhhc1NvcnRpbmcgPSAoY3VzdG9tLnNvcnRpbmdSdWxlcyAmJiBjdXN0b20uc29ydGluZ1J1bGVzLmxlbmd0aCA+IDApIHx8IChjdXN0b20ucnVsZXMgJiYgY3VzdG9tLnJ1bGVzLmxlbmd0aCA+IDApIHx8IGZhbHNlO1xuXG4gICAgICAgIGNvbnN0IHRhZ3M6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGlmIChoYXNHcm91cGluZykgdGFncy5wdXNoKFwiZ3JvdXBcIik7XG4gICAgICAgIGlmIChoYXNTb3J0aW5nKSB0YWdzLnB1c2goXCJzb3J0XCIpO1xuXG4gICAgICAgIGNvbnN0IGRlZmluaXRpb246IFN0cmF0ZWd5RGVmaW5pdGlvbiA9IHtcbiAgICAgICAgICAgIGlkOiBjdXN0b20uaWQsXG4gICAgICAgICAgICBsYWJlbDogY3VzdG9tLmxhYmVsLFxuICAgICAgICAgICAgaXNHcm91cGluZzogaGFzR3JvdXBpbmcsXG4gICAgICAgICAgICBpc1NvcnRpbmc6IGhhc1NvcnRpbmcsXG4gICAgICAgICAgICB0YWdzOiB0YWdzLFxuICAgICAgICAgICAgYXV0b1J1bjogY3VzdG9tLmF1dG9SdW4sXG4gICAgICAgICAgICBpc0N1c3RvbTogdHJ1ZVxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChleGlzdGluZ0luZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgY29tYmluZWRbZXhpc3RpbmdJbmRleF0gPSBkZWZpbml0aW9uO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29tYmluZWQucHVzaChkZWZpbml0aW9uKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNvbWJpbmVkO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldFN0cmF0ZWd5ID0gKGlkOiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiBTdHJhdGVneURlZmluaXRpb24gfCB1bmRlZmluZWQgPT4gU1RSQVRFR0lFUy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpO1xuIiwgImltcG9ydCB7IEdyb3VwaW5nU3RyYXRlZ3ksIFNvcnRpbmdTdHJhdGVneSwgVGFiR3JvdXAsIFRhYk1ldGFkYXRhLCBDdXN0b21TdHJhdGVneSwgU3RyYXRlZ3lSdWxlLCBSdWxlQ29uZGl0aW9uLCBHcm91cGluZ1J1bGUsIFNvcnRpbmdSdWxlIH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZ2V0U3RyYXRlZ2llcyB9IGZyb20gXCIuLi9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxubGV0IGN1c3RvbVN0cmF0ZWdpZXM6IEN1c3RvbVN0cmF0ZWd5W10gPSBbXTtcblxuZXhwb3J0IGNvbnN0IHNldEN1c3RvbVN0cmF0ZWdpZXMgPSAoc3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSkgPT4ge1xuICAgIGN1c3RvbVN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldEN1c3RvbVN0cmF0ZWdpZXMgPSAoKTogQ3VzdG9tU3RyYXRlZ3lbXSA9PiBjdXN0b21TdHJhdGVnaWVzO1xuXG5jb25zdCBDT0xPUlMgPSBbXCJncmV5XCIsIFwiYmx1ZVwiLCBcInJlZFwiLCBcInllbGxvd1wiLCBcImdyZWVuXCIsIFwicGlua1wiLCBcInB1cnBsZVwiLCBcImN5YW5cIiwgXCJvcmFuZ2VcIl07XG5cbmNvbnN0IHJlZ2V4Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUmVnRXhwPigpO1xuY29uc3QgZG9tYWluQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuY29uc3Qgc3ViZG9tYWluQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuY29uc3QgTUFYX0NBQ0hFX1NJWkUgPSAxMDAwO1xuXG5leHBvcnQgY29uc3QgZG9tYWluRnJvbVVybCA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGlmIChkb21haW5DYWNoZS5oYXModXJsKSkgcmV0dXJuIGRvbWFpbkNhY2hlLmdldCh1cmwpITtcblxuICB0cnkge1xuICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwodXJsKTtcbiAgICBjb25zdCBkb21haW4gPSBwYXJzZWQuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xuXG4gICAgaWYgKGRvbWFpbkNhY2hlLnNpemUgPj0gTUFYX0NBQ0hFX1NJWkUpIGRvbWFpbkNhY2hlLmNsZWFyKCk7XG4gICAgZG9tYWluQ2FjaGUuc2V0KHVybCwgZG9tYWluKTtcblxuICAgIHJldHVybiBkb21haW47XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgbG9nRGVidWcoXCJGYWlsZWQgdG8gcGFyc2UgZG9tYWluXCIsIHsgdXJsLCBlcnJvcjogU3RyaW5nKGVycm9yKSB9KTtcbiAgICByZXR1cm4gXCJ1bmtub3duXCI7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBzdWJkb21haW5Gcm9tVXJsID0gKHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICBpZiAoc3ViZG9tYWluQ2FjaGUuaGFzKHVybCkpIHJldHVybiBzdWJkb21haW5DYWNoZS5nZXQodXJsKSE7XG5cbiAgICB0cnkge1xuICAgICAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XG4gICAgICAgIGxldCBob3N0bmFtZSA9IHBhcnNlZC5ob3N0bmFtZTtcbiAgICAgICAgLy8gUmVtb3ZlIHd3dy5cbiAgICAgICAgaG9zdG5hbWUgPSBob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG5cbiAgICAgICAgbGV0IHJlc3VsdCA9IFwiXCI7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gaG9zdG5hbWUuc3BsaXQoJy4nKTtcbiAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDIpIHtcbiAgICAgICAgICAgICByZXN1bHQgPSBwYXJ0cy5zbGljZSgwLCBwYXJ0cy5sZW5ndGggLSAyKS5qb2luKCcuJyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3ViZG9tYWluQ2FjaGUuc2l6ZSA+PSBNQVhfQ0FDSEVfU0laRSkgc3ViZG9tYWluQ2FjaGUuY2xlYXIoKTtcbiAgICAgICAgc3ViZG9tYWluQ2FjaGUuc2V0KHVybCwgcmVzdWx0KTtcblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gXCJcIjtcbiAgICB9XG59XG5cbmV4cG9ydCBjb25zdCBnZXRGaWVsZFZhbHVlID0gKHRhYjogVGFiTWV0YWRhdGEsIGZpZWxkOiBzdHJpbmcpOiBhbnkgPT4ge1xuICAgIHN3aXRjaChmaWVsZCkge1xuICAgICAgICBjYXNlICdpZCc6IHJldHVybiB0YWIuaWQ7XG4gICAgICAgIGNhc2UgJ2luZGV4JzogcmV0dXJuIHRhYi5pbmRleDtcbiAgICAgICAgY2FzZSAnd2luZG93SWQnOiByZXR1cm4gdGFiLndpbmRvd0lkO1xuICAgICAgICBjYXNlICdncm91cElkJzogcmV0dXJuIHRhYi5ncm91cElkO1xuICAgICAgICBjYXNlICd0aXRsZSc6IHJldHVybiB0YWIudGl0bGU7XG4gICAgICAgIGNhc2UgJ3VybCc6IHJldHVybiB0YWIudXJsO1xuICAgICAgICBjYXNlICdzdGF0dXMnOiByZXR1cm4gdGFiLnN0YXR1cztcbiAgICAgICAgY2FzZSAnYWN0aXZlJzogcmV0dXJuIHRhYi5hY3RpdmU7XG4gICAgICAgIGNhc2UgJ3NlbGVjdGVkJzogcmV0dXJuIHRhYi5zZWxlY3RlZDtcbiAgICAgICAgY2FzZSAncGlubmVkJzogcmV0dXJuIHRhYi5waW5uZWQ7XG4gICAgICAgIGNhc2UgJ29wZW5lclRhYklkJzogcmV0dXJuIHRhYi5vcGVuZXJUYWJJZDtcbiAgICAgICAgY2FzZSAnbGFzdEFjY2Vzc2VkJzogcmV0dXJuIHRhYi5sYXN0QWNjZXNzZWQ7XG4gICAgICAgIGNhc2UgJ2NvbnRleHQnOiByZXR1cm4gdGFiLmNvbnRleHQ7XG4gICAgICAgIGNhc2UgJ2dlbnJlJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uZ2VucmU7XG4gICAgICAgIGNhc2UgJ3NpdGVOYW1lJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uc2l0ZU5hbWU7XG4gICAgICAgIC8vIERlcml2ZWQgb3IgbWFwcGVkIGZpZWxkc1xuICAgICAgICBjYXNlICdkb21haW4nOiByZXR1cm4gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgICAgY2FzZSAnc3ViZG9tYWluJzogcmV0dXJuIHN1YmRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBpZiAoZmllbGQuaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICAgICAgICAgICByZXR1cm4gZmllbGQuc3BsaXQoJy4nKS5yZWR1Y2UoKG9iaiwga2V5KSA9PiAob2JqICYmIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmIG9iaiAhPT0gbnVsbCkgPyAob2JqIGFzIGFueSlba2V5XSA6IHVuZGVmaW5lZCwgdGFiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiAodGFiIGFzIGFueSlbZmllbGRdO1xuICAgIH1cbn07XG5cbmNvbnN0IHN0cmlwVGxkID0gKGRvbWFpbjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGRvbWFpbi5yZXBsYWNlKC9cXC4oY29tfG9yZ3xnb3Z8bmV0fGVkdXxpbykkL2ksIFwiXCIpO1xufTtcblxuZXhwb3J0IGNvbnN0IHNlbWFudGljQnVja2V0ID0gKHRpdGxlOiBzdHJpbmcsIHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3Qga2V5ID0gYCR7dGl0bGV9ICR7dXJsfWAudG9Mb3dlckNhc2UoKTtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRvY1wiKSB8fCBrZXkuaW5jbHVkZXMoXCJyZWFkbWVcIikgfHwga2V5LmluY2x1ZGVzKFwiZ3VpZGVcIikpIHJldHVybiBcIkRvY3NcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcIm1haWxcIikgfHwga2V5LmluY2x1ZGVzKFwiaW5ib3hcIikpIHJldHVybiBcIkNoYXRcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRhc2hib2FyZFwiKSB8fCBrZXkuaW5jbHVkZXMoXCJjb25zb2xlXCIpKSByZXR1cm4gXCJEYXNoXCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJpc3N1ZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJ0aWNrZXRcIikpIHJldHVybiBcIlRhc2tzXCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJkcml2ZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJzdG9yYWdlXCIpKSByZXR1cm4gXCJGaWxlc1wiO1xuICByZXR1cm4gXCJNaXNjXCI7XG59O1xuXG5leHBvcnQgY29uc3QgbmF2aWdhdGlvbktleSA9ICh0YWI6IFRhYk1ldGFkYXRhKTogc3RyaW5nID0+IHtcbiAgaWYgKHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIGBjaGlsZC1vZi0ke3RhYi5vcGVuZXJUYWJJZH1gO1xuICB9XG4gIHJldHVybiBgd2luZG93LSR7dGFiLndpbmRvd0lkfWA7XG59O1xuXG5jb25zdCBnZXRSZWNlbmN5TGFiZWwgPSAobGFzdEFjY2Vzc2VkOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICBjb25zdCBkaWZmID0gbm93IC0gbGFzdEFjY2Vzc2VkO1xuICBpZiAoZGlmZiA8IDM2MDAwMDApIHJldHVybiBcIkp1c3Qgbm93XCI7IC8vIDFoXG4gIGlmIChkaWZmIDwgODY0MDAwMDApIHJldHVybiBcIlRvZGF5XCI7IC8vIDI0aFxuICBpZiAoZGlmZiA8IDE3MjgwMDAwMCkgcmV0dXJuIFwiWWVzdGVyZGF5XCI7IC8vIDQ4aFxuICBpZiAoZGlmZiA8IDYwNDgwMDAwMCkgcmV0dXJuIFwiVGhpcyBXZWVrXCI7IC8vIDdkXG4gIHJldHVybiBcIk9sZGVyXCI7XG59O1xuXG5jb25zdCBjb2xvckZvcktleSA9IChrZXk6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIpOiBzdHJpbmcgPT4gQ09MT1JTWyhNYXRoLmFicyhoYXNoQ29kZShrZXkpKSArIG9mZnNldCkgJSBDT0xPUlMubGVuZ3RoXTtcblxuY29uc3QgaGFzaENvZGUgPSAodmFsdWU6IHN0cmluZyk6IG51bWJlciA9PiB7XG4gIGxldCBoYXNoID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5sZW5ndGg7IGkgKz0gMSkge1xuICAgIGhhc2ggPSAoaGFzaCA8PCA1KSAtIGhhc2ggKyB2YWx1ZS5jaGFyQ29kZUF0KGkpO1xuICAgIGhhc2ggfD0gMDtcbiAgfVxuICByZXR1cm4gaGFzaDtcbn07XG5cbi8vIEhlbHBlciB0byBnZXQgYSBodW1hbi1yZWFkYWJsZSBsYWJlbCBjb21wb25lbnQgZnJvbSBhIHN0cmF0ZWd5IGFuZCBhIHNldCBvZiB0YWJzXG5jb25zdCBnZXRMYWJlbENvbXBvbmVudCA9IChzdHJhdGVneTogR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZywgdGFiczogVGFiTWV0YWRhdGFbXSwgYWxsVGFic01hcDogTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+KTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGNvbnN0IGZpcnN0VGFiID0gdGFic1swXTtcbiAgaWYgKCFmaXJzdFRhYikgcmV0dXJuIFwiVW5rbm93blwiO1xuXG4gIC8vIENoZWNrIGN1c3RvbSBzdHJhdGVnaWVzIGZpcnN0XG4gIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgcmV0dXJuIGdyb3VwaW5nS2V5KGZpcnN0VGFiLCBzdHJhdGVneSk7XG4gIH1cblxuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcImRvbWFpblwiOiB7XG4gICAgICBjb25zdCBzaXRlTmFtZXMgPSBuZXcgU2V0KHRhYnMubWFwKHQgPT4gdC5jb250ZXh0RGF0YT8uc2l0ZU5hbWUpLmZpbHRlcihCb29sZWFuKSk7XG4gICAgICBpZiAoc2l0ZU5hbWVzLnNpemUgPT09IDEpIHtcbiAgICAgICAgcmV0dXJuIHN0cmlwVGxkKEFycmF5LmZyb20oc2l0ZU5hbWVzKVswXSBhcyBzdHJpbmcpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN0cmlwVGxkKGRvbWFpbkZyb21VcmwoZmlyc3RUYWIudXJsKSk7XG4gICAgfVxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgcmV0dXJuIGRvbWFpbkZyb21VcmwoZmlyc3RUYWIudXJsKTtcbiAgICBjYXNlIFwidG9waWNcIjpcbiAgICAgIHJldHVybiBzZW1hbnRpY0J1Y2tldChmaXJzdFRhYi50aXRsZSwgZmlyc3RUYWIudXJsKTtcbiAgICBjYXNlIFwibGluZWFnZVwiOlxuICAgICAgaWYgKGZpcnN0VGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29uc3QgcGFyZW50ID0gYWxsVGFic01hcC5nZXQoZmlyc3RUYWIub3BlbmVyVGFiSWQpO1xuICAgICAgICBpZiAocGFyZW50KSB7XG4gICAgICAgICAgY29uc3QgcGFyZW50VGl0bGUgPSBwYXJlbnQudGl0bGUubGVuZ3RoID4gMjAgPyBwYXJlbnQudGl0bGUuc3Vic3RyaW5nKDAsIDIwKSArIFwiLi4uXCIgOiBwYXJlbnQudGl0bGU7XG4gICAgICAgICAgcmV0dXJuIGBGcm9tOiAke3BhcmVudFRpdGxlfWA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGBGcm9tOiBUYWIgJHtmaXJzdFRhYi5vcGVuZXJUYWJJZH1gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGBXaW5kb3cgJHtmaXJzdFRhYi53aW5kb3dJZH1gO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIjtcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIucGlubmVkID8gXCJQaW5uZWRcIiA6IFwiVW5waW5uZWRcIjtcbiAgICBjYXNlIFwiYWdlXCI6XG4gICAgICByZXR1cm4gZ2V0UmVjZW5jeUxhYmVsKGZpcnN0VGFiLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbiAgICBjYXNlIFwidXJsXCI6XG4gICAgICByZXR1cm4gXCJVUkwgR3JvdXBcIjtcbiAgICBjYXNlIFwicmVjZW5jeVwiOlxuICAgICAgcmV0dXJuIFwiVGltZSBHcm91cFwiO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IFwiQ2hpbGRyZW5cIiA6IFwiUm9vdHNcIjtcbiAgICBkZWZhdWx0OlxuICAgICAgY29uc3QgdmFsID0gZ2V0RmllbGRWYWx1ZShmaXJzdFRhYiwgc3RyYXRlZ3kpO1xuICAgICAgaWYgKHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiBTdHJpbmcodmFsKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBcIlVua25vd25cIjtcbiAgfVxufTtcblxuY29uc3QgZ2VuZXJhdGVMYWJlbCA9IChcbiAgc3RyYXRlZ2llczogKEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpW10sXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIGFsbFRhYnNNYXA6IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPlxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgbGFiZWxzID0gc3RyYXRlZ2llc1xuICAgIC5tYXAocyA9PiBnZXRMYWJlbENvbXBvbmVudChzLCB0YWJzLCBhbGxUYWJzTWFwKSlcbiAgICAuZmlsdGVyKGwgPT4gbCAmJiBsICE9PSBcIlVua25vd25cIiAmJiBsICE9PSBcIkdyb3VwXCIgJiYgbCAhPT0gXCJVUkwgR3JvdXBcIiAmJiBsICE9PSBcIlRpbWUgR3JvdXBcIiAmJiBsICE9PSBcIk1pc2NcIik7XG5cbiAgaWYgKGxhYmVscy5sZW5ndGggPT09IDApIHJldHVybiBcIkdyb3VwXCI7XG4gIHJldHVybiBBcnJheS5mcm9tKG5ldyBTZXQobGFiZWxzKSkuam9pbihcIiAtIFwiKTtcbn07XG5cbmNvbnN0IGdldFN0cmF0ZWd5Q29sb3JSdWxlID0gKHN0cmF0ZWd5SWQ6IHN0cmluZyk6IEdyb3VwaW5nUnVsZSB8IHVuZGVmaW5lZCA9PiB7XG4gICAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3lJZCk7XG4gICAgaWYgKCFjdXN0b20pIHJldHVybiB1bmRlZmluZWQ7XG5cbiAgICBjb25zdCBncm91cGluZ1J1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgLy8gSXRlcmF0ZSBtYW51YWxseSB0byBjaGVjayBjb2xvclxuICAgIGZvciAobGV0IGkgPSBncm91cGluZ1J1bGVzTGlzdC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICBjb25zdCBydWxlID0gZ3JvdXBpbmdSdWxlc0xpc3RbaV07XG4gICAgICAgIGlmIChydWxlICYmIHJ1bGUuY29sb3IgJiYgcnVsZS5jb2xvciAhPT0gJ3JhbmRvbScpIHtcbiAgICAgICAgICAgIHJldHVybiBydWxlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB1bmRlZmluZWQ7XG59O1xuXG5jb25zdCByZXNvbHZlV2luZG93TW9kZSA9IChtb2RlczogKHN0cmluZyB8IHVuZGVmaW5lZClbXSk6IFwiY3VycmVudFwiIHwgXCJuZXdcIiB8IFwiY29tcG91bmRcIiA9PiB7XG4gICAgaWYgKG1vZGVzLmluY2x1ZGVzKFwibmV3XCIpKSByZXR1cm4gXCJuZXdcIjtcbiAgICBpZiAobW9kZXMuaW5jbHVkZXMoXCJjb21wb3VuZFwiKSkgcmV0dXJuIFwiY29tcG91bmRcIjtcbiAgICByZXR1cm4gXCJjdXJyZW50XCI7XG59O1xuXG5leHBvcnQgY29uc3QgZ3JvdXBUYWJzID0gKFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBzdHJhdGVnaWVzOiAoU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nKVtdXG4pOiBUYWJHcm91cFtdID0+IHtcbiAgY29uc3QgYXZhaWxhYmxlU3RyYXRlZ2llcyA9IGdldFN0cmF0ZWdpZXMoY3VzdG9tU3RyYXRlZ2llcyk7XG4gIGNvbnN0IGVmZmVjdGl2ZVN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IGF2YWlsYWJsZVN0cmF0ZWdpZXMuZmluZChhdmFpbCA9PiBhdmFpbC5pZCA9PT0gcyk/LmlzR3JvdXBpbmcpO1xuICBjb25zdCBidWNrZXRzID0gbmV3IE1hcDxzdHJpbmcsIFRhYkdyb3VwPigpO1xuXG4gIGNvbnN0IGFsbFRhYnNNYXAgPSBuZXcgTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+KCk7XG4gIHRhYnMuZm9yRWFjaCh0ID0+IGFsbFRhYnNNYXAuc2V0KHQuaWQsIHQpKTtcblxuICB0YWJzLmZvckVhY2goKHRhYikgPT4ge1xuICAgIGxldCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGFwcGxpZWRTdHJhdGVnaWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGNvbGxlY3RlZE1vZGVzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCBzIG9mIGVmZmVjdGl2ZVN0cmF0ZWdpZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGdldEdyb3VwaW5nUmVzdWx0KHRhYiwgcyk7XG4gICAgICAgICAgICBpZiAocmVzdWx0LmtleSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGtleXMucHVzaChgJHtzfToke3Jlc3VsdC5rZXl9YCk7XG4gICAgICAgICAgICAgICAgYXBwbGllZFN0cmF0ZWdpZXMucHVzaChzKTtcbiAgICAgICAgICAgICAgICBjb2xsZWN0ZWRNb2Rlcy5wdXNoKHJlc3VsdC5tb2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nRGVidWcoXCJFcnJvciBnZW5lcmF0aW5nIGdyb3VwaW5nIGtleVwiLCB7IHRhYklkOiB0YWIuaWQsIGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgIHJldHVybjsgLy8gU2tpcCB0aGlzIHRhYiBvbiBlcnJvclxuICAgIH1cblxuICAgIC8vIElmIG5vIHN0cmF0ZWdpZXMgYXBwbGllZCAoZS5nLiBhbGwgZmlsdGVyZWQgb3V0KSwgc2tpcCBncm91cGluZyBmb3IgdGhpcyB0YWJcbiAgICBpZiAoa2V5cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGVmZmVjdGl2ZU1vZGUgPSByZXNvbHZlV2luZG93TW9kZShjb2xsZWN0ZWRNb2Rlcyk7XG4gICAgY29uc3QgdmFsdWVLZXkgPSBrZXlzLmpvaW4oXCI6OlwiKTtcbiAgICBsZXQgYnVja2V0S2V5ID0gXCJcIjtcbiAgICBpZiAoZWZmZWN0aXZlTW9kZSA9PT0gJ2N1cnJlbnQnKSB7XG4gICAgICAgICBidWNrZXRLZXkgPSBgd2luZG93LSR7dGFiLndpbmRvd0lkfTo6YCArIHZhbHVlS2V5O1xuICAgIH0gZWxzZSB7XG4gICAgICAgICBidWNrZXRLZXkgPSBgZ2xvYmFsOjpgICsgdmFsdWVLZXk7XG4gICAgfVxuXG4gICAgbGV0IGdyb3VwID0gYnVja2V0cy5nZXQoYnVja2V0S2V5KTtcbiAgICBpZiAoIWdyb3VwKSB7XG4gICAgICBsZXQgZ3JvdXBDb2xvciA9IG51bGw7XG4gICAgICBsZXQgY29sb3JGaWVsZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gICAgICBmb3IgKGNvbnN0IHNJZCBvZiBhcHBsaWVkU3RyYXRlZ2llcykge1xuICAgICAgICBjb25zdCBydWxlID0gZ2V0U3RyYXRlZ3lDb2xvclJ1bGUoc0lkKTtcbiAgICAgICAgaWYgKHJ1bGUpIHtcbiAgICAgICAgICAgIGdyb3VwQ29sb3IgPSBydWxlLmNvbG9yO1xuICAgICAgICAgICAgY29sb3JGaWVsZCA9IHJ1bGUuY29sb3JGaWVsZDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChncm91cENvbG9yID09PSAnbWF0Y2gnKSB7XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleSh2YWx1ZUtleSwgMCk7XG4gICAgICB9IGVsc2UgaWYgKGdyb3VwQ29sb3IgPT09ICdmaWVsZCcgJiYgY29sb3JGaWVsZCkge1xuICAgICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKHRhYiwgY29sb3JGaWVsZCk7XG4gICAgICAgIGNvbnN0IGtleSA9IHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCA/IFN0cmluZyh2YWwpIDogXCJcIjtcbiAgICAgICAgZ3JvdXBDb2xvciA9IGNvbG9yRm9yS2V5KGtleSwgMCk7XG4gICAgICB9IGVsc2UgaWYgKCFncm91cENvbG9yIHx8IGdyb3VwQ29sb3IgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgZ3JvdXBDb2xvciA9IGNvbG9yRm9yS2V5KGJ1Y2tldEtleSwgYnVja2V0cy5zaXplKTtcbiAgICAgIH1cblxuICAgICAgZ3JvdXAgPSB7XG4gICAgICAgIGlkOiBidWNrZXRLZXksXG4gICAgICAgIHdpbmRvd0lkOiB0YWIud2luZG93SWQsXG4gICAgICAgIGxhYmVsOiBcIlwiLFxuICAgICAgICBjb2xvcjogZ3JvdXBDb2xvcixcbiAgICAgICAgdGFiczogW10sXG4gICAgICAgIHJlYXNvbjogYXBwbGllZFN0cmF0ZWdpZXMuam9pbihcIiArIFwiKSxcbiAgICAgICAgd2luZG93TW9kZTogZWZmZWN0aXZlTW9kZVxuICAgICAgfTtcbiAgICAgIGJ1Y2tldHMuc2V0KGJ1Y2tldEtleSwgZ3JvdXApO1xuICAgIH1cbiAgICBncm91cC50YWJzLnB1c2godGFiKTtcbiAgfSk7XG5cbiAgY29uc3QgZ3JvdXBzID0gQXJyYXkuZnJvbShidWNrZXRzLnZhbHVlcygpKTtcbiAgZ3JvdXBzLmZvckVhY2goZ3JvdXAgPT4ge1xuICAgIGdyb3VwLmxhYmVsID0gZ2VuZXJhdGVMYWJlbChlZmZlY3RpdmVTdHJhdGVnaWVzLCBncm91cC50YWJzLCBhbGxUYWJzTWFwKTtcbiAgfSk7XG5cbiAgcmV0dXJuIGdyb3Vwcztcbn07XG5cbmNvbnN0IGNoZWNrVmFsdWVNYXRjaCA9IChcbiAgICBvcGVyYXRvcjogc3RyaW5nLFxuICAgIHJhd1ZhbHVlOiBhbnksXG4gICAgcnVsZVZhbHVlOiBzdHJpbmdcbik6IHsgaXNNYXRjaDogYm9vbGVhbjsgbWF0Y2hPYmo6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGwgfSA9PiB7XG4gICAgY29uc3QgdmFsdWVTdHIgPSByYXdWYWx1ZSAhPT0gdW5kZWZpbmVkICYmIHJhd1ZhbHVlICE9PSBudWxsID8gU3RyaW5nKHJhd1ZhbHVlKSA6IFwiXCI7XG4gICAgY29uc3QgdmFsdWVUb0NoZWNrID0gdmFsdWVTdHIudG9Mb3dlckNhc2UoKTtcbiAgICBjb25zdCBwYXR0ZXJuVG9DaGVjayA9IHJ1bGVWYWx1ZSA/IHJ1bGVWYWx1ZS50b0xvd2VyQ2FzZSgpIDogXCJcIjtcblxuICAgIGxldCBpc01hdGNoID0gZmFsc2U7XG4gICAgbGV0IG1hdGNoT2JqOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsID0gbnVsbDtcblxuICAgIHN3aXRjaCAob3BlcmF0b3IpIHtcbiAgICAgICAgY2FzZSAnY29udGFpbnMnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrLmluY2x1ZGVzKHBhdHRlcm5Ub0NoZWNrKTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2RvZXNOb3RDb250YWluJzogaXNNYXRjaCA9ICF2YWx1ZVRvQ2hlY2suaW5jbHVkZXMocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZXF1YWxzJzogaXNNYXRjaCA9IHZhbHVlVG9DaGVjayA9PT0gcGF0dGVyblRvQ2hlY2s7IGJyZWFrO1xuICAgICAgICBjYXNlICdzdGFydHNXaXRoJzogaXNNYXRjaCA9IHZhbHVlVG9DaGVjay5zdGFydHNXaXRoKHBhdHRlcm5Ub0NoZWNrKTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2VuZHNXaXRoJzogaXNNYXRjaCA9IHZhbHVlVG9DaGVjay5lbmRzV2l0aChwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdleGlzdHMnOiBpc01hdGNoID0gcmF3VmFsdWUgIT09IHVuZGVmaW5lZDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2RvZXNOb3RFeGlzdCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSA9PT0gdW5kZWZpbmVkOyBicmVhaztcbiAgICAgICAgY2FzZSAnaXNOdWxsJzogaXNNYXRjaCA9IHJhd1ZhbHVlID09PSBudWxsOyBicmVhaztcbiAgICAgICAgY2FzZSAnaXNOb3ROdWxsJzogaXNNYXRjaCA9IHJhd1ZhbHVlICE9PSBudWxsOyBicmVhaztcbiAgICAgICAgY2FzZSAnbWF0Y2hlcyc6XG4gICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCByZWdleCA9IG5ldyBSZWdFeHAocnVsZVZhbHVlLCAnaScpO1xuICAgICAgICAgICAgICAgIG1hdGNoT2JqID0gcmVnZXguZXhlYyh2YWx1ZVN0cik7XG4gICAgICAgICAgICAgICAgaXNNYXRjaCA9ICEhbWF0Y2hPYmo7XG4gICAgICAgICAgICAgfSBjYXRjaCB7IH1cbiAgICAgICAgICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIHsgaXNNYXRjaCwgbWF0Y2hPYmogfTtcbn07XG5cbmV4cG9ydCBjb25zdCBjaGVja0NvbmRpdGlvbiA9IChjb25kaXRpb246IFJ1bGVDb25kaXRpb24sIHRhYjogVGFiTWV0YWRhdGEpOiBib29sZWFuID0+IHtcbiAgICBpZiAoIWNvbmRpdGlvbikgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IHJhd1ZhbHVlID0gZ2V0RmllbGRWYWx1ZSh0YWIsIGNvbmRpdGlvbi5maWVsZCk7XG4gICAgY29uc3QgeyBpc01hdGNoIH0gPSBjaGVja1ZhbHVlTWF0Y2goY29uZGl0aW9uLm9wZXJhdG9yLCByYXdWYWx1ZSwgY29uZGl0aW9uLnZhbHVlKTtcbiAgICByZXR1cm4gaXNNYXRjaDtcbn07XG5cbmZ1bmN0aW9uIGV2YWx1YXRlTGVnYWN5UnVsZXMobGVnYWN5UnVsZXM6IFN0cmF0ZWd5UnVsZVtdLCB0YWI6IFRhYk1ldGFkYXRhKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgLy8gRGVmZW5zaXZlIGNoZWNrXG4gICAgaWYgKCFsZWdhY3lSdWxlcyB8fCAhQXJyYXkuaXNBcnJheShsZWdhY3lSdWxlcykpIHtcbiAgICAgICAgaWYgKCFsZWdhY3lSdWxlcykgcmV0dXJuIG51bGw7XG4gICAgICAgIC8vIFRyeSBhc0FycmF5IGlmIGl0J3Mgbm90IGFycmF5IGJ1dCB0cnV0aHkgKHVubGlrZWx5IGdpdmVuIHByZXZpb3VzIGxvZ2ljIGJ1dCBzYWZlKVxuICAgIH1cblxuICAgIGNvbnN0IGxlZ2FjeVJ1bGVzTGlzdCA9IGFzQXJyYXk8U3RyYXRlZ3lSdWxlPihsZWdhY3lSdWxlcyk7XG4gICAgaWYgKGxlZ2FjeVJ1bGVzTGlzdC5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGxlZ2FjeVJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHJhd1ZhbHVlID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgY29uc3QgeyBpc01hdGNoLCBtYXRjaE9iaiB9ID0gY2hlY2tWYWx1ZU1hdGNoKHJ1bGUub3BlcmF0b3IsIHJhd1ZhbHVlLCBydWxlLnZhbHVlKTtcblxuICAgICAgICAgICAgaWYgKGlzTWF0Y2gpIHtcbiAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gcnVsZS5yZXN1bHQ7XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoT2JqKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbWF0Y2hPYmoubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShuZXcgUmVnRXhwKGBcXFxcJCR7aX1gLCAnZycpLCBtYXRjaE9ialtpXSB8fCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbG9nRGVidWcoXCJFcnJvciBldmFsdWF0aW5nIGxlZ2FjeSBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGNvbnN0IGdldEdyb3VwaW5nUmVzdWx0ID0gKHRhYjogVGFiTWV0YWRhdGEsIHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogeyBrZXk6IHN0cmluZyB8IG51bGwsIG1vZGU6IFwiY3VycmVudFwiIHwgXCJuZXdcIiB8IFwiY29tcG91bmRcIiB9ID0+IHtcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICBjb25zdCBmaWx0ZXJHcm91cHNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uW10+KGN1c3RvbS5maWx0ZXJHcm91cHMpO1xuICAgICAgY29uc3QgZmlsdGVyc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGN1c3RvbS5maWx0ZXJzKTtcblxuICAgICAgbGV0IG1hdGNoID0gZmFsc2U7XG5cbiAgICAgIGlmIChmaWx0ZXJHcm91cHNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBPUiBsb2dpY1xuICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZmlsdGVyR3JvdXBzTGlzdCkge1xuICAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihncm91cCk7XG4gICAgICAgICAgICAgIGlmIChncm91cFJ1bGVzLmxlbmd0aCA9PT0gMCB8fCBncm91cFJ1bGVzLmV2ZXJ5KHIgPT4gY2hlY2tDb25kaXRpb24ociwgdGFiKSkpIHtcbiAgICAgICAgICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChmaWx0ZXJzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gTGVnYWN5L1NpbXBsZSBBTkQgbG9naWNcbiAgICAgICAgICBpZiAoZmlsdGVyc0xpc3QuZXZlcnkoZiA9PiBjaGVja0NvbmRpdGlvbihmLCB0YWIpKSkge1xuICAgICAgICAgICAgICBtYXRjaCA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBObyBmaWx0ZXJzIC0+IE1hdGNoIGFsbFxuICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICAgIHJldHVybiB7IGtleTogbnVsbCwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZ3JvdXBpbmdSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgICAgaWYgKGdyb3VwaW5nUnVsZXNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICBjb25zdCBtb2Rlczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwaW5nUnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBsZXQgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICAgICBpZiAocnVsZS5zb3VyY2UgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJhdyA9IGdldEZpZWxkVmFsdWUodGFiLCBydWxlLnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHJhdyAhPT0gdW5kZWZpbmVkICYmIHJhdyAhPT0gbnVsbCA/IFN0cmluZyhyYXcpIDogXCJcIjtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgdmFsID0gcnVsZS52YWx1ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodmFsICYmIHJ1bGUudHJhbnNmb3JtICYmIHJ1bGUudHJhbnNmb3JtICE9PSAnbm9uZScpIHtcbiAgICAgICAgICAgICAgICAgICAgc3dpdGNoIChydWxlLnRyYW5zZm9ybSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnc3RyaXBUbGQnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHN0cmlwVGxkKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdsb3dlcmNhc2UnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHZhbC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAndXBwZXJjYXNlJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSB2YWwudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ2ZpcnN0Q2hhcic6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gdmFsLmNoYXJBdCgwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ2RvbWFpbic6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gZG9tYWluRnJvbVVybCh2YWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnaG9zdG5hbWUnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBuZXcgVVJMKHZhbCkuaG9zdG5hbWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIGtlZXAgYXMgaXMgKi8gfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAncmVnZXgnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChydWxlLnRyYW5zZm9ybVBhdHRlcm4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCByZWdleCA9IHJlZ2V4Q2FjaGUuZ2V0KHJ1bGUudHJhbnNmb3JtUGF0dGVybik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXJlZ2V4KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVnZXggPSBuZXcgUmVnRXhwKHJ1bGUudHJhbnNmb3JtUGF0dGVybik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVnZXhDYWNoZS5zZXQocnVsZS50cmFuc2Zvcm1QYXR0ZXJuLCByZWdleCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtYXRjaCA9IHJlZ2V4LmV4ZWModmFsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBleHRyYWN0ZWQgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbWF0Y2gubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXh0cmFjdGVkICs9IG1hdGNoW2ldIHx8IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IGV4dHJhY3RlZDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbG9nRGVidWcoXCJJbnZhbGlkIHJlZ2V4IGluIHRyYW5zZm9ybVwiLCB7IHBhdHRlcm46IHJ1bGUudHJhbnNmb3JtUGF0dGVybiwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgcGFydHMucHVzaCh2YWwpO1xuICAgICAgICAgICAgICAgICAgICBpZiAocnVsZS53aW5kb3dNb2RlKSBtb2Rlcy5wdXNoKHJ1bGUud2luZG93TW9kZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGFwcGx5aW5nIGdyb3VwaW5nIHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICByZXR1cm4geyBrZXk6IHBhcnRzLmpvaW4oXCIgLSBcIiksIG1vZGU6IHJlc29sdmVXaW5kb3dNb2RlKG1vZGVzKSB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4geyBrZXk6IGN1c3RvbS5mYWxsYmFjayB8fCBcIk1pc2NcIiwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH0gZWxzZSBpZiAoY3VzdG9tLnJ1bGVzKSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gZXZhbHVhdGVMZWdhY3lSdWxlcyhhc0FycmF5PFN0cmF0ZWd5UnVsZT4oY3VzdG9tLnJ1bGVzKSwgdGFiKTtcbiAgICAgICAgICBpZiAocmVzdWx0KSByZXR1cm4geyBrZXk6IHJlc3VsdCwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHsga2V5OiBjdXN0b20uZmFsbGJhY2sgfHwgXCJNaXNjXCIsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gIH1cblxuICAvLyBCdWlsdC1pbiBzdHJhdGVnaWVzXG4gIGxldCBzaW1wbGVLZXk6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcImRvbWFpblwiOlxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgc2ltcGxlS2V5ID0gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgc2ltcGxlS2V5ID0gc2VtYW50aWNCdWNrZXQodGFiLnRpdGxlLCB0YWIudXJsKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJsaW5lYWdlXCI6XG4gICAgICBzaW1wbGVLZXkgPSBuYXZpZ2F0aW9uS2V5KHRhYik7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLmNvbnRleHQgfHwgXCJVbmNhdGVnb3JpemVkXCI7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIucGlubmVkID8gXCJwaW5uZWRcIiA6IFwidW5waW5uZWRcIjtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJhZ2VcIjpcbiAgICAgIHNpbXBsZUtleSA9IGdldFJlY2VuY3lMYWJlbCh0YWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInVybFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnVybDtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ0aXRsZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnRpdGxlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInJlY2VuY3lcIjpcbiAgICAgIHNpbXBsZUtleSA9IFN0cmluZyh0YWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gXCJjaGlsZFwiIDogXCJyb290XCI7XG4gICAgICBicmVhaztcbiAgICBkZWZhdWx0OlxuICAgICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKHRhYiwgc3RyYXRlZ3kpO1xuICAgICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsKSB7XG4gICAgICAgICAgICBzaW1wbGVLZXkgPSBTdHJpbmcodmFsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNpbXBsZUtleSA9IFwiVW5rbm93blwiO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICB9XG4gIHJldHVybiB7IGtleTogc2ltcGxlS2V5LCBtb2RlOiBcImN1cnJlbnRcIiB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGdyb3VwaW5nS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEsIHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gICAgcmV0dXJuIGdldEdyb3VwaW5nUmVzdWx0KHRhYiwgc3RyYXRlZ3kpLmtleTtcbn07XG5cbmZ1bmN0aW9uIGlzQ29udGV4dEZpZWxkKGZpZWxkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gZmllbGQgPT09ICdjb250ZXh0JyB8fCBmaWVsZCA9PT0gJ2dlbnJlJyB8fCBmaWVsZCA9PT0gJ3NpdGVOYW1lJyB8fCBmaWVsZC5zdGFydHNXaXRoKCdjb250ZXh0RGF0YS4nKTtcbn1cblxuZXhwb3J0IGNvbnN0IHJlcXVpcmVzQ29udGV4dEFuYWx5c2lzID0gKHN0cmF0ZWd5SWRzOiAoc3RyaW5nIHwgU29ydGluZ1N0cmF0ZWd5KVtdKTogYm9vbGVhbiA9PiB7XG4gICAgLy8gQ2hlY2sgaWYgXCJjb250ZXh0XCIgc3RyYXRlZ3kgaXMgZXhwbGljaXRseSByZXF1ZXN0ZWRcbiAgICBpZiAoc3RyYXRlZ3lJZHMuaW5jbHVkZXMoXCJjb250ZXh0XCIpKSByZXR1cm4gdHJ1ZTtcblxuICAgIGNvbnN0IHN0cmF0ZWdpZXMgPSBnZXRTdHJhdGVnaWVzKGN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgIC8vIGZpbHRlciBvbmx5IHRob3NlIHRoYXQgbWF0Y2ggdGhlIHJlcXVlc3RlZCBJRHNcbiAgICBjb25zdCBhY3RpdmVEZWZzID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiBzdHJhdGVneUlkcy5pbmNsdWRlcyhzLmlkKSk7XG5cbiAgICBmb3IgKGNvbnN0IGRlZiBvZiBhY3RpdmVEZWZzKSB7XG4gICAgICAgIC8vIElmIGl0J3MgYSBidWlsdC1pbiBzdHJhdGVneSB0aGF0IG5lZWRzIGNvbnRleHQgKG9ubHkgJ2NvbnRleHQnIGRvZXMpXG4gICAgICAgIGlmIChkZWYuaWQgPT09ICdjb250ZXh0JykgcmV0dXJuIHRydWU7XG5cbiAgICAgICAgLy8gSWYgaXQgaXMgYSBjdXN0b20gc3RyYXRlZ3kgKG9yIG92ZXJyaWRlcyBidWlsdC1pbiksIGNoZWNrIGl0cyBydWxlc1xuICAgICAgICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQoYyA9PiBjLmlkID09PSBkZWYuaWQpO1xuICAgICAgICBpZiAoY3VzdG9tKSB7XG4gICAgICAgICAgICAgY29uc3QgZ3JvdXBSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IHNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uc29ydGluZ1J1bGVzKTtcbiAgICAgICAgICAgICBjb25zdCBncm91cFNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uZ3JvdXBTb3J0aW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IGZpbHRlcnNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihjdXN0b20uZmlsdGVycyk7XG4gICAgICAgICAgICAgY29uc3QgZmlsdGVyR3JvdXBzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbltdPihjdXN0b20uZmlsdGVyR3JvdXBzKTtcblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBydWxlLnNvdXJjZSA9PT0gJ2ZpZWxkJyAmJiBpc0NvbnRleHRGaWVsZChydWxlLnZhbHVlKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIHJ1bGUuY29sb3IgPT09ICdmaWVsZCcgJiYgcnVsZS5jb2xvckZpZWxkICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuY29sb3JGaWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBzb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBTb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZmlsdGVyc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZmlsdGVyR3JvdXBzTGlzdCkge1xuICAgICAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihncm91cCk7XG4gICAgICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFJ1bGVzKSB7XG4gICAgICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufTtcbiIsICJpbXBvcnQgeyBTb3J0aW5nU3RyYXRlZ3ksIFRhYk1ldGFkYXRhLCBDdXN0b21TdHJhdGVneSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBkb21haW5Gcm9tVXJsLCBzZW1hbnRpY0J1Y2tldCwgbmF2aWdhdGlvbktleSwgZ3JvdXBpbmdLZXksIGdldEZpZWxkVmFsdWUsIGdldEN1c3RvbVN0cmF0ZWdpZXMgfSBmcm9tIFwiLi9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCByZWNlbmN5U2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gdGFiLmxhc3RBY2Nlc3NlZCA/PyAwO1xuZXhwb3J0IGNvbnN0IGhpZXJhcmNoeVNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+ICh0YWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IDEgOiAwKTtcbmV4cG9ydCBjb25zdCBwaW5uZWRTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiAodGFiLnBpbm5lZCA/IDAgOiAxKTtcblxuZXhwb3J0IGNvbnN0IHNvcnRUYWJzID0gKHRhYnM6IFRhYk1ldGFkYXRhW10sIHN0cmF0ZWdpZXM6IFNvcnRpbmdTdHJhdGVneVtdKTogVGFiTWV0YWRhdGFbXSA9PiB7XG4gIGNvbnN0IHNjb3Jpbmc6IFNvcnRpbmdTdHJhdGVneVtdID0gc3RyYXRlZ2llcy5sZW5ndGggPyBzdHJhdGVnaWVzIDogW1wicGlubmVkXCIsIFwicmVjZW5jeVwiXTtcbiAgcmV0dXJuIFsuLi50YWJzXS5zb3J0KChhLCBiKSA9PiB7XG4gICAgZm9yIChjb25zdCBzdHJhdGVneSBvZiBzY29yaW5nKSB7XG4gICAgICBjb25zdCBkaWZmID0gY29tcGFyZUJ5KHN0cmF0ZWd5LCBhLCBiKTtcbiAgICAgIGlmIChkaWZmICE9PSAwKSByZXR1cm4gZGlmZjtcbiAgICB9XG4gICAgcmV0dXJuIGEuaWQgLSBiLmlkO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBjb21wYXJlQnkgPSAoc3RyYXRlZ3k6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZywgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyID0+IHtcbiAgLy8gMS4gQ2hlY2sgQ3VzdG9tIFN0cmF0ZWdpZXMgZm9yIFNvcnRpbmcgUnVsZXNcbiAgY29uc3QgY3VzdG9tU3RyYXRzID0gZ2V0Q3VzdG9tU3RyYXRlZ2llcygpO1xuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdHMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5zb3J0aW5nUnVsZXMpO1xuICAgICAgaWYgKHNvcnRSdWxlc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIEV2YWx1YXRlIGN1c3RvbSBzb3J0aW5nIHJ1bGVzIGluIG9yZGVyXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBydWxlLmZpZWxkKTtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbEIgPSBnZXRGaWVsZFZhbHVlKGIsIHJ1bGUuZmllbGQpO1xuXG4gICAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gMDtcbiAgICAgICAgICAgICAgICAgIGlmICh2YWxBIDwgdmFsQikgcmVzdWx0ID0gLTE7XG4gICAgICAgICAgICAgICAgICBlbHNlIGlmICh2YWxBID4gdmFsQikgcmVzdWx0ID0gMTtcblxuICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBydWxlLm9yZGVyID09PSAnZGVzYycgPyAtcmVzdWx0IDogcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgY3VzdG9tIHNvcnRpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBJZiBhbGwgcnVsZXMgZXF1YWwsIGNvbnRpbnVlIHRvIG5leHQgc3RyYXRlZ3kgKHJldHVybiAwKVxuICAgICAgICAgIHJldHVybiAwO1xuICAgICAgfVxuICB9XG5cbiAgLy8gMi4gQnVpbHQtaW4gb3IgZmFsbGJhY2tcbiAgc3dpdGNoIChzdHJhdGVneSkge1xuICAgIGNhc2UgXCJyZWNlbmN5XCI6XG4gICAgICByZXR1cm4gKGIubGFzdEFjY2Vzc2VkID8/IDApIC0gKGEubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6IC8vIEZvcm1lcmx5IGhpZXJhcmNoeVxuICAgICAgcmV0dXJuIGhpZXJhcmNoeVNjb3JlKGEpIC0gaGllcmFyY2h5U2NvcmUoYik7XG4gICAgY2FzZSBcInBpbm5lZFwiOlxuICAgICAgcmV0dXJuIHBpbm5lZFNjb3JlKGEpIC0gcGlubmVkU2NvcmUoYik7XG4gICAgY2FzZSBcInRpdGxlXCI6XG4gICAgICByZXR1cm4gYS50aXRsZS5sb2NhbGVDb21wYXJlKGIudGl0bGUpO1xuICAgIGNhc2UgXCJ1cmxcIjpcbiAgICAgIHJldHVybiBhLnVybC5sb2NhbGVDb21wYXJlKGIudXJsKTtcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgcmV0dXJuIChhLmNvbnRleHQgPz8gXCJcIikubG9jYWxlQ29tcGFyZShiLmNvbnRleHQgPz8gXCJcIik7XG4gICAgY2FzZSBcImRvbWFpblwiOlxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgcmV0dXJuIGRvbWFpbkZyb21VcmwoYS51cmwpLmxvY2FsZUNvbXBhcmUoZG9tYWluRnJvbVVybChiLnVybCkpO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgcmV0dXJuIHNlbWFudGljQnVja2V0KGEudGl0bGUsIGEudXJsKS5sb2NhbGVDb21wYXJlKHNlbWFudGljQnVja2V0KGIudGl0bGUsIGIudXJsKSk7XG4gICAgY2FzZSBcImxpbmVhZ2VcIjpcbiAgICAgIHJldHVybiBuYXZpZ2F0aW9uS2V5KGEpLmxvY2FsZUNvbXBhcmUobmF2aWdhdGlvbktleShiKSk7XG4gICAgY2FzZSBcImFnZVwiOlxuICAgICAgLy8gUmV2ZXJzZSBhbHBoYWJldGljYWwgZm9yIGFnZSBidWNrZXRzIChUb2RheSA8IFllc3RlcmRheSksIHJvdWdoIGFwcHJveFxuICAgICAgcmV0dXJuIChncm91cGluZ0tleShhLCBcImFnZVwiKSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIFwiYWdlXCIpIHx8IFwiXCIpO1xuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBDaGVjayBpZiBpdCdzIGEgZ2VuZXJpYyBmaWVsZCBmaXJzdFxuICAgICAgY29uc3QgdmFsQSA9IGdldEZpZWxkVmFsdWUoYSwgc3RyYXRlZ3kpO1xuICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgc3RyYXRlZ3kpO1xuXG4gICAgICBpZiAodmFsQSAhPT0gdW5kZWZpbmVkICYmIHZhbEIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGlmICh2YWxBIDwgdmFsQikgcmV0dXJuIC0xO1xuICAgICAgICAgIGlmICh2YWxBID4gdmFsQikgcmV0dXJuIDE7XG4gICAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9XG5cbiAgICAgIC8vIEZhbGxiYWNrIGZvciBjdXN0b20gc3RyYXRlZ2llcyBncm91cGluZyBrZXkgKGlmIHVzaW5nIGN1c3RvbSBzdHJhdGVneSBhcyBzb3J0aW5nIGJ1dCBubyBzb3J0aW5nIHJ1bGVzIGRlZmluZWQpXG4gICAgICAvLyBvciB1bmhhbmRsZWQgYnVpbHQtaW5zXG4gICAgICByZXR1cm4gKGdyb3VwaW5nS2V5KGEsIHN0cmF0ZWd5KSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIHN0cmF0ZWd5KSB8fCBcIlwiKTtcbiAgfVxufTtcbiIsICJpbXBvcnQgeyBhbmFseXplVGFiQ29udGV4dCwgQ29udGV4dFJlc3VsdCB9IGZyb20gXCIuLi9iYWNrZ3JvdW5kL2NvbnRleHRBbmFseXNpcy5qc1wiO1xuaW1wb3J0IHtcbiAgZ3JvdXBUYWJzLFxuICBkb21haW5Gcm9tVXJsLFxuICBzZW1hbnRpY0J1Y2tldCxcbiAgbmF2aWdhdGlvbktleSxcbiAgZ3JvdXBpbmdLZXlcbn0gZnJvbSBcIi4uL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBHRU5FUkFfUkVHSVNUUlkgfSBmcm9tIFwiLi4vYmFja2dyb3VuZC9leHRyYWN0aW9uL2dlbmVyYVJlZ2lzdHJ5LmpzXCI7XG5pbXBvcnQge1xuICBzb3J0VGFicyxcbiAgcmVjZW5jeVNjb3JlLFxuICBoaWVyYXJjaHlTY29yZSxcbiAgcGlubmVkU2NvcmUsXG4gIGNvbXBhcmVCeVxufSBmcm9tIFwiLi4vYmFja2dyb3VuZC9zb3J0aW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgbWFwQ2hyb21lVGFiIH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuaW1wb3J0IHsgc2V0Q3VzdG9tU3RyYXRlZ2llcyB9IGZyb20gXCIuLi9iYWNrZ3JvdW5kL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgR3JvdXBpbmdTdHJhdGVneSwgUHJlZmVyZW5jZXMsIFNvcnRpbmdTdHJhdGVneSwgVGFiTWV0YWRhdGEsIFRhYkdyb3VwLCBDdXN0b21TdHJhdGVneSwgU3RyYXRlZ3lSdWxlLCBSdWxlQ29uZGl0aW9uLCBHcm91cGluZ1J1bGUsIFNvcnRpbmdSdWxlLCBMb2dFbnRyeSwgTG9nTGV2ZWwgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBTVFJBVEVHSUVTLCBTdHJhdGVneURlZmluaXRpb24sIGdldFN0cmF0ZWdpZXMgfSBmcm9tIFwiLi4vc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkuanNcIjtcbmltcG9ydCB7IGxvZ0luZm8gfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuXG4vLyBUeXBlc1xuaW50ZXJmYWNlIENvbHVtbkRlZmluaXRpb24ge1xuICAgIGtleTogc3RyaW5nO1xuICAgIGxhYmVsOiBzdHJpbmc7XG4gICAgdmlzaWJsZTogYm9vbGVhbjtcbiAgICB3aWR0aDogc3RyaW5nOyAvLyBDU1Mgd2lkdGhcbiAgICBmaWx0ZXJhYmxlOiBib29sZWFuO1xufVxuXG4vLyBTdGF0ZVxubGV0IGN1cnJlbnRUYWJzOiBjaHJvbWUudGFicy5UYWJbXSA9IFtdO1xubGV0IGxvY2FsQ3VzdG9tU3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSA9IFtdO1xubGV0IGN1cnJlbnRDb250ZXh0TWFwID0gbmV3IE1hcDxudW1iZXIsIENvbnRleHRSZXN1bHQ+KCk7XG5sZXQgdGFiVGl0bGVzID0gbmV3IE1hcDxudW1iZXIsIHN0cmluZz4oKTtcbmxldCBzb3J0S2V5OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbmxldCBzb3J0RGlyZWN0aW9uOiAnYXNjJyB8ICdkZXNjJyA9ICdhc2MnO1xubGV0IHNpbXVsYXRlZFNlbGVjdGlvbiA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXG4vLyBNb2Rlcm4gVGFibGUgU3RhdGVcbmxldCBnbG9iYWxTZWFyY2hRdWVyeSA9ICcnO1xubGV0IGNvbHVtbkZpbHRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbmxldCBjb2x1bW5zOiBDb2x1bW5EZWZpbml0aW9uW10gPSBbXG4gICAgeyBrZXk6ICdpZCcsIGxhYmVsOiAnSUQnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzYwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICdpbmRleCcsIGxhYmVsOiAnSW5kZXgnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzYwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICd3aW5kb3dJZCcsIGxhYmVsOiAnV2luZG93JywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICc3MHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnZ3JvdXBJZCcsIGxhYmVsOiAnR3JvdXAnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzcwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICd0aXRsZScsIGxhYmVsOiAnVGl0bGUnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzIwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAndXJsJywgbGFiZWw6ICdVUkwnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzI1MHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnZ2VucmUnLCBsYWJlbDogJ0dlbnJlJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ2NvbnRleHQnLCBsYWJlbDogJ0NhdGVnb3J5JywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ3NpdGVOYW1lJywgbGFiZWw6ICdTaXRlIE5hbWUnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEyMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAncGxhdGZvcm0nLCBsYWJlbDogJ1BsYXRmb3JtJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ29iamVjdFR5cGUnLCBsYWJlbDogJ09iamVjdCBUeXBlJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ2V4dHJhY3RlZFRpdGxlJywgbGFiZWw6ICdFeHRyYWN0ZWQgVGl0bGUnLCB2aXNpYmxlOiBmYWxzZSwgd2lkdGg6ICcyMDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ2F1dGhvck9yQ3JlYXRvcicsIGxhYmVsOiAnQXV0aG9yJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMjBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ3B1Ymxpc2hlZEF0JywgbGFiZWw6ICdQdWJsaXNoZWQnLCB2aXNpYmxlOiBmYWxzZSwgd2lkdGg6ICcxMDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ3N0YXR1cycsIGxhYmVsOiAnU3RhdHVzJywgdmlzaWJsZTogZmFsc2UsIHdpZHRoOiAnODBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ2FjdGl2ZScsIGxhYmVsOiAnQWN0aXZlJywgdmlzaWJsZTogZmFsc2UsIHdpZHRoOiAnNjBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ3Bpbm5lZCcsIGxhYmVsOiAnUGlubmVkJywgdmlzaWJsZTogZmFsc2UsIHdpZHRoOiAnNjBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ29wZW5lclRhYklkJywgbGFiZWw6ICdPcGVuZXInLCB2aXNpYmxlOiBmYWxzZSwgd2lkdGg6ICc3MHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAncGFyZW50VGl0bGUnLCBsYWJlbDogJ1BhcmVudCBUaXRsZScsIHZpc2libGU6IGZhbHNlLCB3aWR0aDogJzE1MHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnZ2VucmUnLCBsYWJlbDogJ0dlbnJlJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ2NvbnRleHQnLCBsYWJlbDogJ0V4dHJhY3RlZCBDb250ZXh0JywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICc0MDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ2xhc3RBY2Nlc3NlZCcsIGxhYmVsOiAnTGFzdCBBY2Nlc3NlZCcsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnMTUwcHgnLCBmaWx0ZXJhYmxlOiBmYWxzZSB9LFxuICAgIHsga2V5OiAnYWN0aW9ucycsIGxhYmVsOiAnQWN0aW9ucycsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnMTIwcHgnLCBmaWx0ZXJhYmxlOiBmYWxzZSB9XG5dO1xuXG5cbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHJlZnJlc2hCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncmVmcmVzaEJ0bicpO1xuICBpZiAocmVmcmVzaEJ0bikge1xuICAgIHJlZnJlc2hCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBsb2FkVGFicyk7XG4gIH1cblxuICAvLyBUYWIgU3dpdGNoaW5nIExvZ2ljXG4gIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy50YWItYnRuJykuZm9yRWFjaChidG4gPT4ge1xuICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgIC8vIFJlbW92ZSBhY3RpdmUgY2xhc3MgZnJvbSBhbGwgYnV0dG9ucyBhbmQgc2VjdGlvbnNcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy50YWItYnRuJykuZm9yRWFjaChiID0+IGIuY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJykpO1xuICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnZpZXctc2VjdGlvbicpLmZvckVhY2gocyA9PiBzLmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpKTtcblxuICAgICAgLy8gQWRkIGFjdGl2ZSBjbGFzcyB0byBjbGlja2VkIGJ1dHRvblxuICAgICAgYnRuLmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xuXG4gICAgICAvLyBTaG93IHRhcmdldCBzZWN0aW9uXG4gICAgICBjb25zdCB0YXJnZXRJZCA9IChidG4gYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQudGFyZ2V0O1xuICAgICAgaWYgKHRhcmdldElkKSB7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKHRhcmdldElkKT8uY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG4gICAgICAgIGxvZ0luZm8oXCJTd2l0Y2hlZCB2aWV3XCIsIHsgdGFyZ2V0SWQgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIElmIHN3aXRjaGluZyB0byBhbGdvcml0aG1zLCBwb3B1bGF0ZSByZWZlcmVuY2UgaWYgZW1wdHlcbiAgICAgIGlmICh0YXJnZXRJZCA9PT0gJ3ZpZXctYWxnb3JpdGhtcycpIHtcbiAgICAgICAgIHJlbmRlckFsZ29yaXRobXNWaWV3KCk7XG4gICAgICB9IGVsc2UgaWYgKHRhcmdldElkID09PSAndmlldy1zdHJhdGVneS1saXN0Jykge1xuICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMaXN0VGFibGUoKTtcbiAgICAgIH0gZWxzZSBpZiAodGFyZ2V0SWQgPT09ICd2aWV3LWxvZ3MnKSB7XG4gICAgICAgICBsb2FkTG9ncygpO1xuICAgICAgICAgbG9hZEdsb2JhbExvZ0xldmVsKCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pO1xuXG4gIC8vIExvZyBWaWV3ZXIgTG9naWNcbiAgY29uc3QgcmVmcmVzaExvZ3NCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncmVmcmVzaC1sb2dzLWJ0bicpO1xuICBpZiAocmVmcmVzaExvZ3NCdG4pIHJlZnJlc2hMb2dzQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgbG9hZExvZ3MpO1xuXG4gIGNvbnN0IGNsZWFyTG9nc0J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjbGVhci1sb2dzLWJ0bicpO1xuICBpZiAoY2xlYXJMb2dzQnRuKSBjbGVhckxvZ3NCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjbGVhclJlbW90ZUxvZ3MpO1xuXG4gIGNvbnN0IGxvZ0xldmVsRmlsdGVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvZy1sZXZlbC1maWx0ZXInKTtcbiAgaWYgKGxvZ0xldmVsRmlsdGVyKSBsb2dMZXZlbEZpbHRlci5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCByZW5kZXJMb2dzKTtcblxuICBjb25zdCBsb2dTZWFyY2ggPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9nLXNlYXJjaCcpO1xuICBpZiAobG9nU2VhcmNoKSBsb2dTZWFyY2guYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCByZW5kZXJMb2dzKTtcblxuICBjb25zdCBnbG9iYWxMb2dMZXZlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnbG9iYWwtbG9nLWxldmVsJyk7XG4gIGlmIChnbG9iYWxMb2dMZXZlbCkgZ2xvYmFsTG9nTGV2ZWwuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgdXBkYXRlR2xvYmFsTG9nTGV2ZWwpO1xuXG4gIC8vIFNpbXVsYXRpb24gTG9naWNcbiAgY29uc3QgcnVuU2ltQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3J1blNpbUJ0bicpO1xuICBpZiAocnVuU2ltQnRuKSB7XG4gICAgcnVuU2ltQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgcnVuU2ltdWxhdGlvbik7XG4gIH1cblxuICBjb25zdCBhcHBseUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhcHBseUJ0bicpO1xuICBpZiAoYXBwbHlCdG4pIHtcbiAgICBhcHBseUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGFwcGx5VG9Ccm93c2VyKTtcbiAgfVxuXG4gIC8vIE1vZGVybiBUYWJsZSBDb250cm9sc1xuICBjb25zdCBnbG9iYWxTZWFyY2hJbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnbG9iYWxTZWFyY2gnKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICBpZiAoZ2xvYmFsU2VhcmNoSW5wdXQpIHtcbiAgICAgIGdsb2JhbFNlYXJjaElucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgKGUpID0+IHtcbiAgICAgICAgICBnbG9iYWxTZWFyY2hRdWVyeSA9IChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICByZW5kZXJUYWJsZSgpO1xuICAgICAgfSk7XG4gIH1cblxuICBjb25zdCBjb2x1bW5zQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvbHVtbnNCdG4nKTtcbiAgaWYgKGNvbHVtbnNCdG4pIHtcbiAgICAgIGNvbHVtbnNCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgY29uc3QgbWVudSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjb2x1bW5zTWVudScpO1xuICAgICAgICAgIG1lbnU/LmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicpO1xuICAgICAgICAgIHJlbmRlckNvbHVtbnNNZW51KCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IHJlc2V0Vmlld0J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZXNldFZpZXdCdG4nKTtcbiAgaWYgKHJlc2V0Vmlld0J0bikge1xuICAgICAgcmVzZXRWaWV3QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgIC8vIFJlc2V0IGNvbHVtbnMgdG8gZGVmYXVsdHMgKHNpbXBsaWZpZWQsIGp1c3Qgc2hvdyBhbGwgcmVhc29uYWJsZSBvbmVzKVxuICAgICAgICAgICAgY29sdW1ucy5mb3JFYWNoKGMgPT4gYy52aXNpYmxlID0gWydpZCcsICd0aXRsZScsICd1cmwnLCAnd2luZG93SWQnLCAnZ3JvdXBJZCcsICdnZW5yZScsICdjb250ZXh0JywgJ3NpdGVOYW1lJywgJ3BsYXRmb3JtJywgJ29iamVjdFR5cGUnLCAnYXV0aG9yT3JDcmVhdG9yJywgJ2FjdGlvbnMnXS5pbmNsdWRlcyhjLmtleSkpO1xuICAgICAgICAgIGdsb2JhbFNlYXJjaFF1ZXJ5ID0gJyc7XG4gICAgICAgICAgaWYgKGdsb2JhbFNlYXJjaElucHV0KSBnbG9iYWxTZWFyY2hJbnB1dC52YWx1ZSA9ICcnO1xuICAgICAgICAgIGNvbHVtbkZpbHRlcnMgPSB7fTtcbiAgICAgICAgICByZW5kZXJUYWJsZUhlYWRlcigpO1xuICAgICAgICAgIHJlbmRlclRhYmxlKCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIEhpZGUgY29sdW1uIG1lbnUgd2hlbiBjbGlja2luZyBvdXRzaWRlXG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgaWYgKCF0YXJnZXQuY2xvc2VzdCgnLmNvbHVtbnMtbWVudS1jb250YWluZXInKSkge1xuICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjb2x1bW5zTWVudScpPy5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcbiAgICAgIH1cbiAgfSk7XG5cblxuICAvLyBMaXN0ZW4gZm9yIHRhYiB1cGRhdGVzIHRvIHJlZnJlc2ggZGF0YSAoU1BBIHN1cHBvcnQpXG4gIGNocm9tZS50YWJzLm9uVXBkYXRlZC5hZGRMaXN0ZW5lcigodGFiSWQsIGNoYW5nZUluZm8sIHRhYikgPT4ge1xuICAgIC8vIFdlIHVwZGF0ZSBpZiBVUkwgY2hhbmdlcyBvciBzdGF0dXMgY2hhbmdlcyB0byBjb21wbGV0ZVxuICAgIGlmIChjaGFuZ2VJbmZvLnVybCB8fCBjaGFuZ2VJbmZvLnN0YXR1cyA9PT0gJ2NvbXBsZXRlJykge1xuICAgICAgICBsb2FkVGFicygpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gTGlzdGVuIGZvciB0YWIgcmVtb3ZhbHMgdG8gcmVmcmVzaCBkYXRhXG4gIGNocm9tZS50YWJzLm9uUmVtb3ZlZC5hZGRMaXN0ZW5lcigoKSA9PiB7XG4gICAgbG9hZFRhYnMoKTtcbiAgfSk7XG5cbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZXZlbnQpID0+IHtcbiAgICBjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgIGlmICghdGFyZ2V0KSByZXR1cm47XG5cbiAgICBpZiAodGFyZ2V0Lm1hdGNoZXMoJy5jb250ZXh0LWpzb24tYnRuJykpIHtcbiAgICAgIGNvbnN0IHRhYklkID0gTnVtYmVyKHRhcmdldC5kYXRhc2V0LnRhYklkKTtcbiAgICAgIGlmICghdGFiSWQpIHJldHVybjtcbiAgICAgIGNvbnN0IGRhdGEgPSBjdXJyZW50Q29udGV4dE1hcC5nZXQodGFiSWQpPy5kYXRhO1xuICAgICAgaWYgKCFkYXRhKSByZXR1cm47XG4gICAgICBjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkoZGF0YSwgbnVsbCwgMik7XG4gICAgICBjb25zdCBodG1sQ29udGVudCA9IGBcbiAgICAgICAgPCFET0NUWVBFIGh0bWw+XG4gICAgICAgIDxodG1sPlxuICAgICAgICA8aGVhZD5cbiAgICAgICAgICA8dGl0bGU+SlNPTiBWaWV3PC90aXRsZT5cbiAgICAgICAgICA8c3R5bGU+XG4gICAgICAgICAgICBib2R5IHsgZm9udC1mYW1pbHk6IG1vbm9zcGFjZTsgYmFja2dyb3VuZC1jb2xvcjogI2YwZjBmMDsgcGFkZGluZzogMjBweDsgfVxuICAgICAgICAgICAgcHJlIHsgYmFja2dyb3VuZC1jb2xvcjogd2hpdGU7IHBhZGRpbmc6IDE1cHg7IGJvcmRlci1yYWRpdXM6IDVweDsgYm9yZGVyOiAxcHggc29saWQgI2NjYzsgb3ZlcmZsb3c6IGF1dG87IH1cbiAgICAgICAgICA8L3N0eWxlPlxuICAgICAgICA8L2hlYWQ+XG4gICAgICAgIDxib2R5PlxuICAgICAgICAgIDxoMz5KU09OIERhdGE8L2gzPlxuICAgICAgICAgIDxwcmU+JHtlc2NhcGVIdG1sKGpzb24pfTwvcHJlPlxuICAgICAgICA8L2JvZHk+XG4gICAgICAgIDwvaHRtbD5cbiAgICAgIGA7XG4gICAgICBjb25zdCBibG9iID0gbmV3IEJsb2IoW2h0bWxDb250ZW50XSwgeyB0eXBlOiAndGV4dC9odG1sJyB9KTtcbiAgICAgIGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICB3aW5kb3cub3Blbih1cmwsICdfYmxhbmsnLCAnbm9vcGVuZXIsbm9yZWZlcnJlcicpO1xuICAgIH0gZWxzZSBpZiAodGFyZ2V0Lm1hdGNoZXMoJy5nb3RvLXRhYi1idG4nKSkge1xuICAgICAgY29uc3QgdGFiSWQgPSBOdW1iZXIodGFyZ2V0LmRhdGFzZXQudGFiSWQpO1xuICAgICAgY29uc3Qgd2luZG93SWQgPSBOdW1iZXIodGFyZ2V0LmRhdGFzZXQud2luZG93SWQpO1xuICAgICAgaWYgKHRhYklkICYmIHdpbmRvd0lkKSB7XG4gICAgICAgIGNocm9tZS50YWJzLnVwZGF0ZSh0YWJJZCwgeyBhY3RpdmU6IHRydWUgfSk7XG4gICAgICAgIGNocm9tZS53aW5kb3dzLnVwZGF0ZSh3aW5kb3dJZCwgeyBmb2N1c2VkOiB0cnVlIH0pO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodGFyZ2V0Lm1hdGNoZXMoJy5jbG9zZS10YWItYnRuJykpIHtcbiAgICAgIGNvbnN0IHRhYklkID0gTnVtYmVyKHRhcmdldC5kYXRhc2V0LnRhYklkKTtcbiAgICAgIGlmICh0YWJJZCkge1xuICAgICAgICBjaHJvbWUudGFicy5yZW1vdmUodGFiSWQpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodGFyZ2V0Lm1hdGNoZXMoJy5zdHJhdGVneS12aWV3LWJ0bicpKSB7XG4gICAgICAgIGNvbnN0IHR5cGUgPSB0YXJnZXQuZGF0YXNldC50eXBlO1xuICAgICAgICBjb25zdCBuYW1lID0gdGFyZ2V0LmRhdGFzZXQubmFtZTtcbiAgICAgICAgaWYgKHR5cGUgJiYgbmFtZSkge1xuICAgICAgICAgICAgc2hvd1N0cmF0ZWd5RGV0YWlscyh0eXBlLCBuYW1lKTtcbiAgICAgICAgfVxuICAgIH1cbiAgfSk7XG5cbiAgLy8gSW5pdCB0YWJsZSBoZWFkZXJcbiAgcmVuZGVyVGFibGVIZWFkZXIoKTtcblxuICBsb2FkVGFicygpO1xuICAvLyBQcmUtcmVuZGVyIHN0YXRpYyBjb250ZW50XG4gIGF3YWl0IGxvYWRQcmVmZXJlbmNlc0FuZEluaXQoKTsgLy8gTG9hZCBwcmVmZXJlbmNlcyBmaXJzdCB0byBpbml0IHN0cmF0ZWdpZXNcbiAgcmVuZGVyQWxnb3JpdGhtc1ZpZXcoKTtcbiAgbG9hZEN1c3RvbUdlbmVyYSgpO1xuICBpbml0U3RyYXRlZ3lCdWlsZGVyKCk7XG5cbiAgY29uc3QgZXhwb3J0QWxsQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0ZWd5LWxpc3QtZXhwb3J0LWJ0bicpO1xuICBjb25zdCBpbXBvcnRBbGxCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXRlZ3ktbGlzdC1pbXBvcnQtYnRuJyk7XG4gIGlmIChleHBvcnRBbGxCdG4pIGV4cG9ydEFsbEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGV4cG9ydEFsbFN0cmF0ZWdpZXMpO1xuICBpZiAoaW1wb3J0QWxsQnRuKSBpbXBvcnRBbGxCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBpbXBvcnRBbGxTdHJhdGVnaWVzKTtcbn0pO1xuXG4vLyBDb2x1bW4gTWFuYWdlbWVudFxuXG5mdW5jdGlvbiByZW5kZXJDb2x1bW5zTWVudSgpIHtcbiAgICBjb25zdCBtZW51ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvbHVtbnNNZW51Jyk7XG4gICAgaWYgKCFtZW51KSByZXR1cm47XG5cbiAgICBtZW51LmlubmVySFRNTCA9IGNvbHVtbnMubWFwKGNvbCA9PiBgXG4gICAgICAgIDxsYWJlbCBjbGFzcz1cImNvbHVtbi10b2dnbGVcIj5cbiAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBkYXRhLWtleT1cIiR7Y29sLmtleX1cIiAke2NvbC52aXNpYmxlID8gJ2NoZWNrZWQnIDogJyd9PlxuICAgICAgICAgICAgJHtlc2NhcGVIdG1sKGNvbC5sYWJlbCl9XG4gICAgICAgIDwvbGFiZWw+XG4gICAgYCkuam9pbignJyk7XG5cbiAgICBtZW51LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0JykuZm9yRWFjaChpbnB1dCA9PiB7XG4gICAgICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkuZGF0YXNldC5rZXk7XG4gICAgICAgICAgICBjb25zdCBjaGVja2VkID0gKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQ7XG4gICAgICAgICAgICBjb25zdCBjb2wgPSBjb2x1bW5zLmZpbmQoYyA9PiBjLmtleSA9PT0ga2V5KTtcbiAgICAgICAgICAgIGlmIChjb2wpIHtcbiAgICAgICAgICAgICAgICBjb2wudmlzaWJsZSA9IGNoZWNrZWQ7XG4gICAgICAgICAgICAgICAgcmVuZGVyVGFibGVIZWFkZXIoKTsgLy8gUmUtcmVuZGVyIGhlYWRlciB0byBhZGQvcmVtb3ZlIGNvbHVtbnNcbiAgICAgICAgICAgICAgICByZW5kZXJUYWJsZSgpOyAvLyBSZS1yZW5kZXIgYm9keVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyVGFibGVIZWFkZXIoKSB7XG4gICAgY29uc3QgaGVhZGVyUm93ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2hlYWRlclJvdycpO1xuICAgIGNvbnN0IGZpbHRlclJvdyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmaWx0ZXJSb3cnKTtcbiAgICBpZiAoIWhlYWRlclJvdyB8fCAhZmlsdGVyUm93KSByZXR1cm47XG5cbiAgICBjb25zdCB2aXNpYmxlQ29scyA9IGNvbHVtbnMuZmlsdGVyKGMgPT4gYy52aXNpYmxlKTtcblxuICAgIC8vIFJlbmRlciBIZWFkZXJzXG4gICAgaGVhZGVyUm93LmlubmVySFRNTCA9IHZpc2libGVDb2xzLm1hcChjb2wgPT4gYFxuICAgICAgICA8dGggY2xhc3M9XCIke2NvbC5rZXkgIT09ICdhY3Rpb25zJyA/ICdzb3J0YWJsZScgOiAnJ31cIiBkYXRhLWtleT1cIiR7Y29sLmtleX1cIiBzdHlsZT1cIndpZHRoOiAke2NvbC53aWR0aH07IHBvc2l0aW9uOiByZWxhdGl2ZTtcIj5cbiAgICAgICAgICAgICR7ZXNjYXBlSHRtbChjb2wubGFiZWwpfVxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJlc2l6ZXJcIj48L2Rpdj5cbiAgICAgICAgPC90aD5cbiAgICBgKS5qb2luKCcnKTtcblxuICAgIC8vIFJlbmRlciBGaWx0ZXIgSW5wdXRzXG4gICAgZmlsdGVyUm93LmlubmVySFRNTCA9IHZpc2libGVDb2xzLm1hcChjb2wgPT4ge1xuICAgICAgICBpZiAoIWNvbC5maWx0ZXJhYmxlKSByZXR1cm4gJzx0aD48L3RoPic7XG4gICAgICAgIGNvbnN0IHZhbCA9IGNvbHVtbkZpbHRlcnNbY29sLmtleV0gfHwgJyc7XG4gICAgICAgIHJldHVybiBgXG4gICAgICAgICAgICA8dGg+XG4gICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJmaWx0ZXItaW5wdXRcIiBkYXRhLWtleT1cIiR7Y29sLmtleX1cIiB2YWx1ZT1cIiR7ZXNjYXBlSHRtbCh2YWwpfVwiIHBsYWNlaG9sZGVyPVwiRmlsdGVyLi4uXCI+XG4gICAgICAgICAgICA8L3RoPlxuICAgICAgICBgO1xuICAgIH0pLmpvaW4oJycpO1xuXG4gICAgLy8gQXR0YWNoIFNvcnQgTGlzdGVuZXJzXG4gICAgaGVhZGVyUm93LnF1ZXJ5U2VsZWN0b3JBbGwoJy5zb3J0YWJsZScpLmZvckVhY2godGggPT4ge1xuICAgICAgICB0aC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgICAgICAvLyBJZ25vcmUgaWYgY2xpY2tlZCBvbiByZXNpemVyXG4gICAgICAgICAgICBpZiAoKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbGFzc0xpc3QuY29udGFpbnMoJ3Jlc2l6ZXInKSkgcmV0dXJuO1xuXG4gICAgICAgICAgICBjb25zdCBrZXkgPSB0aC5nZXRBdHRyaWJ1dGUoJ2RhdGEta2V5Jyk7XG4gICAgICAgICAgICBpZiAoa2V5KSBoYW5kbGVTb3J0KGtleSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgLy8gQXR0YWNoIEZpbHRlciBMaXN0ZW5lcnNcbiAgICBmaWx0ZXJSb3cucXVlcnlTZWxlY3RvckFsbCgnLmZpbHRlci1pbnB1dCcpLmZvckVhY2goaW5wdXQgPT4ge1xuICAgICAgICBpbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSAoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQua2V5O1xuICAgICAgICAgICAgY29uc3QgdmFsID0gKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgaWYgKGtleSkge1xuICAgICAgICAgICAgICAgIGNvbHVtbkZpbHRlcnNba2V5XSA9IHZhbDtcbiAgICAgICAgICAgICAgICByZW5kZXJUYWJsZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIEF0dGFjaCBSZXNpemUgTGlzdGVuZXJzXG4gICAgaGVhZGVyUm93LnF1ZXJ5U2VsZWN0b3JBbGwoJy5yZXNpemVyJykuZm9yRWFjaChyZXNpemVyID0+IHtcbiAgICAgICAgaW5pdFJlc2l6ZShyZXNpemVyIGFzIEhUTUxFbGVtZW50KTtcbiAgICB9KTtcblxuICAgIHVwZGF0ZUhlYWRlclN0eWxlcygpO1xufVxuXG5mdW5jdGlvbiBpbml0UmVzaXplKHJlc2l6ZXI6IEhUTUxFbGVtZW50KSB7XG4gICAgbGV0IHggPSAwO1xuICAgIGxldCB3ID0gMDtcbiAgICBsZXQgdGg6IEhUTUxFbGVtZW50O1xuXG4gICAgY29uc3QgbW91c2VEb3duSGFuZGxlciA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgIHRoID0gcmVzaXplci5wYXJlbnRFbGVtZW50IGFzIEhUTUxFbGVtZW50O1xuICAgICAgICB4ID0gZS5jbGllbnRYO1xuICAgICAgICB3ID0gdGgub2Zmc2V0V2lkdGg7XG5cbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgbW91c2VNb3ZlSGFuZGxlcik7XG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCBtb3VzZVVwSGFuZGxlcik7XG4gICAgICAgIHJlc2l6ZXIuY2xhc3NMaXN0LmFkZCgncmVzaXppbmcnKTtcbiAgICB9O1xuXG4gICAgY29uc3QgbW91c2VNb3ZlSGFuZGxlciA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgIGNvbnN0IGR4ID0gZS5jbGllbnRYIC0geDtcbiAgICAgICAgY29uc3QgY29sS2V5ID0gdGguZ2V0QXR0cmlidXRlKCdkYXRhLWtleScpO1xuICAgICAgICBjb25zdCBjb2wgPSBjb2x1bW5zLmZpbmQoYyA9PiBjLmtleSA9PT0gY29sS2V5KTtcbiAgICAgICAgaWYgKGNvbCkge1xuICAgICAgICAgICAgY29uc3QgbmV3V2lkdGggPSBNYXRoLm1heCgzMCwgdyArIGR4KTsgLy8gTWluIHdpZHRoIDMwcHhcbiAgICAgICAgICAgIGNvbC53aWR0aCA9IGAke25ld1dpZHRofXB4YDtcbiAgICAgICAgICAgIHRoLnN0eWxlLndpZHRoID0gY29sLndpZHRoO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGNvbnN0IG1vdXNlVXBIYW5kbGVyID0gKCkgPT4ge1xuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCBtb3VzZU1vdmVIYW5kbGVyKTtcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIG1vdXNlVXBIYW5kbGVyKTtcbiAgICAgICAgcmVzaXplci5jbGFzc0xpc3QucmVtb3ZlKCdyZXNpemluZycpO1xuICAgIH07XG5cbiAgICByZXNpemVyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIG1vdXNlRG93bkhhbmRsZXIpO1xufVxuXG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRQcmVmZXJlbmNlc0FuZEluaXQoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2FkUHJlZmVyZW5jZXMnIH0pO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgICAgICAgY29uc3QgcHJlZnMgPSByZXNwb25zZS5kYXRhIGFzIFByZWZlcmVuY2VzO1xuICAgICAgICAgICAgbG9jYWxDdXN0b21TdHJhdGVnaWVzID0gcHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXTtcbiAgICAgICAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMobG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TG9hZE9wdGlvbnMoKTtcbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TGlzdFRhYmxlKCk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBwcmVmZXJlbmNlc1wiLCBlKTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRDdXN0b21HZW5lcmEoKSB7XG4gICAgY29uc3QgbGlzdENvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjdXN0b20tZ2VuZXJhLWxpc3QnKTtcbiAgICBpZiAoIWxpc3RDb250YWluZXIpIHJldHVybjtcblxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9hZFByZWZlcmVuY2VzJyB9KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgIGNvbnN0IHByZWZzID0gcmVzcG9uc2UuZGF0YSBhcyBQcmVmZXJlbmNlcztcbiAgICAgICAgICAgIHJlbmRlckN1c3RvbUdlbmVyYUxpc3QocHJlZnMuY3VzdG9tR2VuZXJhIHx8IHt9KTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIGN1c3RvbSBnZW5lcmFcIiwgZSk7XG4gICAgfVxufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tIFNUUkFURUdZIEJVSUxERVIgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBnZXRCdWlsdEluU3RyYXRlZ3lDb25maWcoaWQ6IHN0cmluZyk6IEN1c3RvbVN0cmF0ZWd5IHwgbnVsbCB7XG4gICAgY29uc3QgYmFzZTogQ3VzdG9tU3RyYXRlZ3kgPSB7XG4gICAgICAgIGlkOiBpZCxcbiAgICAgICAgbGFiZWw6IFNUUkFURUdJRVMuZmluZChzID0+IHMuaWQgPT09IGlkKT8ubGFiZWwgfHwgaWQsXG4gICAgICAgIGZpbHRlcnM6IFtdLFxuICAgICAgICBncm91cGluZ1J1bGVzOiBbXSxcbiAgICAgICAgc29ydGluZ1J1bGVzOiBbXSxcbiAgICAgICAgZ3JvdXBTb3J0aW5nUnVsZXM6IFtdLFxuICAgICAgICBmYWxsYmFjazogJ01pc2MnLFxuICAgICAgICBzb3J0R3JvdXBzOiBmYWxzZSxcbiAgICAgICAgYXV0b1J1bjogZmFsc2VcbiAgICB9O1xuXG4gICAgc3dpdGNoIChpZCkge1xuICAgICAgICBjYXNlICdkb21haW4nOlxuICAgICAgICAgICAgYmFzZS5ncm91cGluZ1J1bGVzID0gW3sgc291cmNlOiAnZmllbGQnLCB2YWx1ZTogJ2RvbWFpbicsIHRyYW5zZm9ybTogJ3N0cmlwVGxkJywgY29sb3I6ICdyYW5kb20nIH1dO1xuICAgICAgICAgICAgYmFzZS5zb3J0aW5nUnVsZXMgPSBbeyBmaWVsZDogJ2RvbWFpbicsIG9yZGVyOiAnYXNjJyB9XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdkb21haW5fZnVsbCc6XG4gICAgICAgICAgICAgYmFzZS5ncm91cGluZ1J1bGVzID0gW3sgc291cmNlOiAnZmllbGQnLCB2YWx1ZTogJ2RvbWFpbicsIHRyYW5zZm9ybTogJ25vbmUnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICAgYmFzZS5zb3J0aW5nUnVsZXMgPSBbeyBmaWVsZDogJ2RvbWFpbicsIG9yZGVyOiAnYXNjJyB9XTtcbiAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndG9waWMnOlxuICAgICAgICAgICAgYmFzZS5ncm91cGluZ1J1bGVzID0gW3sgc291cmNlOiAnZmllbGQnLCB2YWx1ZTogJ2dlbnJlJywgY29sb3I6ICdyYW5kb20nIH1dO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NvbnRleHQnOlxuICAgICAgICAgICAgYmFzZS5ncm91cGluZ1J1bGVzID0gW3sgc291cmNlOiAnZmllbGQnLCB2YWx1ZTogJ2NvbnRleHQnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnbGluZWFnZSc6XG4gICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAncGFyZW50VGl0bGUnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAncGlubmVkJzpcbiAgICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAncGlubmVkJywgb3JkZXI6ICdkZXNjJyB9XTtcbiAgICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAncGlubmVkJywgY29sb3I6ICdyYW5kb20nIH1dO1xuICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdyZWNlbmN5JzpcbiAgICAgICAgICAgIGJhc2Uuc29ydGluZ1J1bGVzID0gW3sgZmllbGQ6ICdsYXN0QWNjZXNzZWQnLCBvcmRlcjogJ2Rlc2MnIH1dO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2FnZSc6XG4gICAgICAgICAgICAgYmFzZS5zb3J0aW5nUnVsZXMgPSBbeyBmaWVsZDogJ2xhc3RBY2Nlc3NlZCcsIG9yZGVyOiAnZGVzYycgfV07XG4gICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3VybCc6XG4gICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAndXJsJywgb3JkZXI6ICdhc2MnIH1dO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3RpdGxlJzpcbiAgICAgICAgICAgIGJhc2Uuc29ydGluZ1J1bGVzID0gW3sgZmllbGQ6ICd0aXRsZScsIG9yZGVyOiAnYXNjJyB9XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICduZXN0aW5nJzpcbiAgICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAncGFyZW50VGl0bGUnLCBvcmRlcjogJ2FzYycgfV07XG4gICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgcmV0dXJuIGJhc2U7XG59XG5cbmNvbnN0IEZJRUxEX09QVElPTlMgPSBgXG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInVybFwiPlVSTDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJ0aXRsZVwiPlRpdGxlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImRvbWFpblwiPkRvbWFpbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzdWJkb21haW5cIj5TdWJkb21haW48L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiaWRcIj5JRDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJpbmRleFwiPkluZGV4PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIndpbmRvd0lkXCI+V2luZG93IElEPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImdyb3VwSWRcIj5Hcm91cCBJRDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJhY3RpdmVcIj5BY3RpdmU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwic2VsZWN0ZWRcIj5TZWxlY3RlZDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJwaW5uZWRcIj5QaW5uZWQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwic3RhdHVzXCI+U3RhdHVzPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIm9wZW5lclRhYklkXCI+T3BlbmVyIElEPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInBhcmVudFRpdGxlXCI+UGFyZW50IFRpdGxlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImxhc3RBY2Nlc3NlZFwiPkxhc3QgQWNjZXNzZWQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZ2VucmVcIj5HZW5yZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0XCI+Q29udGV4dCBTdW1tYXJ5PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLnNpdGVOYW1lXCI+U2l0ZSBOYW1lPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLmNhbm9uaWNhbFVybFwiPkNhbm9uaWNhbCBVUkw8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEubm9ybWFsaXplZFVybFwiPk5vcm1hbGl6ZWQgVVJMPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLnBsYXRmb3JtXCI+UGxhdGZvcm08L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEub2JqZWN0VHlwZVwiPk9iamVjdCBUeXBlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLm9iamVjdElkXCI+T2JqZWN0IElEPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLnRpdGxlXCI+RXh0cmFjdGVkIFRpdGxlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLmRlc2NyaXB0aW9uXCI+RGVzY3JpcHRpb248L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuYXV0aG9yT3JDcmVhdG9yXCI+QXV0aG9yL0NyZWF0b3I8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEucHVibGlzaGVkQXRcIj5QdWJsaXNoZWQgQXQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEubW9kaWZpZWRBdFwiPk1vZGlmaWVkIEF0PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLmxhbmd1YWdlXCI+TGFuZ3VhZ2U8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuaXNBdWRpYmxlXCI+SXMgQXVkaWJsZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5pc011dGVkXCI+SXMgTXV0ZWQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuaGFzVW5zYXZlZENoYW5nZXNMaWtlbHlcIj5VbnNhdmVkIENoYW5nZXM8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuaXNBdXRoZW50aWNhdGVkTGlrZWx5XCI+QXV0aGVudGljYXRlZDwvb3B0aW9uPmA7XG5cbmNvbnN0IE9QRVJBVE9SX09QVElPTlMgPSBgXG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRhaW5zXCI+Y29udGFpbnM8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZG9lc05vdENvbnRhaW5cIj5kb2VzIG5vdCBjb250YWluPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIm1hdGNoZXNcIj5tYXRjaGVzIHJlZ2V4PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImVxdWFsc1wiPmVxdWFsczwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzdGFydHNXaXRoXCI+c3RhcnRzIHdpdGg8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZW5kc1dpdGhcIj5lbmRzIHdpdGg8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZXhpc3RzXCI+ZXhpc3RzPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImRvZXNOb3RFeGlzdFwiPmRvZXMgbm90IGV4aXN0PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImlzTnVsbFwiPmlzIG51bGw8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiaXNOb3ROdWxsXCI+aXMgbm90IG51bGw8L29wdGlvbj5gO1xuXG5mdW5jdGlvbiBpbml0U3RyYXRlZ3lCdWlsZGVyKCkge1xuICAgIGNvbnN0IGFkZEZpbHRlckdyb3VwQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FkZC1maWx0ZXItZ3JvdXAtYnRuJyk7XG4gICAgY29uc3QgYWRkR3JvdXBCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWRkLWdyb3VwLWJ0bicpO1xuICAgIGNvbnN0IGFkZFNvcnRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWRkLXNvcnQtYnRuJyk7XG4gICAgY29uc3QgbG9hZFNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdGVneS1sb2FkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50IHwgbnVsbDtcblxuICAgIC8vIE5ldzogR3JvdXAgU29ydGluZ1xuICAgIGNvbnN0IGFkZEdyb3VwU29ydEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhZGQtZ3JvdXAtc29ydC1idG4nKTtcbiAgICBjb25zdCBncm91cFNvcnRDaGVjayA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1zb3J0Z3JvdXBzLWNoZWNrJyk7XG5cbiAgICBjb25zdCBzYXZlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1aWxkZXItc2F2ZS1idG4nKTtcbiAgICBjb25zdCBydW5CdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1ydW4tYnRuJyk7XG4gICAgY29uc3QgcnVuTGl2ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidWlsZGVyLXJ1bi1saXZlLWJ0bicpO1xuICAgIGNvbnN0IGNsZWFyQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1aWxkZXItY2xlYXItYnRuJyk7XG5cbiAgICBjb25zdCBleHBvcnRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1leHBvcnQtYnRuJyk7XG4gICAgY29uc3QgaW1wb3J0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1aWxkZXItaW1wb3J0LWJ0bicpO1xuXG4gICAgaWYgKGV4cG9ydEJ0bikgZXhwb3J0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZXhwb3J0QnVpbGRlclN0cmF0ZWd5KTtcbiAgICBpZiAoaW1wb3J0QnRuKSBpbXBvcnRCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBpbXBvcnRCdWlsZGVyU3RyYXRlZ3kpO1xuXG4gICAgaWYgKGFkZEZpbHRlckdyb3VwQnRuKSBhZGRGaWx0ZXJHcm91cEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGFkZEZpbHRlckdyb3VwUm93KCkpO1xuICAgIGlmIChhZGRHcm91cEJ0bikgYWRkR3JvdXBCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBhZGRCdWlsZGVyUm93KCdncm91cCcpKTtcbiAgICBpZiAoYWRkU29ydEJ0bikgYWRkU29ydEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGFkZEJ1aWxkZXJSb3coJ3NvcnQnKSk7XG4gICAgaWYgKGFkZEdyb3VwU29ydEJ0bikgYWRkR3JvdXBTb3J0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gYWRkQnVpbGRlclJvdygnZ3JvdXBTb3J0JykpO1xuXG4gICAgaWYgKGdyb3VwU29ydENoZWNrKSB7XG4gICAgICAgIGdyb3VwU29ydENoZWNrLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjaGVja2VkID0gKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQ7XG4gICAgICAgICAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JvdXAtc29ydC1yb3dzLWNvbnRhaW5lcicpO1xuICAgICAgICAgICAgY29uc3QgYWRkQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FkZC1ncm91cC1zb3J0LWJ0bicpO1xuICAgICAgICAgICAgaWYgKGNvbnRhaW5lciAmJiBhZGRCdG4pIHtcbiAgICAgICAgICAgICAgICBjb250YWluZXIuc3R5bGUuZGlzcGxheSA9IGNoZWNrZWQgPyAnYmxvY2snIDogJ25vbmUnO1xuICAgICAgICAgICAgICAgIGFkZEJ0bi5zdHlsZS5kaXNwbGF5ID0gY2hlY2tlZCA/ICdibG9jaycgOiAnbm9uZSc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmIChzYXZlQnRuKSBzYXZlQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gc2F2ZUN1c3RvbVN0cmF0ZWd5RnJvbUJ1aWxkZXIodHJ1ZSkpO1xuICAgIGlmIChydW5CdG4pIHJ1bkJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHJ1bkJ1aWxkZXJTaW11bGF0aW9uKTtcbiAgICBpZiAocnVuTGl2ZUJ0bikgcnVuTGl2ZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHJ1bkJ1aWxkZXJMaXZlKTtcbiAgICBpZiAoY2xlYXJCdG4pIGNsZWFyQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY2xlYXJCdWlsZGVyKTtcblxuICAgIGlmIChsb2FkU2VsZWN0KSB7XG4gICAgICAgIGxvYWRTZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKCkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWRJZCA9IGxvYWRTZWxlY3QudmFsdWU7XG4gICAgICAgICAgICBpZiAoIXNlbGVjdGVkSWQpIHJldHVybjtcblxuICAgICAgICAgICAgbGV0IHN0cmF0ID0gbG9jYWxDdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzZWxlY3RlZElkKTtcbiAgICAgICAgICAgIGlmICghc3RyYXQpIHtcbiAgICAgICAgICAgICAgICBzdHJhdCA9IGdldEJ1aWx0SW5TdHJhdGVneUNvbmZpZyhzZWxlY3RlZElkKSB8fCB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdHJhdCkge1xuICAgICAgICAgICAgICAgIHBvcHVsYXRlQnVpbGRlckZyb21TdHJhdGVneShzdHJhdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIEluaXRpYWwgTGl2ZSBWaWV3XG4gICAgcmVuZGVyTGl2ZVZpZXcoKTtcbiAgICBjb25zdCByZWZyZXNoTGl2ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZWZyZXNoLWxpdmUtdmlldy1idG4nKTtcbiAgICBpZiAocmVmcmVzaExpdmVCdG4pIHJlZnJlc2hMaXZlQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgcmVuZGVyTGl2ZVZpZXcpO1xuXG4gICAgY29uc3QgbGl2ZUNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsaXZlLXZpZXctY29udGFpbmVyJyk7XG4gICAgaWYgKGxpdmVDb250YWluZXIpIHtcbiAgICAgICAgbGl2ZUNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSB0YXJnZXQuY2xvc2VzdCgnLnNlbGVjdGFibGUtaXRlbScpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICAgICAgaWYgKCFpdGVtKSByZXR1cm47XG5cbiAgICAgICAgICAgIGNvbnN0IHR5cGUgPSBpdGVtLmRhdGFzZXQudHlwZTtcbiAgICAgICAgICAgIGNvbnN0IGlkID0gTnVtYmVyKGl0ZW0uZGF0YXNldC5pZCk7XG4gICAgICAgICAgICBpZiAoIXR5cGUgfHwgaXNOYU4oaWQpKSByZXR1cm47XG5cbiAgICAgICAgICAgIGlmICh0eXBlID09PSAndGFiJykge1xuICAgICAgICAgICAgICAgIGlmIChzaW11bGF0ZWRTZWxlY3Rpb24uaGFzKGlkKSkgc2ltdWxhdGVkU2VsZWN0aW9uLmRlbGV0ZShpZCk7XG4gICAgICAgICAgICAgICAgZWxzZSBzaW11bGF0ZWRTZWxlY3Rpb24uYWRkKGlkKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ2dyb3VwJykge1xuICAgICAgICAgICAgICAgIC8vIFRvZ2dsZSBhbGwgdGFicyBpbiBncm91cFxuICAgICAgICAgICAgICAgIC8vIFdlIG5lZWQgdG8ga25vdyB3aGljaCB0YWJzIGFyZSBpbiB0aGUgZ3JvdXAuXG4gICAgICAgICAgICAgICAgLy8gV2UgY2FuIGZpbmQgdGhlbSBpbiBET00gb3IgcmVmZXRjaC4gRE9NIGlzIGVhc2llci5cbiAgICAgICAgICAgICAgICAvLyBPciBiZXR0ZXIsIGxvZ2ljIGluIHJlbmRlckxpdmVWaWV3IGhhbmRsZXMgcmVuZGVyaW5nLCBoZXJlIHdlIGhhbmRsZSBkYXRhLlxuICAgICAgICAgICAgICAgIC8vIExldCdzIHJlbHkgb24gRE9NIHN0cnVjdHVyZSBvciByZS1xdWVyeS5cbiAgICAgICAgICAgICAgICAvLyBSZS1xdWVyeWluZyBpcyByb2J1c3QuXG4gICAgICAgICAgICAgICAgY2hyb21lLnRhYnMucXVlcnkoe30pLnRoZW4odGFicyA9PiB7XG4gICAgICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBUYWJzID0gdGFicy5maWx0ZXIodCA9PiB0Lmdyb3VwSWQgPT09IGlkKTtcbiAgICAgICAgICAgICAgICAgICBjb25zdCBhbGxTZWxlY3RlZCA9IGdyb3VwVGFicy5ldmVyeSh0ID0+IHQuaWQgJiYgc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKSk7XG4gICAgICAgICAgICAgICAgICAgZ3JvdXBUYWJzLmZvckVhY2godCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgIGlmICh0LmlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYWxsU2VsZWN0ZWQpIHNpbXVsYXRlZFNlbGVjdGlvbi5kZWxldGUodC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlIHNpbXVsYXRlZFNlbGVjdGlvbi5hZGQodC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICByZW5kZXJMaXZlVmlldygpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybjsgLy8gYXN5bmMgdXBkYXRlXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICd3aW5kb3cnKSB7XG4gICAgICAgICAgICAgICAgY2hyb21lLnRhYnMucXVlcnkoe30pLnRoZW4odGFicyA9PiB7XG4gICAgICAgICAgICAgICAgICAgY29uc3Qgd2luVGFicyA9IHRhYnMuZmlsdGVyKHQgPT4gdC53aW5kb3dJZCA9PT0gaWQpO1xuICAgICAgICAgICAgICAgICAgIGNvbnN0IGFsbFNlbGVjdGVkID0gd2luVGFicy5ldmVyeSh0ID0+IHQuaWQgJiYgc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKSk7XG4gICAgICAgICAgICAgICAgICAgd2luVGFicy5mb3JFYWNoKHQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICBpZiAodC5pZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFsbFNlbGVjdGVkKSBzaW11bGF0ZWRTZWxlY3Rpb24uZGVsZXRlKHQuaWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBzaW11bGF0ZWRTZWxlY3Rpb24uYWRkKHQuaWQpO1xuICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgcmVuZGVyTGl2ZVZpZXcoKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm47IC8vIGFzeW5jIHVwZGF0ZVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZW5kZXJMaXZlVmlldygpO1xuICAgICAgICB9KTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFkZEZpbHRlckdyb3VwUm93KGNvbmRpdGlvbnM/OiBSdWxlQ29uZGl0aW9uW10pIHtcbiAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmlsdGVyLXJvd3MtY29udGFpbmVyJyk7XG4gICAgaWYgKCFjb250YWluZXIpIHJldHVybjtcblxuICAgIGNvbnN0IGdyb3VwRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgZ3JvdXBEaXYuY2xhc3NOYW1lID0gJ2ZpbHRlci1ncm91cC1yb3cnO1xuICAgIGdyb3VwRGl2LnN0eWxlLmJvcmRlciA9ICcxcHggc29saWQgI2UwZTBlMCc7XG4gICAgZ3JvdXBEaXYuc3R5bGUuYm9yZGVyUmFkaXVzID0gJzVweCc7XG4gICAgZ3JvdXBEaXYuc3R5bGUucGFkZGluZyA9ICcxMHB4JztcbiAgICBncm91cERpdi5zdHlsZS5tYXJnaW5Cb3R0b20gPSAnMTBweCc7XG4gICAgZ3JvdXBEaXYuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJyNmYWZhZmEnO1xuXG4gICAgZ3JvdXBEaXYuaW5uZXJIVE1MID0gYFxuICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuOyBhbGlnbi1pdGVtczogY2VudGVyOyBtYXJnaW4tYm90dG9tOiA1cHg7XCI+XG4gICAgICAgICAgICA8c3BhbiBzdHlsZT1cImZvbnQtd2VpZ2h0OiBib2xkOyBjb2xvcjogIzU1NTsgZm9udC1zaXplOiAwLjllbTtcIj5Hcm91cCAoQU5EKTwvc3Bhbj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJzbWFsbC1idG4gYnRuLWRlbC1ncm91cFwiIHN0eWxlPVwiYmFja2dyb3VuZDogI2ZmY2NjYzsgY29sb3I6IGRhcmtyZWQ7XCI+RGVsZXRlIEdyb3VwPC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwiY29uZGl0aW9ucy1jb250YWluZXJcIj48L2Rpdj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInNtYWxsLWJ0biBidG4tYWRkLWNvbmRpdGlvblwiIHN0eWxlPVwibWFyZ2luLXRvcDogNXB4O1wiPisgQWRkIENvbmRpdGlvbjwvYnV0dG9uPlxuICAgIGA7XG5cbiAgICBncm91cERpdi5xdWVyeVNlbGVjdG9yKCcuYnRuLWRlbC1ncm91cCcpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgZ3JvdXBEaXYucmVtb3ZlKCk7XG4gICAgICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbmRpdGlvbnNDb250YWluZXIgPSBncm91cERpdi5xdWVyeVNlbGVjdG9yKCcuY29uZGl0aW9ucy1jb250YWluZXInKSBhcyBIVE1MRWxlbWVudDtcbiAgICBjb25zdCBhZGRDb25kaXRpb25CdG4gPSBncm91cERpdi5xdWVyeVNlbGVjdG9yKCcuYnRuLWFkZC1jb25kaXRpb24nKTtcblxuICAgIGNvbnN0IGFkZENvbmRpdGlvbiA9IChkYXRhPzogUnVsZUNvbmRpdGlvbikgPT4ge1xuICAgICAgICBjb25zdCBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgZGl2LmNsYXNzTmFtZSA9ICdidWlsZGVyLXJvdyBjb25kaXRpb24tcm93JztcbiAgICAgICAgZGl2LnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG4gICAgICAgIGRpdi5zdHlsZS5nYXAgPSAnNXB4JztcbiAgICAgICAgZGl2LnN0eWxlLm1hcmdpbkJvdHRvbSA9ICc1cHgnO1xuICAgICAgICBkaXYuc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xuXG4gICAgICAgIGRpdi5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwiZmllbGQtc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgJHtGSUVMRF9PUFRJT05TfVxuICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cIm9wZXJhdG9yLWNvbnRhaW5lclwiPlxuICAgICAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJvcGVyYXRvci1zZWxlY3RcIj5cbiAgICAgICAgICAgICAgICAgICAgJHtPUEVSQVRPUl9PUFRJT05TfVxuICAgICAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJ2YWx1ZS1jb250YWluZXJcIj5cbiAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cInZhbHVlLWlucHV0XCIgcGxhY2Vob2xkZXI9XCJWYWx1ZVwiPlxuICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInNtYWxsLWJ0biBidG4tZGVsLWNvbmRpdGlvblwiIHN0eWxlPVwiYmFja2dyb3VuZDogbm9uZTsgYm9yZGVyOiBub25lOyBjb2xvcjogcmVkO1wiPiZ0aW1lczs8L2J1dHRvbj5cbiAgICAgICAgYDtcblxuICAgICAgICBjb25zdCBmaWVsZFNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IG9wZXJhdG9yQ29udGFpbmVyID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5vcGVyYXRvci1jb250YWluZXInKSBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgY29uc3QgdmFsdWVDb250YWluZXIgPSBkaXYucXVlcnlTZWxlY3RvcignLnZhbHVlLWNvbnRhaW5lcicpIGFzIEhUTUxFbGVtZW50O1xuXG4gICAgICAgIGNvbnN0IHVwZGF0ZVN0YXRlID0gKGluaXRpYWxPcD86IHN0cmluZywgaW5pdGlhbFZhbD86IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgY29uc3QgdmFsID0gZmllbGRTZWxlY3QudmFsdWU7XG4gICAgICAgICAgICAvLyBIYW5kbGUgYm9vbGVhbiBmaWVsZHNcbiAgICAgICAgICAgIGlmIChbJ3NlbGVjdGVkJywgJ3Bpbm5lZCddLmluY2x1ZGVzKHZhbCkpIHtcbiAgICAgICAgICAgICAgICBvcGVyYXRvckNvbnRhaW5lci5pbm5lckhUTUwgPSBgPHNlbGVjdCBjbGFzcz1cIm9wZXJhdG9yLXNlbGVjdFwiIGRpc2FibGVkIHN0eWxlPVwiYmFja2dyb3VuZDogI2VlZTsgY29sb3I6ICM1NTU7XCI+PG9wdGlvbiB2YWx1ZT1cImVxdWFsc1wiPmlzPC9vcHRpb24+PC9zZWxlY3Q+YDtcbiAgICAgICAgICAgICAgICB2YWx1ZUNvbnRhaW5lci5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJ2YWx1ZS1pbnB1dFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInRydWVcIj5UcnVlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZmFsc2VcIj5GYWxzZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgICAgICBgO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiBhbHJlYWR5IGluIHN0YW5kYXJkIG1vZGUgdG8gYXZvaWQgdW5uZWNlc3NhcnkgRE9NIHRocmFzaGluZ1xuICAgICAgICAgICAgICAgIGlmICghb3BlcmF0b3JDb250YWluZXIucXVlcnlTZWxlY3Rvcignc2VsZWN0Om5vdChbZGlzYWJsZWRdKScpKSB7XG4gICAgICAgICAgICAgICAgICAgIG9wZXJhdG9yQ29udGFpbmVyLmlubmVySFRNTCA9IGA8c2VsZWN0IGNsYXNzPVwib3BlcmF0b3Itc2VsZWN0XCI+JHtPUEVSQVRPUl9PUFRJT05TfTwvc2VsZWN0PmA7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlQ29udGFpbmVyLmlubmVySFRNTCA9IGA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cInZhbHVlLWlucHV0XCIgcGxhY2Vob2xkZXI9XCJWYWx1ZVwiPmA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBSZXN0b3JlIHZhbHVlcyBpZiBwcm92aWRlZCAoZXNwZWNpYWxseSB3aGVuIHN3aXRjaGluZyBiYWNrIG9yIGluaXRpYWxpemluZylcbiAgICAgICAgICAgIGlmIChpbml0aWFsT3AgfHwgaW5pdGlhbFZhbCkge1xuICAgICAgICAgICAgICAgICBjb25zdCBvcEVsID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5vcGVyYXRvci1zZWxlY3QnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgIGNvbnN0IHZhbEVsID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgICAgICAgaWYgKG9wRWwgJiYgaW5pdGlhbE9wKSBvcEVsLnZhbHVlID0gaW5pdGlhbE9wO1xuICAgICAgICAgICAgICAgICBpZiAodmFsRWwgJiYgaW5pdGlhbFZhbCkgdmFsRWwudmFsdWUgPSBpbml0aWFsVmFsO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBSZS1hdHRhY2ggbGlzdGVuZXJzIHRvIG5ldyBlbGVtZW50c1xuICAgICAgICAgICAgZGl2LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0LCBzZWxlY3QnKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgICAgICAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB1cGRhdGVCcmVhZGNydW1iKTtcbiAgICAgICAgICAgICAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKCdpbnB1dCcsIHVwZGF0ZUJyZWFkY3J1bWIpO1xuICAgICAgICAgICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHVwZGF0ZUJyZWFkY3J1bWIpO1xuICAgICAgICAgICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgdXBkYXRlQnJlYWRjcnVtYik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBmaWVsZFNlbGVjdC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoKSA9PiB7XG4gICAgICAgICAgICB1cGRhdGVTdGF0ZSgpO1xuICAgICAgICAgICAgdXBkYXRlQnJlYWRjcnVtYigpO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoZGF0YSkge1xuICAgICAgICAgICAgZmllbGRTZWxlY3QudmFsdWUgPSBkYXRhLmZpZWxkO1xuICAgICAgICAgICAgdXBkYXRlU3RhdGUoZGF0YS5vcGVyYXRvciwgZGF0YS52YWx1ZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB1cGRhdGVTdGF0ZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgZGl2LnF1ZXJ5U2VsZWN0b3IoJy5idG4tZGVsLWNvbmRpdGlvbicpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgIGRpdi5yZW1vdmUoKTtcbiAgICAgICAgICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uZGl0aW9uc0NvbnRhaW5lci5hcHBlbmRDaGlsZChkaXYpO1xuICAgIH07XG5cbiAgICBhZGRDb25kaXRpb25CdG4/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gYWRkQ29uZGl0aW9uKCkpO1xuXG4gICAgaWYgKGNvbmRpdGlvbnMgJiYgY29uZGl0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbmRpdGlvbnMuZm9yRWFjaChjID0+IGFkZENvbmRpdGlvbihjKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gQWRkIG9uZSBlbXB0eSBjb25kaXRpb24gYnkgZGVmYXVsdFxuICAgICAgICBhZGRDb25kaXRpb24oKTtcbiAgICB9XG5cbiAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JvdXBEaXYpO1xuICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbn1cblxuZnVuY3Rpb24gYWRkQnVpbGRlclJvdyh0eXBlOiAnZ3JvdXAnIHwgJ3NvcnQnIHwgJ2dyb3VwU29ydCcsIGRhdGE/OiBhbnkpIHtcbiAgICBsZXQgY29udGFpbmVySWQgPSAnJztcbiAgICBpZiAodHlwZSA9PT0gJ2dyb3VwJykgY29udGFpbmVySWQgPSAnZ3JvdXAtcm93cy1jb250YWluZXInO1xuICAgIGVsc2UgaWYgKHR5cGUgPT09ICdzb3J0JykgY29udGFpbmVySWQgPSAnc29ydC1yb3dzLWNvbnRhaW5lcic7XG4gICAgZWxzZSBpZiAodHlwZSA9PT0gJ2dyb3VwU29ydCcpIGNvbnRhaW5lcklkID0gJ2dyb3VwLXNvcnQtcm93cy1jb250YWluZXInO1xuXG4gICAgY29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY29udGFpbmVySWQpO1xuICAgIGlmICghY29udGFpbmVyKSByZXR1cm47XG5cbiAgICBjb25zdCBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBkaXYuY2xhc3NOYW1lID0gJ2J1aWxkZXItcm93JztcbiAgICBkaXYuZGF0YXNldC50eXBlID0gdHlwZTtcblxuICAgIGlmICh0eXBlID09PSAnZ3JvdXAnKSB7XG4gICAgICAgIGRpdi5zdHlsZS5mbGV4V3JhcCA9ICd3cmFwJztcbiAgICAgICAgZGl2LmlubmVySFRNTCA9IGBcbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwicm93LW51bWJlclwiPjwvc3Bhbj5cbiAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJzb3VyY2Utc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImZpZWxkXCI+RmllbGQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZml4ZWRcIj5GaXhlZCBWYWx1ZTwvb3B0aW9uPlxuICAgICAgICAgICAgPC9zZWxlY3Q+XG5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiaW5wdXQtY29udGFpbmVyXCI+XG4gICAgICAgICAgICAgICAgIDwhLS0gV2lsbCBiZSBwb3B1bGF0ZWQgYmFzZWQgb24gc291cmNlIHNlbGVjdGlvbiAtLT5cbiAgICAgICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cImZpZWxkLXNlbGVjdCB2YWx1ZS1pbnB1dC1maWVsZFwiPlxuICAgICAgICAgICAgICAgICAgICAke0ZJRUxEX09QVElPTlN9XG4gICAgICAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cInZhbHVlLWlucHV0LXRleHRcIiBwbGFjZWhvbGRlcj1cIkdyb3VwIE5hbWVcIiBzdHlsZT1cImRpc3BsYXk6bm9uZTtcIj5cbiAgICAgICAgICAgIDwvc3Bhbj5cblxuICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJtYXJnaW4tbGVmdDogMTBweDtcIj5UcmFuc2Zvcm06PC9zcGFuPlxuICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cInRyYW5zZm9ybS1zZWxlY3RcIj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibm9uZVwiPk5vbmU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwic3RyaXBUbGRcIj5TdHJpcCBUTEQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZG9tYWluXCI+R2V0IERvbWFpbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJob3N0bmFtZVwiPkdldCBIb3N0bmFtZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJsb3dlcmNhc2VcIj5Mb3dlcmNhc2U8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwidXBwZXJjYXNlXCI+VXBwZXJjYXNlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImZpcnN0Q2hhclwiPkZpcnN0IENoYXI8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwicmVnZXhcIj5SZWdleCBFeHRyYWN0aW9uPC9vcHRpb24+XG4gICAgICAgICAgICA8L3NlbGVjdD5cblxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJlZ2V4LWNvbnRhaW5lclwiIHN0eWxlPVwiZGlzcGxheTpub25lOyBmbGV4LWJhc2lzOiAxMDAlOyBtYXJnaW4tdG9wOiA4cHg7IHBhZGRpbmc6IDhweDsgYmFja2dyb3VuZDogI2Y4ZjlmYTsgYm9yZGVyOiAxcHggZGFzaGVkICNjZWQ0ZGE7IGJvcmRlci1yYWRpdXM6IDRweDtcIj5cbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZ2FwOiA4cHg7IG1hcmdpbi1ib3R0b206IDVweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJmb250LXdlaWdodDogNTAwOyBmb250LXNpemU6IDAuOWVtO1wiPlBhdHRlcm46PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cInRyYW5zZm9ybS1wYXR0ZXJuXCIgcGxhY2Vob2xkZXI9XCJlLmcuIF4oXFx3KyktKFxcZCspJFwiIHN0eWxlPVwiZmxleDoxO1wiPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiB0aXRsZT1cIkNhcHR1cmVzIGFsbCBncm91cHMgYW5kIGNvbmNhdGVuYXRlcyB0aGVtLiBJZiBubyBtYXRjaCwgcmVzdWx0IGlzIGVtcHR5LiBFeGFtcGxlOiAndXNlci0oXFxkKyknIGV4dHJhY3RzICcxMjMnIGZyb20gJ3VzZXItMTIzJy5cIiBzdHlsZT1cImN1cnNvcjogaGVscDsgY29sb3I6ICMwMDdiZmY7IGZvbnQtd2VpZ2h0OiBib2xkOyBiYWNrZ3JvdW5kOiAjZTdmMWZmOyB3aWR0aDogMThweDsgaGVpZ2h0OiAxOHB4OyBkaXNwbGF5OiBpbmxpbmUtZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsganVzdGlmeS1jb250ZW50OiBjZW50ZXI7IGJvcmRlci1yYWRpdXM6IDUwJTsgZm9udC1zaXplOiAxMnB4O1wiPj88L3NwYW4+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGdhcDogOHB4OyBhbGlnbi1pdGVtczogY2VudGVyOyBmb250LXNpemU6IDAuOWVtO1wiPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImZvbnQtd2VpZ2h0OiA1MDA7XCI+VGVzdDo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIGNsYXNzPVwicmVnZXgtdGVzdC1pbnB1dFwiIHBsYWNlaG9sZGVyPVwiVGVzdCBTdHJpbmdcIiBzdHlsZT1cImZsZXg6IDE7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuPiZyYXJyOzwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJyZWdleC10ZXN0LXJlc3VsdFwiIHN0eWxlPVwiZm9udC1mYW1pbHk6IG1vbm9zcGFjZTsgYmFja2dyb3VuZDogd2hpdGU7IHBhZGRpbmc6IDJweCA1cHg7IGJvcmRlcjogMXB4IHNvbGlkICNkZGQ7IGJvcmRlci1yYWRpdXM6IDNweDsgbWluLXdpZHRoOiA2MHB4O1wiPihwcmV2aWV3KTwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICA8c3BhbiBzdHlsZT1cIm1hcmdpbi1sZWZ0OiAxMHB4O1wiPldpbmRvdzo8L3NwYW4+XG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwid2luZG93LW1vZGUtc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImN1cnJlbnRcIj5DdXJyZW50PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbXBvdW5kXCI+Q29tcG91bmQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibmV3XCI+TmV3PC9vcHRpb24+XG4gICAgICAgICAgICA8L3NlbGVjdD5cblxuICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJtYXJnaW4tbGVmdDogMTBweDtcIj5Db2xvcjo8L3NwYW4+XG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwiY29sb3ItaW5wdXRcIj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZ3JleVwiPkdyZXk8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiYmx1ZVwiPkJsdWU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwicmVkXCI+UmVkPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInllbGxvd1wiPlllbGxvdzwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJncmVlblwiPkdyZWVuPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInBpbmtcIj5QaW5rPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInB1cnBsZVwiPlB1cnBsZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjeWFuXCI+Q3lhbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJvcmFuZ2VcIj5PcmFuZ2U8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibWF0Y2hcIj5NYXRjaCBWYWx1ZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJmaWVsZFwiPkNvbG9yIGJ5IEZpZWxkPC9vcHRpb24+XG4gICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJjb2xvci1maWVsZC1zZWxlY3RcIiBzdHlsZT1cImRpc3BsYXk6bm9uZTtcIj5cbiAgICAgICAgICAgICAgICAke0ZJRUxEX09QVElPTlN9XG4gICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgIDxsYWJlbD48aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgY2xhc3M9XCJyYW5kb20tY29sb3ItY2hlY2tcIiBjaGVja2VkPiBSYW5kb208L2xhYmVsPlxuXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93LWFjdGlvbnNcIj5cbiAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwic21hbGwtYnRuIGJ0bi1kZWxcIiBzdHlsZT1cImJhY2tncm91bmQ6ICNmZmNjY2M7IGNvbG9yOiBkYXJrcmVkO1wiPkRlbGV0ZTwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgIGA7XG5cbiAgICAgICAgLy8gQWRkIHNwZWNpZmljIGxpc3RlbmVycyBmb3IgR3JvdXAgcm93XG4gICAgICAgIGNvbnN0IHNvdXJjZVNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuc291cmNlLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICBjb25zdCBmaWVsZFNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQtZmllbGQnKSBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgY29uc3QgdGV4dElucHV0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC10ZXh0JykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IGNvbG9ySW5wdXQgPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLWlucHV0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IGNvbG9yRmllbGRTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLWZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICBjb25zdCByYW5kb21DaGVjayA9IGRpdi5xdWVyeVNlbGVjdG9yKCcucmFuZG9tLWNvbG9yLWNoZWNrJykgYXMgSFRNTElucHV0RWxlbWVudDtcblxuICAgICAgICAvLyBSZWdleCBMb2dpY1xuICAgICAgICBjb25zdCB0cmFuc2Zvcm1TZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLnRyYW5zZm9ybS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgY29uc3QgcmVnZXhDb250YWluZXIgPSBkaXYucXVlcnlTZWxlY3RvcignLnJlZ2V4LWNvbnRhaW5lcicpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICBjb25zdCBwYXR0ZXJuSW5wdXQgPSBkaXYucXVlcnlTZWxlY3RvcignLnRyYW5zZm9ybS1wYXR0ZXJuJykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgY29uc3QgdGVzdElucHV0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5yZWdleC10ZXN0LWlucHV0JykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgY29uc3QgdGVzdFJlc3VsdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcucmVnZXgtdGVzdC1yZXN1bHQnKSBhcyBIVE1MRWxlbWVudDtcblxuICAgICAgICBjb25zdCB0b2dnbGVUcmFuc2Zvcm0gPSAoKSA9PiB7XG4gICAgICAgICAgICBpZiAodHJhbnNmb3JtU2VsZWN0LnZhbHVlID09PSAncmVnZXgnKSB7XG4gICAgICAgICAgICAgICAgcmVnZXhDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlZ2V4Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG4gICAgICAgIH07XG4gICAgICAgIHRyYW5zZm9ybVNlbGVjdC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB0b2dnbGVUcmFuc2Zvcm0pO1xuXG4gICAgICAgIGNvbnN0IHVwZGF0ZVRlc3QgPSAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwYXQgPSBwYXR0ZXJuSW5wdXQudmFsdWU7XG4gICAgICAgICAgICBjb25zdCB0eHQgPSB0ZXN0SW5wdXQudmFsdWU7XG4gICAgICAgICAgICBpZiAoIXBhdCB8fCAhdHh0KSB7XG4gICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQudGV4dENvbnRlbnQgPSBcIihwcmV2aWV3KVwiO1xuICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnN0eWxlLmNvbG9yID0gXCIjNTU1XCI7XG4gICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHBhdCk7XG4gICAgICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSByZWdleC5leGVjKHR4dCk7XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgICBsZXQgZXh0cmFjdGVkID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbWF0Y2gubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICBleHRyYWN0ZWQgKz0gbWF0Y2hbaV0gfHwgXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQudGV4dENvbnRlbnQgPSBleHRyYWN0ZWQgfHwgXCIoZW1wdHkgZ3JvdXApXCI7XG4gICAgICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnN0eWxlLmNvbG9yID0gXCJncmVlblwiO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnRleHRDb250ZW50ID0gXCIobm8gbWF0Y2gpXCI7XG4gICAgICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnN0eWxlLmNvbG9yID0gXCJyZWRcIjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgdGVzdFJlc3VsdC50ZXh0Q29udGVudCA9IFwiKGludmFsaWQgcmVnZXgpXCI7XG4gICAgICAgICAgICAgICAgdGVzdFJlc3VsdC5zdHlsZS5jb2xvciA9IFwicmVkXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHBhdHRlcm5JbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsICgpID0+IHsgdXBkYXRlVGVzdCgpOyB1cGRhdGVCcmVhZGNydW1iKCk7IH0pO1xuICAgICAgICB0ZXN0SW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCB1cGRhdGVUZXN0KTtcblxuXG4gICAgICAgIC8vIFRvZ2dsZSBpbnB1dCB0eXBlXG4gICAgICAgIGNvbnN0IHRvZ2dsZUlucHV0ID0gKCkgPT4ge1xuICAgICAgICAgICAgaWYgKHNvdXJjZVNlbGVjdC52YWx1ZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgIGZpZWxkU2VsZWN0LnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWJsb2NrJztcbiAgICAgICAgICAgICAgICB0ZXh0SW5wdXQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZmllbGRTZWxlY3Quc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgICAgICB0ZXh0SW5wdXQuc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUtYmxvY2snO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdXBkYXRlQnJlYWRjcnVtYigpO1xuICAgICAgICB9O1xuICAgICAgICBzb3VyY2VTZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgdG9nZ2xlSW5wdXQpO1xuXG4gICAgICAgIC8vIFRvZ2dsZSBjb2xvciBpbnB1dFxuICAgICAgICBjb25zdCB0b2dnbGVDb2xvciA9ICgpID0+IHtcbiAgICAgICAgICAgIGlmIChyYW5kb21DaGVjay5jaGVja2VkKSB7XG4gICAgICAgICAgICAgICAgY29sb3JJbnB1dC5kaXNhYmxlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgY29sb3JJbnB1dC5zdHlsZS5vcGFjaXR5ID0gJzAuNSc7XG4gICAgICAgICAgICAgICAgY29sb3JGaWVsZFNlbGVjdC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb2xvcklucHV0LmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgY29sb3JJbnB1dC5zdHlsZS5vcGFjaXR5ID0gJzEnO1xuICAgICAgICAgICAgICAgIGlmIChjb2xvcklucHV0LnZhbHVlID09PSAnZmllbGQnKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yRmllbGRTZWxlY3Quc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUtYmxvY2snO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yRmllbGRTZWxlY3Quc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHJhbmRvbUNoZWNrLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHRvZ2dsZUNvbG9yKTtcbiAgICAgICAgY29sb3JJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB0b2dnbGVDb2xvcik7XG4gICAgICAgIHRvZ2dsZUNvbG9yKCk7IC8vIGluaXRcblxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3NvcnQnIHx8IHR5cGUgPT09ICdncm91cFNvcnQnKSB7XG4gICAgICAgIGRpdi5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwiZmllbGQtc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgJHtGSUVMRF9PUFRJT05TfVxuICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwib3JkZXItc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImFzY1wiPmEgdG8geiAoYXNjKTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJkZXNjXCI+eiB0byBhIChkZXNjKTwvb3B0aW9uPlxuICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93LWFjdGlvbnNcIj5cbiAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInNtYWxsLWJ0biBidG4tZGVsXCIgc3R5bGU9XCJiYWNrZ3JvdW5kOiAjZmZjY2NjOyBjb2xvcjogZGFya3JlZDtcIj5EZWxldGU8L2J1dHRvbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICBgO1xuICAgIH1cblxuICAgIC8vIFBvcHVsYXRlIGRhdGEgaWYgcHJvdmlkZWQgKGZvciBlZGl0aW5nKVxuICAgIGlmIChkYXRhKSB7XG4gICAgICAgIGlmICh0eXBlID09PSAnZ3JvdXAnKSB7XG4gICAgICAgICAgICBjb25zdCBzb3VyY2VTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLnNvdXJjZS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC1maWVsZCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgdGV4dElucHV0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC10ZXh0JykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IHRyYW5zZm9ybVNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcudHJhbnNmb3JtLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgY29sb3JJbnB1dCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuY29sb3ItaW5wdXQnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IGNvbG9yRmllbGRTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLWZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgcmFuZG9tQ2hlY2sgPSBkaXYucXVlcnlTZWxlY3RvcignLnJhbmRvbS1jb2xvci1jaGVjaycpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgICAgICBjb25zdCB3aW5kb3dNb2RlU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy53aW5kb3ctbW9kZS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcblxuICAgICAgICAgICAgaWYgKGRhdGEuc291cmNlKSBzb3VyY2VTZWxlY3QudmFsdWUgPSBkYXRhLnNvdXJjZTtcblxuICAgICAgICAgICAgLy8gVHJpZ2dlciB0b2dnbGUgdG8gc2hvdyBjb3JyZWN0IGlucHV0XG4gICAgICAgICAgICBzb3VyY2VTZWxlY3QuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScpKTtcblxuICAgICAgICAgICAgaWYgKGRhdGEuc291cmNlID09PSAnZmllbGQnKSB7XG4gICAgICAgICAgICAgICAgaWYgKGRhdGEudmFsdWUpIGZpZWxkU2VsZWN0LnZhbHVlID0gZGF0YS52YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKGRhdGEudmFsdWUpIHRleHRJbnB1dC52YWx1ZSA9IGRhdGEudmFsdWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChkYXRhLnRyYW5zZm9ybSkgdHJhbnNmb3JtU2VsZWN0LnZhbHVlID0gZGF0YS50cmFuc2Zvcm07XG4gICAgICAgICAgICBpZiAoZGF0YS50cmFuc2Zvcm1QYXR0ZXJuKSAoZGl2LnF1ZXJ5U2VsZWN0b3IoJy50cmFuc2Zvcm0tcGF0dGVybicpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gZGF0YS50cmFuc2Zvcm1QYXR0ZXJuO1xuXG4gICAgICAgICAgICAvLyBUcmlnZ2VyIHRvZ2dsZSBmb3IgcmVnZXggVUlcbiAgICAgICAgICAgIHRyYW5zZm9ybVNlbGVjdC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJykpO1xuXG4gICAgICAgICAgICBpZiAoZGF0YS53aW5kb3dNb2RlKSB3aW5kb3dNb2RlU2VsZWN0LnZhbHVlID0gZGF0YS53aW5kb3dNb2RlO1xuXG4gICAgICAgICAgICBpZiAoZGF0YS5jb2xvciAmJiBkYXRhLmNvbG9yICE9PSAncmFuZG9tJykge1xuICAgICAgICAgICAgICAgIHJhbmRvbUNoZWNrLmNoZWNrZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBjb2xvcklucHV0LnZhbHVlID0gZGF0YS5jb2xvcjtcbiAgICAgICAgICAgICAgICBpZiAoZGF0YS5jb2xvciA9PT0gJ2ZpZWxkJyAmJiBkYXRhLmNvbG9yRmllbGQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29sb3JGaWVsZFNlbGVjdC52YWx1ZSA9IGRhdGEuY29sb3JGaWVsZDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJhbmRvbUNoZWNrLmNoZWNrZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgIC8vIFRyaWdnZXIgdG9nZ2xlIGNvbG9yXG4gICAgICAgICAgICByYW5kb21DaGVjay5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJykpO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzb3J0JyB8fCB0eXBlID09PSAnZ3JvdXBTb3J0Jykge1xuICAgICAgICAgICAgIGlmIChkYXRhLmZpZWxkKSAoZGl2LnF1ZXJ5U2VsZWN0b3IoJy5maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgPSBkYXRhLmZpZWxkO1xuICAgICAgICAgICAgIGlmIChkYXRhLm9yZGVyKSAoZGl2LnF1ZXJ5U2VsZWN0b3IoJy5vcmRlci1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgPSBkYXRhLm9yZGVyO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gTGlzdGVuZXJzIChHZW5lcmFsKVxuICAgIGRpdi5xdWVyeVNlbGVjdG9yKCcuYnRuLWRlbCcpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgZGl2LnJlbW92ZSgpO1xuICAgICAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG4gICAgfSk7XG5cbiAgICAvLyBBTkQgLyBPUiBsaXN0ZW5lcnMgKFZpc3VhbCBtYWlubHksIG9yIGFwcGVuZGluZyBuZXcgcm93cylcbiAgICBkaXYucXVlcnlTZWxlY3RvcignLmJ0bi1hbmQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGFkZEJ1aWxkZXJSb3codHlwZSk7IC8vIEp1c3QgYWRkIGFub3RoZXIgcm93XG4gICAgfSk7XG5cbiAgICBkaXYucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQsIHNlbGVjdCcpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB1cGRhdGVCcmVhZGNydW1iKTtcbiAgICAgICAgZWwuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCB1cGRhdGVCcmVhZGNydW1iKTtcbiAgICB9KTtcblxuICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChkaXYpO1xuICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbn1cblxuZnVuY3Rpb24gY2xlYXJCdWlsZGVyKCkge1xuICAgIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtbmFtZScpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gJyc7XG4gICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1kZXNjJykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUgPSAnJztcblxuICAgIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtYXV0b3J1bicpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQgPSBmYWxzZTtcbiAgICAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LXNlcGFyYXRlLXdpbmRvdycpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQgPSBmYWxzZTtcblxuICAgIGNvbnN0IHNvcnRHcm91cHNDaGVjayA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtc29ydGdyb3Vwcy1jaGVjaycpIGFzIEhUTUxJbnB1dEVsZW1lbnQpO1xuICAgIGlmIChzb3J0R3JvdXBzQ2hlY2spIHtcbiAgICAgICAgc29ydEdyb3Vwc0NoZWNrLmNoZWNrZWQgPSBmYWxzZTtcbiAgICAgICAgLy8gVHJpZ2dlciBjaGFuZ2UgdG8gaGlkZSBjb250YWluZXJcbiAgICAgICAgc29ydEdyb3Vwc0NoZWNrLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnKSk7XG4gICAgfVxuXG4gICAgY29uc3QgbG9hZFNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdGVneS1sb2FkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgIGlmIChsb2FkU2VsZWN0KSBsb2FkU2VsZWN0LnZhbHVlID0gJyc7XG5cbiAgICBbJ2ZpbHRlci1yb3dzLWNvbnRhaW5lcicsICdncm91cC1yb3dzLWNvbnRhaW5lcicsICdzb3J0LXJvd3MtY29udGFpbmVyJywgJ2dyb3VwLXNvcnQtcm93cy1jb250YWluZXInXS5mb3JFYWNoKGlkID0+IHtcbiAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCk7XG4gICAgICAgIGlmIChlbCkgZWwuaW5uZXJIVE1MID0gJyc7XG4gICAgfSk7XG5cbiAgICBjb25zdCBidWlsZGVyUmVzdWx0cyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidWlsZGVyLXJlc3VsdHMnKTtcbiAgICBpZiAoYnVpbGRlclJlc3VsdHMpIGJ1aWxkZXJSZXN1bHRzLmlubmVySFRNTCA9ICcnO1xuXG4gICAgYWRkRmlsdGVyR3JvdXBSb3coKTsgLy8gUmVzZXQgd2l0aCBvbmUgZW1wdHkgZmlsdGVyIGdyb3VwXG4gICAgdXBkYXRlQnJlYWRjcnVtYigpO1xufVxuXG5mdW5jdGlvbiBleHBvcnRCdWlsZGVyU3RyYXRlZ3koKSB7XG4gICAgY29uc3Qgc3RyYXQgPSBnZXRCdWlsZGVyU3RyYXRlZ3koKTtcbiAgICBpZiAoIXN0cmF0KSB7XG4gICAgICAgIGFsZXJ0KFwiUGxlYXNlIGRlZmluZSBhIHN0cmF0ZWd5IHRvIGV4cG9ydCAoSUQgYW5kIExhYmVsIHJlcXVpcmVkKS5cIik7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbG9nSW5mbyhcIkV4cG9ydGluZyBzdHJhdGVneVwiLCB7IGlkOiBzdHJhdC5pZCB9KTtcbiAgICBjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkoc3RyYXQsIG51bGwsIDIpO1xuICAgIGNvbnN0IGNvbnRlbnQgPSBgXG4gICAgICAgIDxwPkNvcHkgdGhlIEpTT04gYmVsb3c6PC9wPlxuICAgICAgICA8dGV4dGFyZWEgc3R5bGU9XCJ3aWR0aDogMTAwJTsgaGVpZ2h0OiAzMDBweDsgZm9udC1mYW1pbHk6IG1vbm9zcGFjZTtcIj4ke2VzY2FwZUh0bWwoanNvbil9PC90ZXh0YXJlYT5cbiAgICBgO1xuICAgIHNob3dNb2RhbChcIkV4cG9ydCBTdHJhdGVneVwiLCBjb250ZW50KTtcbn1cblxuZnVuY3Rpb24gaW1wb3J0QnVpbGRlclN0cmF0ZWd5KCkge1xuICAgIGNvbnN0IGNvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBjb250ZW50LmlubmVySFRNTCA9IGBcbiAgICAgICAgPHA+UGFzdGUgU3RyYXRlZ3kgSlNPTiBiZWxvdzo8L3A+XG4gICAgICAgIDx0ZXh0YXJlYSBpZD1cImltcG9ydC1zdHJhdC1hcmVhXCIgc3R5bGU9XCJ3aWR0aDogMTAwJTsgaGVpZ2h0OiAyMDBweDsgZm9udC1mYW1pbHk6IG1vbm9zcGFjZTsgbWFyZ2luLWJvdHRvbTogMTBweDtcIj48L3RleHRhcmVhPlxuICAgICAgICA8YnV0dG9uIGlkPVwiaW1wb3J0LXN0cmF0LWNvbmZpcm1cIiBjbGFzcz1cInN1Y2Nlc3MtYnRuXCI+TG9hZDwvYnV0dG9uPlxuICAgIGA7XG5cbiAgICBjb25zdCBidG4gPSBjb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNpbXBvcnQtc3RyYXQtY29uZmlybScpO1xuICAgIGJ0bj8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHR4dCA9IChjb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNpbXBvcnQtc3RyYXQtYXJlYScpIGFzIEhUTUxUZXh0QXJlYUVsZW1lbnQpLnZhbHVlO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QganNvbiA9IEpTT04ucGFyc2UodHh0KTtcbiAgICAgICAgICAgIGlmICghanNvbi5pZCB8fCAhanNvbi5sYWJlbCkge1xuICAgICAgICAgICAgICAgIGFsZXJ0KFwiSW52YWxpZCBzdHJhdGVneTogSUQgYW5kIExhYmVsIGFyZSByZXF1aXJlZC5cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbG9nSW5mbyhcIkltcG9ydGluZyBzdHJhdGVneVwiLCB7IGlkOiBqc29uLmlkIH0pO1xuICAgICAgICAgICAgcG9wdWxhdGVCdWlsZGVyRnJvbVN0cmF0ZWd5KGpzb24pO1xuICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm1vZGFsLW92ZXJsYXknKT8ucmVtb3ZlKCk7XG4gICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgYWxlcnQoXCJJbnZhbGlkIEpTT046IFwiICsgZSk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHNob3dNb2RhbChcIkltcG9ydCBTdHJhdGVneVwiLCBjb250ZW50KTtcbn1cblxuZnVuY3Rpb24gZXhwb3J0QWxsU3RyYXRlZ2llcygpIHtcbiAgICBsb2dJbmZvKFwiRXhwb3J0aW5nIGFsbCBzdHJhdGVnaWVzXCIsIHsgY291bnQ6IGxvY2FsQ3VzdG9tU3RyYXRlZ2llcy5sZW5ndGggfSk7XG4gICAgY29uc3QganNvbiA9IEpTT04uc3RyaW5naWZ5KGxvY2FsQ3VzdG9tU3RyYXRlZ2llcywgbnVsbCwgMik7XG4gICAgY29uc3QgY29udGVudCA9IGBcbiAgICAgICAgPHA+Q29weSB0aGUgSlNPTiBiZWxvdyAoY29udGFpbnMgJHtsb2NhbEN1c3RvbVN0cmF0ZWdpZXMubGVuZ3RofSBzdHJhdGVnaWVzKTo8L3A+XG4gICAgICAgIDx0ZXh0YXJlYSBzdHlsZT1cIndpZHRoOiAxMDAlOyBoZWlnaHQ6IDMwMHB4OyBmb250LWZhbWlseTogbW9ub3NwYWNlO1wiPiR7ZXNjYXBlSHRtbChqc29uKX08L3RleHRhcmVhPlxuICAgIGA7XG4gICAgc2hvd01vZGFsKFwiRXhwb3J0IEFsbCBTdHJhdGVnaWVzXCIsIGNvbnRlbnQpO1xufVxuXG5mdW5jdGlvbiBpbXBvcnRBbGxTdHJhdGVnaWVzKCkge1xuICAgIGNvbnN0IGNvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBjb250ZW50LmlubmVySFRNTCA9IGBcbiAgICAgICAgPHA+UGFzdGUgU3RyYXRlZ3kgTGlzdCBKU09OIGJlbG93OjwvcD5cbiAgICAgICAgPHAgc3R5bGU9XCJmb250LXNpemU6IDAuOWVtOyBjb2xvcjogIzY2NjtcIj5Ob3RlOiBTdHJhdGVnaWVzIHdpdGggbWF0Y2hpbmcgSURzIHdpbGwgYmUgb3ZlcndyaXR0ZW4uPC9wPlxuICAgICAgICA8dGV4dGFyZWEgaWQ9XCJpbXBvcnQtYWxsLWFyZWFcIiBzdHlsZT1cIndpZHRoOiAxMDAlOyBoZWlnaHQ6IDIwMHB4OyBmb250LWZhbWlseTogbW9ub3NwYWNlOyBtYXJnaW4tYm90dG9tOiAxMHB4O1wiPjwvdGV4dGFyZWE+XG4gICAgICAgIDxidXR0b24gaWQ9XCJpbXBvcnQtYWxsLWNvbmZpcm1cIiBjbGFzcz1cInN1Y2Nlc3MtYnRuXCI+SW1wb3J0IEFsbDwvYnV0dG9uPlxuICAgIGA7XG5cbiAgICBjb25zdCBidG4gPSBjb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNpbXBvcnQtYWxsLWNvbmZpcm0nKTtcbiAgICBidG4/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgYXN5bmMgKCkgPT4ge1xuICAgICAgICBjb25zdCB0eHQgPSAoY29udGVudC5xdWVyeVNlbGVjdG9yKCcjaW1wb3J0LWFsbC1hcmVhJykgYXMgSFRNTFRleHRBcmVhRWxlbWVudCkudmFsdWU7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBqc29uID0gSlNPTi5wYXJzZSh0eHQpO1xuICAgICAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGpzb24pKSB7XG4gICAgICAgICAgICAgICAgYWxlcnQoXCJJbnZhbGlkIGZvcm1hdDogRXhwZWN0ZWQgYW4gYXJyYXkgb2Ygc3RyYXRlZ2llcy5cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBWYWxpZGF0ZSBpdGVtc1xuICAgICAgICAgICAgY29uc3QgaW52YWxpZCA9IGpzb24uZmluZChzID0+ICFzLmlkIHx8ICFzLmxhYmVsKTtcbiAgICAgICAgICAgIGlmIChpbnZhbGlkKSB7XG4gICAgICAgICAgICAgICAgYWxlcnQoXCJJbnZhbGlkIHN0cmF0ZWd5IGluIGxpc3Q6IG1pc3NpbmcgSUQgb3IgTGFiZWwuXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gTWVyZ2UgbG9naWMgKFVwc2VydClcbiAgICAgICAgICAgIGNvbnN0IHN0cmF0TWFwID0gbmV3IE1hcChsb2NhbEN1c3RvbVN0cmF0ZWdpZXMubWFwKHMgPT4gW3MuaWQsIHNdKSk7XG5cbiAgICAgICAgICAgIGxldCBjb3VudCA9IDA7XG4gICAgICAgICAgICBqc29uLmZvckVhY2goKHM6IEN1c3RvbVN0cmF0ZWd5KSA9PiB7XG4gICAgICAgICAgICAgICAgc3RyYXRNYXAuc2V0KHMuaWQsIHMpO1xuICAgICAgICAgICAgICAgIGNvdW50Kys7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgY29uc3QgbmV3U3RyYXRlZ2llcyA9IEFycmF5LmZyb20oc3RyYXRNYXAudmFsdWVzKCkpO1xuXG4gICAgICAgICAgICBsb2dJbmZvKFwiSW1wb3J0aW5nIGFsbCBzdHJhdGVnaWVzXCIsIHsgY291bnQ6IG5ld1N0cmF0ZWdpZXMubGVuZ3RoIH0pO1xuXG4gICAgICAgICAgICAvLyBTYXZlXG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3NhdmVQcmVmZXJlbmNlcycsXG4gICAgICAgICAgICAgICAgcGF5bG9hZDogeyBjdXN0b21TdHJhdGVnaWVzOiBuZXdTdHJhdGVnaWVzIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBVcGRhdGUgbG9jYWwgc3RhdGVcbiAgICAgICAgICAgIGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyA9IG5ld1N0cmF0ZWdpZXM7XG4gICAgICAgICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyk7XG5cbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TG9hZE9wdGlvbnMoKTtcbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TGlzdFRhYmxlKCk7XG4gICAgICAgICAgICByZW5kZXJBbGdvcml0aG1zVmlldygpO1xuXG4gICAgICAgICAgICBhbGVydChgSW1wb3J0ZWQgJHtjb3VudH0gc3RyYXRlZ2llcy5gKTtcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5tb2RhbC1vdmVybGF5Jyk/LnJlbW92ZSgpO1xuXG4gICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgYWxlcnQoXCJJbnZhbGlkIEpTT046IFwiICsgZSk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHNob3dNb2RhbChcIkltcG9ydCBBbGwgU3RyYXRlZ2llc1wiLCBjb250ZW50KTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlQnJlYWRjcnVtYigpIHtcbiAgICBjb25zdCBicmVhZGNydW1iID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0ZWd5LWJyZWFkY3J1bWInKTtcbiAgICBpZiAoIWJyZWFkY3J1bWIpIHJldHVybjtcblxuICAgIGxldCB0ZXh0ID0gJ0FsbCc7XG5cbiAgICAvLyBGaWx0ZXJzXG4gICAgY29uc3QgZmlsdGVycyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmaWx0ZXItcm93cy1jb250YWluZXInKT8ucXVlcnlTZWxlY3RvckFsbCgnLmJ1aWxkZXItcm93Jyk7XG4gICAgaWYgKGZpbHRlcnMgJiYgZmlsdGVycy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGZpbHRlcnMuZm9yRWFjaChyb3cgPT4ge1xuICAgICAgICAgICAgIGNvbnN0IGZpZWxkID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgIGNvbnN0IG9wID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcub3BlcmF0b3Itc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgIGNvbnN0IHZhbCA9IChyb3cucXVlcnlTZWxlY3RvcignLnZhbHVlLWlucHV0JykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgaWYgKHZhbCkgdGV4dCArPSBgID4gJHtmaWVsZH0gJHtvcH0gJHt2YWx9YDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gR3JvdXBzXG4gICAgY29uc3QgZ3JvdXBzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dyb3VwLXJvd3MtY29udGFpbmVyJyk/LnF1ZXJ5U2VsZWN0b3JBbGwoJy5idWlsZGVyLXJvdycpO1xuICAgIGlmIChncm91cHMgJiYgZ3JvdXBzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgZ3JvdXBzLmZvckVhY2gocm93ID0+IHtcbiAgICAgICAgICAgICBjb25zdCBzb3VyY2UgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5zb3VyY2Utc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgIGxldCB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgIGlmIChzb3VyY2UgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICAgdmFsID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQtZmllbGQnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgICAgIHRleHQgKz0gYCA+IEdyb3VwIGJ5IEZpZWxkOiAke3ZhbH1gO1xuICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgIHZhbCA9IChyb3cucXVlcnlTZWxlY3RvcignLnZhbHVlLWlucHV0LXRleHQnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICAgICAgdGV4dCArPSBgID4gR3JvdXAgYnkgTmFtZTogXCIke3ZhbH1cImA7XG4gICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBHcm91cCBTb3J0c1xuICAgIGNvbnN0IGdyb3VwU29ydHMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JvdXAtc29ydC1yb3dzLWNvbnRhaW5lcicpPy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKTtcbiAgICBpZiAoZ3JvdXBTb3J0cyAmJiBncm91cFNvcnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgZ3JvdXBTb3J0cy5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgICAgICBjb25zdCBmaWVsZCA9IChyb3cucXVlcnlTZWxlY3RvcignLmZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgIGNvbnN0IG9yZGVyID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcub3JkZXItc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgdGV4dCArPSBgID4gR3JvdXAgc29ydCBieSAke2ZpZWxkfSAoJHtvcmRlcn0pYDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gU29ydHNcbiAgICBjb25zdCBzb3J0cyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzb3J0LXJvd3MtY29udGFpbmVyJyk/LnF1ZXJ5U2VsZWN0b3JBbGwoJy5idWlsZGVyLXJvdycpO1xuICAgIGlmIChzb3J0cyAmJiBzb3J0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHNvcnRzLmZvckVhY2gocm93ID0+IHtcbiAgICAgICAgICAgICBjb25zdCBmaWVsZCA9IChyb3cucXVlcnlTZWxlY3RvcignLmZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICBjb25zdCBvcmRlciA9IChyb3cucXVlcnlTZWxlY3RvcignLm9yZGVyLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICB0ZXh0ICs9IGAgPiBTb3J0IGJ5ICR7ZmllbGR9ICgke29yZGVyfSlgO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBicmVhZGNydW1iLnRleHRDb250ZW50ID0gdGV4dDtcbn1cblxuZnVuY3Rpb24gZ2V0QnVpbGRlclN0cmF0ZWd5KGlnbm9yZVZhbGlkYXRpb246IGJvb2xlYW4gPSBmYWxzZSk6IEN1c3RvbVN0cmF0ZWd5IHwgbnVsbCB7XG4gICAgY29uc3QgaWRJbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1uYW1lJykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICBjb25zdCBsYWJlbElucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LWRlc2MnKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuXG4gICAgbGV0IGlkID0gaWRJbnB1dCA/IGlkSW5wdXQudmFsdWUudHJpbSgpIDogJyc7XG4gICAgbGV0IGxhYmVsID0gbGFiZWxJbnB1dCA/IGxhYmVsSW5wdXQudmFsdWUudHJpbSgpIDogJyc7XG4gICAgY29uc3QgZmFsbGJhY2sgPSAnTWlzYyc7IC8vIEZhbGxiYWNrIHJlbW92ZWQgZnJvbSBVSSwgZGVmYXVsdCB0byBNaXNjXG4gICAgY29uc3Qgc29ydEdyb3VwcyA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtc29ydGdyb3Vwcy1jaGVjaycpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQ7XG5cbiAgICBpZiAoIWlnbm9yZVZhbGlkYXRpb24gJiYgKCFpZCB8fCAhbGFiZWwpKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGlmIChpZ25vcmVWYWxpZGF0aW9uKSB7XG4gICAgICAgIGlmICghaWQpIGlkID0gJ3RlbXBfc2ltX2lkJztcbiAgICAgICAgaWYgKCFsYWJlbCkgbGFiZWwgPSAnU2ltdWxhdGlvbic7XG4gICAgfVxuXG4gICAgY29uc3QgZmlsdGVyR3JvdXBzOiBSdWxlQ29uZGl0aW9uW11bXSA9IFtdO1xuICAgIGNvbnN0IGZpbHRlckNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmaWx0ZXItcm93cy1jb250YWluZXInKTtcblxuICAgIC8vIFBhcnNlIGZpbHRlciBncm91cHNcbiAgICBpZiAoZmlsdGVyQ29udGFpbmVyKSB7XG4gICAgICAgIGNvbnN0IGdyb3VwUm93cyA9IGZpbHRlckNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcuZmlsdGVyLWdyb3VwLXJvdycpO1xuICAgICAgICBpZiAoZ3JvdXBSb3dzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGdyb3VwUm93cy5mb3JFYWNoKGdyb3VwUm93ID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjb25kaXRpb25zOiBSdWxlQ29uZGl0aW9uW10gPSBbXTtcbiAgICAgICAgICAgICAgICBncm91cFJvdy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKS5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpZWxkID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBvcGVyYXRvciA9IChyb3cucXVlcnlTZWxlY3RvcignLm9wZXJhdG9yLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZSBhcyBhbnk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgLy8gT25seSBhZGQgaWYgdmFsdWUgaXMgcHJlc2VudCBvciBvcGVyYXRvciBkb2Vzbid0IHJlcXVpcmUgaXRcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlIHx8IFsnZXhpc3RzJywgJ2RvZXNOb3RFeGlzdCcsICdpc051bGwnLCAnaXNOb3ROdWxsJ10uaW5jbHVkZXMob3BlcmF0b3IpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25kaXRpb25zLnB1c2goeyBmaWVsZCwgb3BlcmF0b3IsIHZhbHVlIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKGNvbmRpdGlvbnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJHcm91cHMucHVzaChjb25kaXRpb25zKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5IC8gc2ltcGxlIHN0cmF0ZWdpZXMsIHBvcHVsYXRlIGZpbHRlcnMgd2l0aCB0aGUgZmlyc3QgZ3JvdXBcbiAgICBjb25zdCBmaWx0ZXJzOiBSdWxlQ29uZGl0aW9uW10gPSBmaWx0ZXJHcm91cHMubGVuZ3RoID4gMCA/IGZpbHRlckdyb3Vwc1swXSA6IFtdO1xuXG4gICAgY29uc3QgZ3JvdXBpbmdSdWxlczogR3JvdXBpbmdSdWxlW10gPSBbXTtcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JvdXAtcm93cy1jb250YWluZXInKT8ucXVlcnlTZWxlY3RvckFsbCgnLmJ1aWxkZXItcm93JykuZm9yRWFjaChyb3cgPT4ge1xuICAgICAgICBjb25zdCBzb3VyY2UgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5zb3VyY2Utc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlIGFzIFwiZmllbGRcIiB8IFwiZml4ZWRcIjtcbiAgICAgICAgbGV0IHZhbHVlID0gXCJcIjtcbiAgICAgICAgaWYgKHNvdXJjZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgdmFsdWUgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC1maWVsZCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQtdGV4dCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdHJhbnNmb3JtID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudHJhbnNmb3JtLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZSBhcyBhbnk7XG4gICAgICAgIGNvbnN0IHRyYW5zZm9ybVBhdHRlcm4gPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy50cmFuc2Zvcm0tcGF0dGVybicpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICBjb25zdCB3aW5kb3dNb2RlID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcud2luZG93LW1vZGUtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlIGFzIGFueTtcblxuICAgICAgICBjb25zdCByYW5kb21DaGVjayA9IHJvdy5xdWVyeVNlbGVjdG9yKCcucmFuZG9tLWNvbG9yLWNoZWNrJykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JJbnB1dCA9IHJvdy5xdWVyeVNlbGVjdG9yKCcuY29sb3ItaW5wdXQnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JGaWVsZFNlbGVjdCA9IHJvdy5xdWVyeVNlbGVjdG9yKCcuY29sb3ItZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG5cbiAgICAgICAgbGV0IGNvbG9yID0gJ3JhbmRvbSc7XG4gICAgICAgIGxldCBjb2xvckZpZWxkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgICAgICAgaWYgKCFyYW5kb21DaGVjay5jaGVja2VkKSB7XG4gICAgICAgICAgICBjb2xvciA9IGNvbG9ySW5wdXQudmFsdWU7XG4gICAgICAgICAgICBpZiAoY29sb3IgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICBjb2xvckZpZWxkID0gY29sb3JGaWVsZFNlbGVjdC52YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgZ3JvdXBpbmdSdWxlcy5wdXNoKHsgc291cmNlLCB2YWx1ZSwgY29sb3IsIGNvbG9yRmllbGQsIHRyYW5zZm9ybSwgdHJhbnNmb3JtUGF0dGVybjogdHJhbnNmb3JtID09PSAncmVnZXgnID8gdHJhbnNmb3JtUGF0dGVybiA6IHVuZGVmaW5lZCwgd2luZG93TW9kZSB9KTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29uc3Qgc29ydGluZ1J1bGVzOiBTb3J0aW5nUnVsZVtdID0gW107XG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NvcnQtcm93cy1jb250YWluZXInKT8ucXVlcnlTZWxlY3RvckFsbCgnLmJ1aWxkZXItcm93JykuZm9yRWFjaChyb3cgPT4ge1xuICAgICAgICBjb25zdCBmaWVsZCA9IChyb3cucXVlcnlTZWxlY3RvcignLmZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgY29uc3Qgb3JkZXIgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5vcmRlci1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgYXMgYW55O1xuICAgICAgICBzb3J0aW5nUnVsZXMucHVzaCh7IGZpZWxkLCBvcmRlciB9KTtcbiAgICB9KTtcblxuICAgIGNvbnN0IGdyb3VwU29ydGluZ1J1bGVzOiBTb3J0aW5nUnVsZVtdID0gW107XG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dyb3VwLXNvcnQtcm93cy1jb250YWluZXInKT8ucXVlcnlTZWxlY3RvckFsbCgnLmJ1aWxkZXItcm93JykuZm9yRWFjaChyb3cgPT4ge1xuICAgICAgICBjb25zdCBmaWVsZCA9IChyb3cucXVlcnlTZWxlY3RvcignLmZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgY29uc3Qgb3JkZXIgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5vcmRlci1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgYXMgYW55O1xuICAgICAgICBncm91cFNvcnRpbmdSdWxlcy5wdXNoKHsgZmllbGQsIG9yZGVyIH0pO1xuICAgIH0pO1xuICAgIGNvbnN0IGFwcGxpZWRHcm91cFNvcnRpbmdSdWxlcyA9IHNvcnRHcm91cHMgPyBncm91cFNvcnRpbmdSdWxlcyA6IFtdO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgaWQsXG4gICAgICAgIGxhYmVsLFxuICAgICAgICBmaWx0ZXJzLFxuICAgICAgICBmaWx0ZXJHcm91cHMsXG4gICAgICAgIGdyb3VwaW5nUnVsZXMsXG4gICAgICAgIHNvcnRpbmdSdWxlcyxcbiAgICAgICAgZ3JvdXBTb3J0aW5nUnVsZXM6IGFwcGxpZWRHcm91cFNvcnRpbmdSdWxlcyxcbiAgICAgICAgZmFsbGJhY2ssXG4gICAgICAgIHNvcnRHcm91cHNcbiAgICB9O1xufVxuXG5mdW5jdGlvbiBydW5CdWlsZGVyU2ltdWxhdGlvbigpIHtcbiAgICAvLyBQYXNzIHRydWUgdG8gaWdub3JlIHZhbGlkYXRpb24gc28gd2UgY2FuIHNpbXVsYXRlIHdpdGhvdXQgSUQvTGFiZWxcbiAgICBjb25zdCBzdHJhdCA9IGdldEJ1aWxkZXJTdHJhdGVneSh0cnVlKTtcbiAgICBjb25zdCByZXN1bHRDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1yZXN1bHRzJyk7XG4gICAgY29uc3QgbmV3U3RhdGVQYW5lbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduZXctc3RhdGUtcGFuZWwnKTtcblxuICAgIGlmICghc3RyYXQpIHJldHVybjsgLy8gU2hvdWxkIG5vdCBoYXBwZW4gd2l0aCBpZ25vcmVWYWxpZGF0aW9uPXRydWVcblxuICAgIGxvZ0luZm8oXCJSdW5uaW5nIGJ1aWxkZXIgc2ltdWxhdGlvblwiLCB7IHN0cmF0ZWd5OiBzdHJhdC5pZCB9KTtcblxuICAgIC8vIEZvciBzaW11bGF0aW9uLCB3ZSBjYW4gbW9jayBhbiBJRC9MYWJlbCBpZiBtaXNzaW5nXG4gICAgY29uc3Qgc2ltU3RyYXQ6IEN1c3RvbVN0cmF0ZWd5ID0gc3RyYXQ7XG5cbiAgICBpZiAoIXJlc3VsdENvbnRhaW5lciB8fCAhbmV3U3RhdGVQYW5lbCkgcmV0dXJuO1xuXG4gICAgLy8gU2hvdyB0aGUgcGFuZWxcbiAgICBuZXdTdGF0ZVBhbmVsLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cbiAgICAvLyBVcGRhdGUgbG9jYWxDdXN0b21TdHJhdGVnaWVzIHRlbXBvcmFyaWx5IGZvciBTaW1cbiAgICBjb25zdCBvcmlnaW5hbFN0cmF0ZWdpZXMgPSBbLi4ubG9jYWxDdXN0b21TdHJhdGVnaWVzXTtcblxuICAgIHRyeSB7XG4gICAgICAgIC8vIFJlcGxhY2Ugb3IgYWRkXG4gICAgICAgIGNvbnN0IGV4aXN0aW5nSWR4ID0gbG9jYWxDdXN0b21TdHJhdGVnaWVzLmZpbmRJbmRleChzID0+IHMuaWQgPT09IHNpbVN0cmF0LmlkKTtcbiAgICAgICAgaWYgKGV4aXN0aW5nSWR4ICE9PSAtMSkge1xuICAgICAgICAgICAgbG9jYWxDdXN0b21TdHJhdGVnaWVzW2V4aXN0aW5nSWR4XSA9IHNpbVN0cmF0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbG9jYWxDdXN0b21TdHJhdGVnaWVzLnB1c2goc2ltU3RyYXQpO1xuICAgICAgICB9XG4gICAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMobG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcblxuICAgICAgICAvLyBSdW4gTG9naWNcbiAgICAgICAgbGV0IHRhYnMgPSBnZXRNYXBwZWRUYWJzKCk7XG5cbiAgICAgICAgaWYgKHRhYnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICByZXN1bHRDb250YWluZXIuaW5uZXJIVE1MID0gJzxwPk5vIHRhYnMgZm91bmQgdG8gc2ltdWxhdGUuPC9wPic7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBBcHBseSBTaW11bGF0ZWQgU2VsZWN0aW9uIE92ZXJyaWRlXG4gICAgICAgIGlmIChzaW11bGF0ZWRTZWxlY3Rpb24uc2l6ZSA+IDApIHtcbiAgICAgICAgICAgIHRhYnMgPSB0YWJzLm1hcCh0ID0+ICh7XG4gICAgICAgICAgICAgICAgLi4udCxcbiAgICAgICAgICAgICAgICBzZWxlY3RlZDogc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKVxuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU29ydCB1c2luZyB0aGlzIHN0cmF0ZWd5P1xuICAgICAgICAvLyBzb3J0VGFicyBleHBlY3RzIFNvcnRpbmdTdHJhdGVneVtdLlxuICAgICAgICAvLyBJZiB3ZSB1c2UgdGhpcyBzdHJhdGVneSBmb3Igc29ydGluZy4uLlxuICAgICAgICB0YWJzID0gc29ydFRhYnModGFicywgW3NpbVN0cmF0LmlkXSk7XG5cbiAgICAgICAgLy8gR3JvdXAgdXNpbmcgdGhpcyBzdHJhdGVneVxuICAgICAgICBjb25zdCBncm91cHMgPSBncm91cFRhYnModGFicywgW3NpbVN0cmF0LmlkXSk7XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgd2Ugc2hvdWxkIHNob3cgYSBmYWxsYmFjayByZXN1bHQgKGUuZy4gU29ydCBPbmx5KVxuICAgICAgICAvLyBJZiBubyBncm91cHMgd2VyZSBjcmVhdGVkLCBidXQgd2UgaGF2ZSB0YWJzLCBhbmQgdGhlIHN0cmF0ZWd5IGlzIG5vdCBhIGdyb3VwaW5nIHN0cmF0ZWd5LFxuICAgICAgICAvLyB3ZSBzaG93IHRoZSB0YWJzIGFzIGEgc2luZ2xlIGxpc3QuXG4gICAgICAgIGlmIChncm91cHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBjb25zdCBzdHJhdERlZiA9IGdldFN0cmF0ZWdpZXMobG9jYWxDdXN0b21TdHJhdGVnaWVzKS5maW5kKHMgPT4gcy5pZCA9PT0gc2ltU3RyYXQuaWQpO1xuICAgICAgICAgICAgaWYgKHN0cmF0RGVmICYmICFzdHJhdERlZi5pc0dyb3VwaW5nKSB7XG4gICAgICAgICAgICAgICAgZ3JvdXBzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBpZDogJ3NpbS1zb3J0ZWQnLFxuICAgICAgICAgICAgICAgICAgICB3aW5kb3dJZDogMCxcbiAgICAgICAgICAgICAgICAgICAgbGFiZWw6ICdTb3J0ZWQgUmVzdWx0cyAoTm8gR3JvdXBpbmcpJyxcbiAgICAgICAgICAgICAgICAgICAgY29sb3I6ICdncmV5JyxcbiAgICAgICAgICAgICAgICAgICAgdGFiczogdGFicyxcbiAgICAgICAgICAgICAgICAgICAgcmVhc29uOiAnU29ydCBPbmx5J1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVuZGVyIFJlc3VsdHNcbiAgICAgICAgaWYgKGdyb3Vwcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJlc3VsdENvbnRhaW5lci5pbm5lckhUTUwgPSAnPHA+Tm8gZ3JvdXBzIGNyZWF0ZWQuPC9wPic7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICByZXN1bHRDb250YWluZXIuaW5uZXJIVE1MID0gZ3JvdXBzLm1hcChncm91cCA9PiBgXG4gICAgPGRpdiBjbGFzcz1cImdyb3VwLXJlc3VsdFwiIHN0eWxlPVwibWFyZ2luLWJvdHRvbTogMTBweDsgYm9yZGVyOiAxcHggc29saWQgI2RkZDsgYm9yZGVyLXJhZGl1czogNHB4OyBvdmVyZmxvdzogaGlkZGVuO1wiPlxuICAgICAgPGRpdiBjbGFzcz1cImdyb3VwLWhlYWRlclwiIHN0eWxlPVwiYm9yZGVyLWxlZnQ6IDVweCBzb2xpZCAke2dyb3VwLmNvbG9yfTsgcGFkZGluZzogNXB4OyBiYWNrZ3JvdW5kOiAjZjhmOWZhOyBmb250LXNpemU6IDAuOWVtOyBmb250LXdlaWdodDogYm9sZDsgZGlzcGxheTogZmxleDsganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuO1wiPlxuICAgICAgICA8c3Bhbj4ke2VzY2FwZUh0bWwoZ3JvdXAubGFiZWwgfHwgJ1VuZ3JvdXBlZCcpfTwvc3Bhbj5cbiAgICAgICAgPHNwYW4gY2xhc3M9XCJncm91cC1tZXRhXCIgc3R5bGU9XCJmb250LXdlaWdodDogbm9ybWFsOyBmb250LXNpemU6IDAuOGVtOyBjb2xvcjogIzY2NjtcIj4ke2dyb3VwLnRhYnMubGVuZ3RofTwvc3Bhbj5cbiAgICAgIDwvZGl2PlxuICAgICAgPHVsIGNsYXNzPVwiZ3JvdXAtdGFic1wiIHN0eWxlPVwibGlzdC1zdHlsZTogbm9uZTsgbWFyZ2luOiAwOyBwYWRkaW5nOiAwO1wiPlxuICAgICAgICAke2dyb3VwLnRhYnMubWFwKHRhYiA9PiBgXG4gICAgICAgICAgPGxpIGNsYXNzPVwiZ3JvdXAtdGFiLWl0ZW1cIiBzdHlsZT1cInBhZGRpbmc6IDRweCA1cHg7IGJvcmRlci10b3A6IDFweCBzb2xpZCAjZWVlOyBkaXNwbGF5OiBmbGV4OyBnYXA6IDVweDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZm9udC1zaXplOiAwLjg1ZW07XCI+XG4gICAgICAgICAgICA8ZGl2IHN0eWxlPVwid2lkdGg6IDEycHg7IGhlaWdodDogMTJweDsgYmFja2dyb3VuZDogI2VlZTsgYm9yZGVyLXJhZGl1czogMnB4OyBmbGV4LXNocmluazogMDtcIj5cbiAgICAgICAgICAgICAgICAke3RhYi5mYXZJY29uVXJsID8gYDxpbWcgc3JjPVwiJHtlc2NhcGVIdG1sKHRhYi5mYXZJY29uVXJsKX1cIiBzdHlsZT1cIndpZHRoOiAxMDAlOyBoZWlnaHQ6IDEwMCU7IG9iamVjdC1maXQ6IGNvdmVyO1wiIG9uZXJyb3I9XCJ0aGlzLnN0eWxlLmRpc3BsYXk9J25vbmUnXCI+YCA6ICcnfVxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cInRpdGxlLWNlbGxcIiB0aXRsZT1cIiR7ZXNjYXBlSHRtbCh0YWIudGl0bGUpfVwiIHN0eWxlPVwid2hpdGUtc3BhY2U6IG5vd3JhcDsgb3ZlcmZsb3c6IGhpZGRlbjsgdGV4dC1vdmVyZmxvdzogZWxsaXBzaXM7XCI+JHtlc2NhcGVIdG1sKHRhYi50aXRsZSl9PC9zcGFuPlxuICAgICAgICAgIDwvbGk+XG4gICAgICAgIGApLmpvaW4oJycpfVxuICAgICAgPC91bD5cbiAgICA8L2Rpdj5cbiAgYCkuam9pbignJyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiU2ltdWxhdGlvbiBmYWlsZWRcIiwgZSk7XG4gICAgICAgIHJlc3VsdENvbnRhaW5lci5pbm5lckhUTUwgPSBgPHAgc3R5bGU9XCJjb2xvcjogcmVkO1wiPlNpbXVsYXRpb24gZmFpbGVkOiAke2V9PC9wPmA7XG4gICAgICAgIGFsZXJ0KFwiU2ltdWxhdGlvbiBmYWlsZWQ6IFwiICsgZSk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgICAgLy8gUmVzdG9yZSBzdHJhdGVnaWVzXG4gICAgICAgIGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyA9IG9yaWdpbmFsU3RyYXRlZ2llcztcbiAgICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhsb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gc2F2ZUN1c3RvbVN0cmF0ZWd5RnJvbUJ1aWxkZXIoc2hvd1N1Y2Nlc3MgPSB0cnVlKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3Qgc3RyYXQgPSBnZXRCdWlsZGVyU3RyYXRlZ3koKTtcbiAgICBpZiAoIXN0cmF0KSB7XG4gICAgICAgIGFsZXJ0KFwiUGxlYXNlIGZpbGwgaW4gSUQgYW5kIExhYmVsLlwiKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gc2F2ZVN0cmF0ZWd5KHN0cmF0LCBzaG93U3VjY2Vzcyk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHNhdmVTdHJhdGVneShzdHJhdDogQ3VzdG9tU3RyYXRlZ3ksIHNob3dTdWNjZXNzOiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgdHJ5IHtcbiAgICAgICAgbG9nSW5mbyhcIlNhdmluZyBzdHJhdGVneVwiLCB7IGlkOiBzdHJhdC5pZCB9KTtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2FkUHJlZmVyZW5jZXMnIH0pO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgICAgICAgY29uc3QgcHJlZnMgPSByZXNwb25zZS5kYXRhIGFzIFByZWZlcmVuY2VzO1xuICAgICAgICAgICAgbGV0IGN1cnJlbnRTdHJhdGVnaWVzID0gcHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXTtcblxuICAgICAgICAgICAgLy8gRmluZCBleGlzdGluZyB0byBwcmVzZXJ2ZSBwcm9wcyAobGlrZSBhdXRvUnVuKVxuICAgICAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBjdXJyZW50U3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXQuaWQpO1xuICAgICAgICAgICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICAgICAgICAgICAgc3RyYXQuYXV0b1J1biA9IGV4aXN0aW5nLmF1dG9SdW47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFJlbW92ZSBleGlzdGluZyBpZiBzYW1lIElEXG4gICAgICAgICAgICBjdXJyZW50U3RyYXRlZ2llcyA9IGN1cnJlbnRTdHJhdGVnaWVzLmZpbHRlcihzID0+IHMuaWQgIT09IHN0cmF0LmlkKTtcbiAgICAgICAgICAgIGN1cnJlbnRTdHJhdGVnaWVzLnB1c2goc3RyYXQpO1xuXG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3NhdmVQcmVmZXJlbmNlcycsXG4gICAgICAgICAgICAgICAgcGF5bG9hZDogeyBjdXN0b21TdHJhdGVnaWVzOiBjdXJyZW50U3RyYXRlZ2llcyB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgbG9jYWxDdXN0b21TdHJhdGVnaWVzID0gY3VycmVudFN0cmF0ZWdpZXM7XG4gICAgICAgICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyk7XG5cbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TG9hZE9wdGlvbnMoKTtcbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TGlzdFRhYmxlKCk7XG4gICAgICAgICAgICByZW5kZXJBbGdvcml0aG1zVmlldygpO1xuICAgICAgICAgICAgaWYgKHNob3dTdWNjZXNzKSBhbGVydChcIlN0cmF0ZWd5IHNhdmVkIVwiKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gc2F2ZSBzdHJhdGVneVwiLCBlKTtcbiAgICAgICAgYWxlcnQoXCJFcnJvciBzYXZpbmcgc3RyYXRlZ3lcIik7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJ1bkJ1aWxkZXJMaXZlKCkge1xuICAgIGNvbnN0IHN0cmF0ID0gZ2V0QnVpbGRlclN0cmF0ZWd5KCk7XG4gICAgaWYgKCFzdHJhdCkge1xuICAgICAgICBhbGVydChcIlBsZWFzZSBmaWxsIGluIElEIGFuZCBMYWJlbCB0byBydW4gbGl2ZS5cIik7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsb2dJbmZvKFwiQXBwbHlpbmcgc3RyYXRlZ3kgbGl2ZVwiLCB7IGlkOiBzdHJhdC5pZCB9KTtcblxuICAgIC8vIFNhdmUgc2lsZW50bHkgZmlyc3QgdG8gZW5zdXJlIGJhY2tlbmQgaGFzIHRoZSBkZWZpbml0aW9uXG4gICAgY29uc3Qgc2F2ZWQgPSBhd2FpdCBzYXZlU3RyYXRlZ3koc3RyYXQsIGZhbHNlKTtcbiAgICBpZiAoIXNhdmVkKSByZXR1cm47XG5cbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgIHR5cGU6ICdhcHBseUdyb3VwaW5nJyxcbiAgICAgICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICAgICAgICBzb3J0aW5nOiBbc3RyYXQuaWRdXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vaykge1xuICAgICAgICAgICAgYWxlcnQoXCJBcHBsaWVkIHN1Y2Nlc3NmdWxseSFcIik7XG4gICAgICAgICAgICBsb2FkVGFicygpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYWxlcnQoXCJGYWlsZWQgdG8gYXBwbHk6IFwiICsgKHJlc3BvbnNlLmVycm9yIHx8ICdVbmtub3duIGVycm9yJykpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiQXBwbHkgZmFpbGVkXCIsIGUpO1xuICAgICAgICBhbGVydChcIkFwcGx5IGZhaWxlZDogXCIgKyBlKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHBvcHVsYXRlQnVpbGRlckZyb21TdHJhdGVneShzdHJhdDogQ3VzdG9tU3RyYXRlZ3kpIHtcbiAgICAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LW5hbWUnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSA9IHN0cmF0LmlkO1xuICAgIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtZGVzYycpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gc3RyYXQubGFiZWw7XG5cbiAgICBjb25zdCBzb3J0R3JvdXBzQ2hlY2sgPSAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LXNvcnRncm91cHMtY2hlY2snKSBhcyBIVE1MSW5wdXRFbGVtZW50KTtcbiAgICBjb25zdCBoYXNHcm91cFNvcnQgPSAhIShzdHJhdC5ncm91cFNvcnRpbmdSdWxlcyAmJiBzdHJhdC5ncm91cFNvcnRpbmdSdWxlcy5sZW5ndGggPiAwKSB8fCAhIXN0cmF0LnNvcnRHcm91cHM7XG4gICAgc29ydEdyb3Vwc0NoZWNrLmNoZWNrZWQgPSBoYXNHcm91cFNvcnQ7XG4gICAgc29ydEdyb3Vwc0NoZWNrLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnKSk7XG5cbiAgICBjb25zdCBhdXRvUnVuQ2hlY2sgPSAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LWF1dG9ydW4nKSBhcyBIVE1MSW5wdXRFbGVtZW50KTtcbiAgICBhdXRvUnVuQ2hlY2suY2hlY2tlZCA9ICEhc3RyYXQuYXV0b1J1bjtcblxuICAgIFsnZmlsdGVyLXJvd3MtY29udGFpbmVyJywgJ2dyb3VwLXJvd3MtY29udGFpbmVyJywgJ3NvcnQtcm93cy1jb250YWluZXInLCAnZ3JvdXAtc29ydC1yb3dzLWNvbnRhaW5lciddLmZvckVhY2goaWQgPT4ge1xuICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKTtcbiAgICAgICAgaWYgKGVsKSBlbC5pbm5lckhUTUwgPSAnJztcbiAgICB9KTtcblxuICAgIGlmIChzdHJhdC5maWx0ZXJHcm91cHMgJiYgc3RyYXQuZmlsdGVyR3JvdXBzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgc3RyYXQuZmlsdGVyR3JvdXBzLmZvckVhY2goZyA9PiBhZGRGaWx0ZXJHcm91cFJvdyhnKSk7XG4gICAgfSBlbHNlIGlmIChzdHJhdC5maWx0ZXJzICYmIHN0cmF0LmZpbHRlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICBhZGRGaWx0ZXJHcm91cFJvdyhzdHJhdC5maWx0ZXJzKTtcbiAgICB9XG5cbiAgICBzdHJhdC5ncm91cGluZ1J1bGVzPy5mb3JFYWNoKGcgPT4gYWRkQnVpbGRlclJvdygnZ3JvdXAnLCBnKSk7XG4gICAgc3RyYXQuc29ydGluZ1J1bGVzPy5mb3JFYWNoKHMgPT4gYWRkQnVpbGRlclJvdygnc29ydCcsIHMpKTtcbiAgICBzdHJhdC5ncm91cFNvcnRpbmdSdWxlcz8uZm9yRWFjaChncyA9PiBhZGRCdWlsZGVyUm93KCdncm91cFNvcnQnLCBncykpO1xuXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI3ZpZXctc3RyYXRlZ2llcycpPy5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnc21vb3RoJyB9KTtcbiAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlclN0cmF0ZWd5TG9hZE9wdGlvbnMoKSB7XG4gICAgY29uc3Qgc2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0ZWd5LWxvYWQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQgfCBudWxsO1xuICAgIGlmICghc2VsZWN0KSByZXR1cm47XG5cbiAgICBjb25zdCBjdXN0b21PcHRpb25zID0gbG9jYWxDdXN0b21TdHJhdGVnaWVzXG4gICAgICAgIC5zbGljZSgpXG4gICAgICAgIC5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpXG4gICAgICAgIC5tYXAoc3RyYXRlZ3kgPT4gYFxuICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIiR7ZXNjYXBlSHRtbChzdHJhdGVneS5pZCl9XCI+JHtlc2NhcGVIdG1sKHN0cmF0ZWd5LmxhYmVsKX0gKCR7ZXNjYXBlSHRtbChzdHJhdGVneS5pZCl9KTwvb3B0aW9uPlxuICAgICAgICBgKS5qb2luKCcnKTtcblxuICAgIGNvbnN0IGJ1aWx0SW5PcHRpb25zID0gU1RSQVRFR0lFU1xuICAgICAgICAuZmlsdGVyKHMgPT4gIWxvY2FsQ3VzdG9tU3RyYXRlZ2llcy5zb21lKGNzID0+IGNzLmlkID09PSBzLmlkKSlcbiAgICAgICAgLm1hcChzdHJhdGVneSA9PiBgXG4gICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiJHtlc2NhcGVIdG1sKHN0cmF0ZWd5LmlkIGFzIHN0cmluZyl9XCI+JHtlc2NhcGVIdG1sKHN0cmF0ZWd5LmxhYmVsKX0gKEJ1aWx0LWluKTwvb3B0aW9uPlxuICAgICAgICBgKS5qb2luKCcnKTtcblxuICAgIHNlbGVjdC5pbm5lckhUTUwgPSBgPG9wdGlvbiB2YWx1ZT1cIlwiPkxvYWQgc2F2ZWQgc3RyYXRlZ3kuLi48L29wdGlvbj5gICtcbiAgICAgICAgKGN1c3RvbU9wdGlvbnMgPyBgPG9wdGdyb3VwIGxhYmVsPVwiQ3VzdG9tIFN0cmF0ZWdpZXNcIj4ke2N1c3RvbU9wdGlvbnN9PC9vcHRncm91cD5gIDogJycpICtcbiAgICAgICAgKGJ1aWx0SW5PcHRpb25zID8gYDxvcHRncm91cCBsYWJlbD1cIkJ1aWx0LWluIFN0cmF0ZWdpZXNcIj4ke2J1aWx0SW5PcHRpb25zfTwvb3B0Z3JvdXA+YCA6ICcnKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyU3RyYXRlZ3lMaXN0VGFibGUoKSB7XG4gICAgY29uc3QgdGFibGVCb2R5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0ZWd5LXRhYmxlLWJvZHknKTtcbiAgICBpZiAoIXRhYmxlQm9keSkgcmV0dXJuO1xuXG4gICAgY29uc3QgY3VzdG9tSWRzID0gbmV3IFNldChsb2NhbEN1c3RvbVN0cmF0ZWdpZXMubWFwKHN0cmF0ZWd5ID0+IHN0cmF0ZWd5LmlkKSk7XG4gICAgY29uc3QgYnVpbHRJblJvd3MgPSBTVFJBVEVHSUVTLm1hcChzdHJhdGVneSA9PiAoe1xuICAgICAgICAuLi5zdHJhdGVneSxcbiAgICAgICAgc291cmNlTGFiZWw6ICdCdWlsdC1pbicsXG4gICAgICAgIGNvbmZpZ1N1bW1hcnk6ICdcdTIwMTQnLFxuICAgICAgICBhdXRvUnVuTGFiZWw6ICdcdTIwMTQnLFxuICAgICAgICBhY3Rpb25zOiAnJ1xuICAgIH0pKTtcblxuICAgIGNvbnN0IGN1c3RvbVJvd3MgPSBsb2NhbEN1c3RvbVN0cmF0ZWdpZXMubWFwKHN0cmF0ZWd5ID0+IHtcbiAgICAgICAgY29uc3Qgb3ZlcnJpZGVzQnVpbHRJbiA9IGN1c3RvbUlkcy5oYXMoc3RyYXRlZ3kuaWQpICYmIFNUUkFURUdJRVMuc29tZShidWlsdEluID0+IGJ1aWx0SW4uaWQgPT09IHN0cmF0ZWd5LmlkKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGlkOiBzdHJhdGVneS5pZCxcbiAgICAgICAgICAgIGxhYmVsOiBzdHJhdGVneS5sYWJlbCxcbiAgICAgICAgICAgIGlzR3JvdXBpbmc6IHRydWUsXG4gICAgICAgICAgICBpc1NvcnRpbmc6IHRydWUsXG4gICAgICAgICAgICBzb3VyY2VMYWJlbDogb3ZlcnJpZGVzQnVpbHRJbiA/ICdDdXN0b20gKG92ZXJyaWRlcyBidWlsdC1pbiknIDogJ0N1c3RvbScsXG4gICAgICAgICAgICBjb25maWdTdW1tYXJ5OiBgRmlsdGVyczogJHtzdHJhdGVneS5maWx0ZXJzPy5sZW5ndGggfHwgMH0sIEdyb3VwczogJHtzdHJhdGVneS5ncm91cGluZ1J1bGVzPy5sZW5ndGggfHwgMH0sIFNvcnRzOiAke3N0cmF0ZWd5LnNvcnRpbmdSdWxlcz8ubGVuZ3RoIHx8IDB9YCxcbiAgICAgICAgICAgIGF1dG9SdW5MYWJlbDogc3RyYXRlZ3kuYXV0b1J1biA/ICdZZXMnIDogJ05vJyxcbiAgICAgICAgICAgIGFjdGlvbnM6IGA8YnV0dG9uIGNsYXNzPVwiZGVsZXRlLXN0cmF0ZWd5LXJvd1wiIGRhdGEtaWQ9XCIke2VzY2FwZUh0bWwoc3RyYXRlZ3kuaWQpfVwiIHN0eWxlPVwiY29sb3I6IHJlZDtcIj5EZWxldGU8L2J1dHRvbj5gXG4gICAgICAgIH07XG4gICAgfSk7XG5cbiAgICBjb25zdCBhbGxSb3dzID0gWy4uLmJ1aWx0SW5Sb3dzLCAuLi5jdXN0b21Sb3dzXTtcblxuICAgIGlmIChhbGxSb3dzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICB0YWJsZUJvZHkuaW5uZXJIVE1MID0gJzx0cj48dGQgY29sc3Bhbj1cIjdcIiBzdHlsZT1cImNvbG9yOiAjODg4O1wiPk5vIHN0cmF0ZWdpZXMgZm91bmQuPC90ZD48L3RyPic7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0YWJsZUJvZHkuaW5uZXJIVE1MID0gYWxsUm93cy5tYXAocm93ID0+IHtcbiAgICAgICAgY29uc3QgY2FwYWJpbGl0aWVzID0gW3Jvdy5pc0dyb3VwaW5nID8gJ0dyb3VwaW5nJyA6IG51bGwsIHJvdy5pc1NvcnRpbmcgPyAnU29ydGluZycgOiBudWxsXS5maWx0ZXIoQm9vbGVhbikuam9pbignLCAnKTtcbiAgICAgICAgcmV0dXJuIGBcbiAgICAgICAgPHRyPlxuICAgICAgICAgICAgPHRkPiR7ZXNjYXBlSHRtbChyb3cubGFiZWwpfTwvdGQ+XG4gICAgICAgICAgICA8dGQ+JHtlc2NhcGVIdG1sKFN0cmluZyhyb3cuaWQpKX08L3RkPlxuICAgICAgICAgICAgPHRkPiR7ZXNjYXBlSHRtbChyb3cuc291cmNlTGFiZWwpfTwvdGQ+XG4gICAgICAgICAgICA8dGQ+JHtlc2NhcGVIdG1sKGNhcGFiaWxpdGllcyl9PC90ZD5cbiAgICAgICAgICAgIDx0ZD4ke2VzY2FwZUh0bWwocm93LmNvbmZpZ1N1bW1hcnkpfTwvdGQ+XG4gICAgICAgICAgICA8dGQ+JHtlc2NhcGVIdG1sKHJvdy5hdXRvUnVuTGFiZWwpfTwvdGQ+XG4gICAgICAgICAgICA8dGQ+JHtyb3cuYWN0aW9uc308L3RkPlxuICAgICAgICA8L3RyPlxuICAgICAgICBgO1xuICAgIH0pLmpvaW4oJycpO1xuXG4gICAgdGFibGVCb2R5LnF1ZXJ5U2VsZWN0b3JBbGwoJy5kZWxldGUtc3RyYXRlZ3ktcm93JykuZm9yRWFjaChidG4gPT4ge1xuICAgICAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgaWQgPSAoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQuaWQ7XG4gICAgICAgICAgICBpZiAoaWQgJiYgY29uZmlybShgRGVsZXRlIHN0cmF0ZWd5IFwiJHtpZH1cIj9gKSkge1xuICAgICAgICAgICAgICAgIGF3YWl0IGRlbGV0ZUN1c3RvbVN0cmF0ZWd5KGlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRlbGV0ZUN1c3RvbVN0cmF0ZWd5KGlkOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgICBsb2dJbmZvKFwiRGVsZXRpbmcgc3RyYXRlZ3lcIiwgeyBpZCB9KTtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2FkUHJlZmVyZW5jZXMnIH0pO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgICAgICAgY29uc3QgcHJlZnMgPSByZXNwb25zZS5kYXRhIGFzIFByZWZlcmVuY2VzO1xuICAgICAgICAgICAgY29uc3QgbmV3U3RyYXRlZ2llcyA9IChwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdKS5maWx0ZXIocyA9PiBzLmlkICE9PSBpZCk7XG5cbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnc2F2ZVByZWZlcmVuY2VzJyxcbiAgICAgICAgICAgICAgICBwYXlsb2FkOiB7IGN1c3RvbVN0cmF0ZWdpZXM6IG5ld1N0cmF0ZWdpZXMgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyA9IG5ld1N0cmF0ZWdpZXM7XG4gICAgICAgICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgICAgICAgICByZW5kZXJTdHJhdGVneUxvYWRPcHRpb25zKCk7XG4gICAgICAgICAgICByZW5kZXJTdHJhdGVneUxpc3RUYWJsZSgpO1xuICAgICAgICAgICAgcmVuZGVyQWxnb3JpdGhtc1ZpZXcoKTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBkZWxldGUgc3RyYXRlZ3lcIiwgZSk7XG4gICAgfVxufVxuXG4vLyAuLi4gR2VuZXJhIG1hbmFnZW1lbnQgLi4uIChrZXB0IGFzIGlzKVxuZnVuY3Rpb24gcmVuZGVyQ3VzdG9tR2VuZXJhTGlzdChjdXN0b21HZW5lcmE6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pIHtcbiAgICBjb25zdCBsaXN0Q29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2N1c3RvbS1nZW5lcmEtbGlzdCcpO1xuICAgIGlmICghbGlzdENvbnRhaW5lcikgcmV0dXJuO1xuXG4gICAgaWYgKE9iamVjdC5rZXlzKGN1c3RvbUdlbmVyYSkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIGxpc3RDb250YWluZXIuaW5uZXJIVE1MID0gJzxwIHN0eWxlPVwiY29sb3I6ICM4ODg7IGZvbnQtc3R5bGU6IGl0YWxpYztcIj5ObyBjdXN0b20gZW50cmllcy48L3A+JztcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxpc3RDb250YWluZXIuaW5uZXJIVE1MID0gT2JqZWN0LmVudHJpZXMoY3VzdG9tR2VuZXJhKS5tYXAoKFtkb21haW4sIGNhdGVnb3J5XSkgPT4gYFxuICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuOyBhbGlnbi1pdGVtczogY2VudGVyOyBwYWRkaW5nOiA1cHg7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAjZjBmMGYwO1wiPlxuICAgICAgICAgICAgPHNwYW4+PGI+JHtlc2NhcGVIdG1sKGRvbWFpbil9PC9iPjogJHtlc2NhcGVIdG1sKGNhdGVnb3J5KX08L3NwYW4+XG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZGVsZXRlLWdlbmVyYS1idG5cIiBkYXRhLWRvbWFpbj1cIiR7ZXNjYXBlSHRtbChkb21haW4pfVwiIHN0eWxlPVwiYmFja2dyb3VuZDogbm9uZTsgYm9yZGVyOiBub25lOyBjb2xvcjogcmVkOyBjdXJzb3I6IHBvaW50ZXI7XCI+JnRpbWVzOzwvYnV0dG9uPlxuICAgICAgICA8L2Rpdj5cbiAgICBgKS5qb2luKCcnKTtcblxuICAgIC8vIFJlLWF0dGFjaCBsaXN0ZW5lcnMgZm9yIGRlbGV0ZSBidXR0b25zXG4gICAgbGlzdENvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcuZGVsZXRlLWdlbmVyYS1idG4nKS5mb3JFYWNoKGJ0biA9PiB7XG4gICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBkb21haW4gPSAoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQuZG9tYWluO1xuICAgICAgICAgICAgaWYgKGRvbWFpbikge1xuICAgICAgICAgICAgICAgIGF3YWl0IGRlbGV0ZUN1c3RvbUdlbmVyYShkb21haW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gYWRkQ3VzdG9tR2VuZXJhKCkge1xuICAgIGNvbnN0IGRvbWFpbklucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25ldy1nZW5lcmEtZG9tYWluJykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICBjb25zdCBjYXRlZ29yeUlucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25ldy1nZW5lcmEtY2F0ZWdvcnknKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuXG4gICAgaWYgKCFkb21haW5JbnB1dCB8fCAhY2F0ZWdvcnlJbnB1dCkgcmV0dXJuO1xuXG4gICAgY29uc3QgZG9tYWluID0gZG9tYWluSW5wdXQudmFsdWUudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgY2F0ZWdvcnkgPSBjYXRlZ29yeUlucHV0LnZhbHVlLnRyaW0oKTtcblxuICAgIGlmICghZG9tYWluIHx8ICFjYXRlZ29yeSkge1xuICAgICAgICBhbGVydChcIlBsZWFzZSBlbnRlciBib3RoIGRvbWFpbiBhbmQgY2F0ZWdvcnkuXCIpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbG9nSW5mbyhcIkFkZGluZyBjdXN0b20gZ2VuZXJhXCIsIHsgZG9tYWluLCBjYXRlZ29yeSB9KTtcblxuICAgIHRyeSB7XG4gICAgICAgIC8vIEZldGNoIGN1cnJlbnQgdG8gbWVyZ2VcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2FkUHJlZmVyZW5jZXMnIH0pO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgICAgICAgY29uc3QgcHJlZnMgPSByZXNwb25zZS5kYXRhIGFzIFByZWZlcmVuY2VzO1xuICAgICAgICAgICAgY29uc3QgbmV3Q3VzdG9tR2VuZXJhID0geyAuLi4ocHJlZnMuY3VzdG9tR2VuZXJhIHx8IHt9KSwgW2RvbWFpbl06IGNhdGVnb3J5IH07XG5cbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnc2F2ZVByZWZlcmVuY2VzJyxcbiAgICAgICAgICAgICAgICBwYXlsb2FkOiB7IGN1c3RvbUdlbmVyYTogbmV3Q3VzdG9tR2VuZXJhIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBkb21haW5JbnB1dC52YWx1ZSA9ICcnO1xuICAgICAgICAgICAgY2F0ZWdvcnlJbnB1dC52YWx1ZSA9ICcnO1xuICAgICAgICAgICAgbG9hZEN1c3RvbUdlbmVyYSgpO1xuICAgICAgICAgICAgbG9hZFRhYnMoKTsgLy8gUmVmcmVzaCB0YWJzIHRvIGFwcGx5IG5ldyBjbGFzc2lmaWNhdGlvbiBpZiByZWxldmFudFxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGFkZCBjdXN0b20gZ2VuZXJhXCIsIGUpO1xuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZGVsZXRlQ3VzdG9tR2VuZXJhKGRvbWFpbjogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgbG9nSW5mbyhcIkRlbGV0aW5nIGN1c3RvbSBnZW5lcmFcIiwgeyBkb21haW4gfSk7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9hZFByZWZlcmVuY2VzJyB9KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgIGNvbnN0IHByZWZzID0gcmVzcG9uc2UuZGF0YSBhcyBQcmVmZXJlbmNlcztcbiAgICAgICAgICAgIGNvbnN0IG5ld0N1c3RvbUdlbmVyYSA9IHsgLi4uKHByZWZzLmN1c3RvbUdlbmVyYSB8fCB7fSkgfTtcbiAgICAgICAgICAgIGRlbGV0ZSBuZXdDdXN0b21HZW5lcmFbZG9tYWluXTtcblxuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIHBheWxvYWQ6IHsgY3VzdG9tR2VuZXJhOiBuZXdDdXN0b21HZW5lcmEgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGxvYWRDdXN0b21HZW5lcmEoKTtcbiAgICAgICAgICAgIGxvYWRUYWJzKCk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gZGVsZXRlIGN1c3RvbSBnZW5lcmFcIiwgZSk7XG4gICAgfVxufVxuXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChldmVudCkgPT4ge1xuICAgIGNvbnN0IHRhcmdldCA9IGV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgaWYgKHRhcmdldCAmJiB0YXJnZXQuaWQgPT09ICdhZGQtZ2VuZXJhLWJ0bicpIHtcbiAgICAgICAgYWRkQ3VzdG9tR2VuZXJhKCk7XG4gICAgfVxufSk7XG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRUYWJzKCkge1xuICBsb2dJbmZvKFwiTG9hZGluZyB0YWJzIGZvciBEZXZUb29sc1wiKTtcbiAgY29uc3QgdGFicyA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHt9KTtcbiAgY3VycmVudFRhYnMgPSB0YWJzO1xuXG4gIGNvbnN0IHRvdGFsVGFic0VsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3RvdGFsVGFicycpO1xuICBpZiAodG90YWxUYWJzRWwpIHtcbiAgICB0b3RhbFRhYnNFbC50ZXh0Q29udGVudCA9IHRhYnMubGVuZ3RoLnRvU3RyaW5nKCk7XG4gIH1cblxuICAvLyBDcmVhdGUgYSBtYXAgb2YgdGFiIElEIHRvIHRpdGxlIGZvciBwYXJlbnQgbG9va3VwXG4gIHRhYlRpdGxlcy5jbGVhcigpO1xuICB0YWJzLmZvckVhY2godGFiID0+IHtcbiAgICBpZiAodGFiLmlkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHRhYlRpdGxlcy5zZXQodGFiLmlkLCB0YWIudGl0bGUgfHwgJ1VudGl0bGVkJyk7XG4gICAgfVxuICB9KTtcblxuICAvLyBDb252ZXJ0IHRvIFRhYk1ldGFkYXRhIGZvciBjb250ZXh0IGFuYWx5c2lzXG4gIGNvbnN0IG1hcHBlZFRhYnM6IFRhYk1ldGFkYXRhW10gPSBnZXRNYXBwZWRUYWJzKCk7XG5cbiAgLy8gQW5hbHl6ZSBjb250ZXh0XG4gIHRyeSB7XG4gICAgICBjdXJyZW50Q29udGV4dE1hcCA9IGF3YWl0IGFuYWx5emVUYWJDb250ZXh0KG1hcHBlZFRhYnMpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBhbmFseXplIGNvbnRleHRcIiwgZXJyb3IpO1xuICAgICAgY3VycmVudENvbnRleHRNYXAuY2xlYXIoKTtcbiAgfVxuXG4gIHJlbmRlclRhYmxlKCk7XG59XG5cbmZ1bmN0aW9uIGdldE1hcHBlZFRhYnMoKTogVGFiTWV0YWRhdGFbXSB7XG4gIHJldHVybiBjdXJyZW50VGFic1xuICAgIC5tYXAodGFiID0+IHtcbiAgICAgICAgY29uc3QgbWV0YWRhdGEgPSBtYXBDaHJvbWVUYWIodGFiKTtcbiAgICAgICAgaWYgKCFtZXRhZGF0YSkgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgY29uc3QgY29udGV4dFJlc3VsdCA9IGN1cnJlbnRDb250ZXh0TWFwLmdldChtZXRhZGF0YS5pZCk7XG4gICAgICAgIGlmIChjb250ZXh0UmVzdWx0KSB7XG4gICAgICAgICAgICBtZXRhZGF0YS5jb250ZXh0ID0gY29udGV4dFJlc3VsdC5jb250ZXh0O1xuICAgICAgICAgICAgbWV0YWRhdGEuY29udGV4dERhdGEgPSBjb250ZXh0UmVzdWx0LmRhdGE7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1ldGFkYXRhO1xuICAgIH0pXG4gICAgLmZpbHRlcigodCk6IHQgaXMgVGFiTWV0YWRhdGEgPT4gdCAhPT0gbnVsbCk7XG59XG5cbmZ1bmN0aW9uIGhhbmRsZVNvcnQoa2V5OiBzdHJpbmcpIHtcbiAgaWYgKHNvcnRLZXkgPT09IGtleSkge1xuICAgIHNvcnREaXJlY3Rpb24gPSBzb3J0RGlyZWN0aW9uID09PSAnYXNjJyA/ICdkZXNjJyA6ICdhc2MnO1xuICB9IGVsc2Uge1xuICAgIHNvcnRLZXkgPSBrZXk7XG4gICAgc29ydERpcmVjdGlvbiA9ICdhc2MnO1xuICB9XG4gIHVwZGF0ZUhlYWRlclN0eWxlcygpO1xuICByZW5kZXJUYWJsZSgpO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVIZWFkZXJTdHlsZXMoKSB7XG4gIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ3RoLnNvcnRhYmxlJykuZm9yRWFjaCh0aCA9PiB7XG4gICAgdGguY2xhc3NMaXN0LnJlbW92ZSgnc29ydC1hc2MnLCAnc29ydC1kZXNjJyk7XG4gICAgaWYgKHRoLmdldEF0dHJpYnV0ZSgnZGF0YS1rZXknKSA9PT0gc29ydEtleSkge1xuICAgICAgdGguY2xhc3NMaXN0LmFkZChzb3J0RGlyZWN0aW9uID09PSAnYXNjJyA/ICdzb3J0LWFzYycgOiAnc29ydC1kZXNjJyk7XG4gICAgfVxuICB9KTtcbn1cblxuZnVuY3Rpb24gZ2V0U29ydFZhbHVlKHRhYjogY2hyb21lLnRhYnMuVGFiLCBrZXk6IHN0cmluZyk6IGFueSB7XG4gIHN3aXRjaCAoa2V5KSB7XG4gICAgY2FzZSAncGFyZW50VGl0bGUnOlxuICAgICAgcmV0dXJuIHRhYi5vcGVuZXJUYWJJZCA/ICh0YWJUaXRsZXMuZ2V0KHRhYi5vcGVuZXJUYWJJZCkgfHwgJycpIDogJyc7XG4gICAgY2FzZSAnZ2VucmUnOlxuICAgICAgcmV0dXJuICh0YWIuaWQgJiYgY3VycmVudENvbnRleHRNYXAuZ2V0KHRhYi5pZCk/LmRhdGE/LmdlbnJlKSB8fCAnJztcbiAgICBjYXNlICdjb250ZXh0JzpcbiAgICAgIHJldHVybiAodGFiLmlkICYmIGN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpPy5jb250ZXh0KSB8fCAnJztcbiAgICBjYXNlICdhY3RpdmUnOlxuICAgIGNhc2UgJ3Bpbm5lZCc6XG4gICAgICByZXR1cm4gKHRhYiBhcyBhbnkpW2tleV0gPyAxIDogMDtcbiAgICBjYXNlICdpZCc6XG4gICAgY2FzZSAnaW5kZXgnOlxuICAgIGNhc2UgJ3dpbmRvd0lkJzpcbiAgICBjYXNlICdncm91cElkJzpcbiAgICBjYXNlICdvcGVuZXJUYWJJZCc6XG4gICAgICByZXR1cm4gKHRhYiBhcyBhbnkpW2tleV0gfHwgLTE7XG4gICAgY2FzZSAnbGFzdEFjY2Vzc2VkJzpcbiAgICAgIHJldHVybiAodGFiIGFzIGFueSlba2V5XSB8fCAwO1xuICAgIGNhc2UgJ3RpdGxlJzpcbiAgICBjYXNlICd1cmwnOlxuICAgIGNhc2UgJ3N0YXR1cyc6XG4gICAgICByZXR1cm4gKCh0YWIgYXMgYW55KVtrZXldIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gKHRhYiBhcyBhbnkpW2tleV07XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVuZGVyVGFibGUoKSB7XG4gIGNvbnN0IHRib2R5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI3RhYnNUYWJsZSB0Ym9keScpO1xuICBpZiAoIXRib2R5KSByZXR1cm47XG5cbiAgLy8gMS4gRmlsdGVyXG4gIGxldCB0YWJzRGlzcGxheSA9IGN1cnJlbnRUYWJzLmZpbHRlcih0YWIgPT4ge1xuICAgICAgLy8gR2xvYmFsIFNlYXJjaFxuICAgICAgaWYgKGdsb2JhbFNlYXJjaFF1ZXJ5KSB7XG4gICAgICAgICAgY29uc3QgcSA9IGdsb2JhbFNlYXJjaFF1ZXJ5LnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgY29uc3Qgc2VhcmNoYWJsZVRleHQgPSBgJHt0YWIudGl0bGV9ICR7dGFiLnVybH0gJHt0YWIuaWR9YC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgIGlmICghc2VhcmNoYWJsZVRleHQuaW5jbHVkZXMocSkpIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgLy8gQ29sdW1uIEZpbHRlcnNcbiAgICAgIGZvciAoY29uc3QgW2tleSwgZmlsdGVyXSBvZiBPYmplY3QuZW50cmllcyhjb2x1bW5GaWx0ZXJzKSkge1xuICAgICAgICAgIGlmICghZmlsdGVyKSBjb250aW51ZTtcbiAgICAgICAgICBjb25zdCB2YWwgPSBTdHJpbmcoZ2V0U29ydFZhbHVlKHRhYiwga2V5KSkudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICBpZiAoIXZhbC5pbmNsdWRlcyhmaWx0ZXIudG9Mb3dlckNhc2UoKSkpIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRydWU7XG4gIH0pO1xuXG4gIC8vIDIuIFNvcnRcbiAgaWYgKHNvcnRLZXkpIHtcbiAgICB0YWJzRGlzcGxheS5zb3J0KChhLCBiKSA9PiB7XG4gICAgICBsZXQgdmFsQTogYW55ID0gZ2V0U29ydFZhbHVlKGEsIHNvcnRLZXkhKTtcbiAgICAgIGxldCB2YWxCOiBhbnkgPSBnZXRTb3J0VmFsdWUoYiwgc29ydEtleSEpO1xuXG4gICAgICBpZiAodmFsQSA8IHZhbEIpIHJldHVybiBzb3J0RGlyZWN0aW9uID09PSAnYXNjJyA/IC0xIDogMTtcbiAgICAgIGlmICh2YWxBID4gdmFsQikgcmV0dXJuIHNvcnREaXJlY3Rpb24gPT09ICdhc2MnID8gMSA6IC0xO1xuICAgICAgcmV0dXJuIDA7XG4gICAgfSk7XG4gIH1cblxuICB0Ym9keS5pbm5lckhUTUwgPSAnJzsgLy8gQ2xlYXIgZXhpc3Rpbmcgcm93c1xuXG4gIC8vIDMuIFJlbmRlclxuICBjb25zdCB2aXNpYmxlQ29scyA9IGNvbHVtbnMuZmlsdGVyKGMgPT4gYy52aXNpYmxlKTtcblxuICB0YWJzRGlzcGxheS5mb3JFYWNoKHRhYiA9PiB7XG4gICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndHInKTtcblxuICAgIHZpc2libGVDb2xzLmZvckVhY2goY29sID0+IHtcbiAgICAgICAgY29uc3QgdGQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0ZCcpO1xuICAgICAgICBpZiAoY29sLmtleSA9PT0gJ3RpdGxlJykgdGQuY2xhc3NMaXN0LmFkZCgndGl0bGUtY2VsbCcpO1xuICAgICAgICBpZiAoY29sLmtleSA9PT0gJ3VybCcpIHRkLmNsYXNzTGlzdC5hZGQoJ3VybC1jZWxsJyk7XG5cbiAgICAgICAgY29uc3QgdmFsID0gZ2V0Q2VsbFZhbHVlKHRhYiwgY29sLmtleSk7XG5cbiAgICAgICAgaWYgKHZhbCBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSB7XG4gICAgICAgICAgICB0ZC5hcHBlbmRDaGlsZCh2YWwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGQuaW5uZXJIVE1MID0gdmFsO1xuICAgICAgICAgICAgdGQudGl0bGUgPSBzdHJpcEh0bWwoU3RyaW5nKHZhbCkpO1xuICAgICAgICB9XG4gICAgICAgIHJvdy5hcHBlbmRDaGlsZCh0ZCk7XG4gICAgfSk7XG5cbiAgICB0Ym9keS5hcHBlbmRDaGlsZChyb3cpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gc3RyaXBIdG1sKGh0bWw6IHN0cmluZykge1xuICAgIGxldCB0bXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiRElWXCIpO1xuICAgIHRtcC5pbm5lckhUTUwgPSBodG1sO1xuICAgIHJldHVybiB0bXAudGV4dENvbnRlbnQgfHwgdG1wLmlubmVyVGV4dCB8fCBcIlwiO1xufVxuXG5cbmZ1bmN0aW9uIGdldENlbGxWYWx1ZSh0YWI6IGNocm9tZS50YWJzLlRhYiwga2V5OiBzdHJpbmcpOiBzdHJpbmcgfCBIVE1MRWxlbWVudCB7XG4gICAgY29uc3QgZXNjYXBlID0gZXNjYXBlSHRtbDtcblxuICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICAgIGNhc2UgJ2lkJzogcmV0dXJuIFN0cmluZyh0YWIuaWQgPz8gJ04vQScpO1xuICAgICAgICBjYXNlICdpbmRleCc6IHJldHVybiBTdHJpbmcodGFiLmluZGV4KTtcbiAgICAgICAgY2FzZSAnd2luZG93SWQnOiByZXR1cm4gU3RyaW5nKHRhYi53aW5kb3dJZCk7XG4gICAgICAgIGNhc2UgJ2dyb3VwSWQnOiByZXR1cm4gU3RyaW5nKHRhYi5ncm91cElkKTtcbiAgICAgICAgY2FzZSAndGl0bGUnOiByZXR1cm4gZXNjYXBlKHRhYi50aXRsZSB8fCAnJyk7XG4gICAgICAgIGNhc2UgJ3VybCc6IHJldHVybiBlc2NhcGUodGFiLnVybCB8fCAnJyk7XG4gICAgICAgIGNhc2UgJ3N0YXR1cyc6IHJldHVybiBlc2NhcGUodGFiLnN0YXR1cyB8fCAnJyk7XG4gICAgICAgIGNhc2UgJ2FjdGl2ZSc6IHJldHVybiB0YWIuYWN0aXZlID8gJ1llcycgOiAnTm8nO1xuICAgICAgICBjYXNlICdwaW5uZWQnOiByZXR1cm4gdGFiLnBpbm5lZCA/ICdZZXMnIDogJ05vJztcbiAgICAgICAgY2FzZSAnb3BlbmVyVGFiSWQnOiByZXR1cm4gU3RyaW5nKHRhYi5vcGVuZXJUYWJJZCA/PyAnLScpO1xuICAgICAgICBjYXNlICdwYXJlbnRUaXRsZSc6XG4gICAgICAgICAgICAgcmV0dXJuIGVzY2FwZSh0YWIub3BlbmVyVGFiSWQgPyAodGFiVGl0bGVzLmdldCh0YWIub3BlbmVyVGFiSWQpIHx8ICdVbmtub3duJykgOiAnLScpO1xuICAgICAgICBjYXNlICdnZW5yZSc6XG4gICAgICAgICAgICAgcmV0dXJuIGVzY2FwZSgodGFiLmlkICYmIGN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpPy5kYXRhPy5nZW5yZSkgfHwgJy0nKTtcbiAgICAgICAgY2FzZSAnY29udGV4dCc6IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRleHRSZXN1bHQgPSB0YWIuaWQgPyBjdXJyZW50Q29udGV4dE1hcC5nZXQodGFiLmlkKSA6IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGlmICghY29udGV4dFJlc3VsdCkgcmV0dXJuICdOL0EnO1xuXG4gICAgICAgICAgICBsZXQgY2VsbFN0eWxlID0gJyc7XG4gICAgICAgICAgICBsZXQgYWlDb250ZXh0ID0gJyc7XG5cbiAgICAgICAgICAgIGlmIChjb250ZXh0UmVzdWx0LnN0YXR1cyA9PT0gJ1JFU1RSSUNURUQnKSB7XG4gICAgICAgICAgICAgICAgYWlDb250ZXh0ID0gJ1VuZXh0cmFjdGFibGUgKHJlc3RyaWN0ZWQpJztcbiAgICAgICAgICAgICAgICBjZWxsU3R5bGUgPSAnY29sb3I6IGdyYXk7IGZvbnQtc3R5bGU6IGl0YWxpYzsnO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjb250ZXh0UmVzdWx0LmVycm9yKSB7XG4gICAgICAgICAgICAgICAgYWlDb250ZXh0ID0gYEVycm9yICgke2NvbnRleHRSZXN1bHQuZXJyb3J9KWA7XG4gICAgICAgICAgICAgICAgY2VsbFN0eWxlID0gJ2NvbG9yOiByZWQ7JztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY29udGV4dFJlc3VsdC5zb3VyY2UgPT09ICdFeHRyYWN0aW9uJykge1xuICAgICAgICAgICAgICAgIGFpQ29udGV4dCA9IGAke2NvbnRleHRSZXN1bHQuY29udGV4dH0gKEV4dHJhY3RlZClgO1xuICAgICAgICAgICAgICAgIGNlbGxTdHlsZSA9ICdjb2xvcjogZ3JlZW47IGZvbnQtd2VpZ2h0OiBib2xkOyc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICBhaUNvbnRleHQgPSBgJHtjb250ZXh0UmVzdWx0LmNvbnRleHR9YDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICBjb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcbiAgICAgICAgICAgIGNvbnRhaW5lci5zdHlsZS5mbGV4RGlyZWN0aW9uID0gJ2NvbHVtbic7XG4gICAgICAgICAgICBjb250YWluZXIuc3R5bGUuZ2FwID0gJzVweCc7XG5cbiAgICAgICAgICAgIGNvbnN0IHN1bW1hcnlEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIHN1bW1hcnlEaXYuc3R5bGUuY3NzVGV4dCA9IGNlbGxTdHlsZTtcbiAgICAgICAgICAgIHN1bW1hcnlEaXYudGV4dENvbnRlbnQgPSBhaUNvbnRleHQ7XG4gICAgICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoc3VtbWFyeURpdik7XG5cbiAgICAgICAgICAgIGlmIChjb250ZXh0UmVzdWx0LmRhdGEpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkZXRhaWxzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncHJlJyk7XG4gICAgICAgICAgICAgICAgZGV0YWlscy5zdHlsZS5jc3NUZXh0ID0gJ21heC1oZWlnaHQ6IDMwMHB4OyBvdmVyZmxvdzogYXV0bzsgZm9udC1zaXplOiAxMXB4OyB0ZXh0LWFsaWduOiBsZWZ0OyBiYWNrZ3JvdW5kOiAjZjVmNWY1OyBwYWRkaW5nOiA1cHg7IGJvcmRlcjogMXB4IHNvbGlkICNkZGQ7IG1hcmdpbjogMDsgd2hpdGUtc3BhY2U6IHByZS13cmFwOyBmb250LWZhbWlseTogbW9ub3NwYWNlOyc7XG4gICAgICAgICAgICAgICAgZGV0YWlscy50ZXh0Q29udGVudCA9IEpTT04uc3RyaW5naWZ5KGNvbnRleHRSZXN1bHQuZGF0YSwgbnVsbCwgMik7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGRldGFpbHMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gY29udGFpbmVyO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgJ2xhc3RBY2Nlc3NlZCc6XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGUoKHRhYiBhcyBhbnkpLmxhc3RBY2Nlc3NlZCB8fCAwKS50b0xvY2FsZVN0cmluZygpO1xuICAgICAgICBjYXNlICdhY3Rpb25zJzoge1xuICAgICAgICAgICAgY29uc3Qgd3JhcHBlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgd3JhcHBlci5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImdvdG8tdGFiLWJ0blwiIGRhdGEtdGFiLWlkPVwiJHt0YWIuaWR9XCIgZGF0YS13aW5kb3ctaWQ9XCIke3RhYi53aW5kb3dJZH1cIj5HbzwvYnV0dG9uPlxuICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJjbG9zZS10YWItYnRuXCIgZGF0YS10YWItaWQ9XCIke3RhYi5pZH1cIiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6ICNkYzM1NDU7IG1hcmdpbi1sZWZ0OiAycHg7XCI+WDwvYnV0dG9uPlxuICAgICAgICAgICAgYDtcbiAgICAgICAgICAgIHJldHVybiB3cmFwcGVyO1xuICAgICAgICB9XG4gICAgICAgIGRlZmF1bHQ6IHJldHVybiAnJztcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHJlbmRlckFsZ29yaXRobXNWaWV3KCkge1xuICAvLyBVc2UgdXBkYXRlZCBzdHJhdGVnaWVzIGxpc3QgaW5jbHVkaW5nIGN1c3RvbSBvbmVzXG4gIHJlbmRlclN0cmF0ZWd5Q29uZmlnKCk7XG5cbiAgY29uc3QgZ3JvdXBpbmdSZWYgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JvdXBpbmctcmVmJyk7XG4gIGNvbnN0IHNvcnRpbmdSZWYgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc29ydGluZy1yZWYnKTtcblxuICBpZiAoZ3JvdXBpbmdSZWYpIHtcbiAgICAgIC8vIFJlLXJlbmRlciBiZWNhdXNlIHN0cmF0ZWd5IGxpc3QgbWlnaHQgY2hhbmdlXG4gICAgICBjb25zdCBhbGxTdHJhdGVnaWVzOiBTdHJhdGVneURlZmluaXRpb25bXSA9IGdldFN0cmF0ZWdpZXMobG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcbiAgICAgIGNvbnN0IGdyb3VwaW5ncyA9IGFsbFN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gcy5pc0dyb3VwaW5nKTtcblxuICAgICAgZ3JvdXBpbmdSZWYuaW5uZXJIVE1MID0gZ3JvdXBpbmdzLm1hcChnID0+IHtcbiAgICAgICAgIGNvbnN0IGlzQ3VzdG9tID0gbG9jYWxDdXN0b21TdHJhdGVnaWVzLnNvbWUocyA9PiBzLmlkID09PSBnLmlkKTtcbiAgICAgICAgIGxldCBkZXNjID0gXCJCdWlsdC1pbiBzdHJhdGVneVwiO1xuICAgICAgICAgaWYgKGlzQ3VzdG9tKSBkZXNjID0gXCJDdXN0b20gc3RyYXRlZ3kgZGVmaW5lZCBieSBydWxlcy5cIjtcbiAgICAgICAgIGVsc2UgaWYgKGcuaWQgPT09ICdkb21haW4nKSBkZXNjID0gJ0dyb3VwcyB0YWJzIGJ5IHRoZWlyIGRvbWFpbiBuYW1lLic7XG4gICAgICAgICBlbHNlIGlmIChnLmlkID09PSAndG9waWMnKSBkZXNjID0gJ0dyb3VwcyBiYXNlZCBvbiBrZXl3b3JkcyBpbiB0aGUgdGl0bGUuJztcblxuICAgICAgICAgcmV0dXJuIGBcbiAgICAgICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktaXRlbVwiPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInN0cmF0ZWd5LW5hbWVcIj4ke2cubGFiZWx9ICgke2cuaWR9KSAke2lzQ3VzdG9tID8gJzxzcGFuIHN0eWxlPVwiY29sb3I6IGJsdWU7IGZvbnQtc2l6ZTogMC44ZW07XCI+Q3VzdG9tPC9zcGFuPicgOiAnJ308L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1kZXNjXCI+JHtkZXNjfTwvZGl2PlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInN0cmF0ZWd5LXZpZXctYnRuXCIgZGF0YS10eXBlPVwiZ3JvdXBpbmdcIiBkYXRhLW5hbWU9XCIke2cuaWR9XCI+VmlldyBMb2dpYzwvYnV0dG9uPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICBgO1xuICAgICAgfSkuam9pbignJyk7XG4gIH1cblxuICBpZiAoc29ydGluZ1JlZikge1xuICAgIC8vIFJlLXJlbmRlciBzb3J0aW5nIHN0cmF0ZWdpZXMgdG9vXG4gICAgY29uc3QgYWxsU3RyYXRlZ2llczogU3RyYXRlZ3lEZWZpbml0aW9uW10gPSBnZXRTdHJhdGVnaWVzKGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgY29uc3Qgc29ydGluZ3MgPSBhbGxTdHJhdGVnaWVzLmZpbHRlcihzID0+IHMuaXNTb3J0aW5nKTtcblxuICAgIHNvcnRpbmdSZWYuaW5uZXJIVE1MID0gc29ydGluZ3MubWFwKHMgPT4ge1xuICAgICAgICBsZXQgZGVzYyA9IFwiQnVpbHQtaW4gc29ydGluZ1wiO1xuICAgICAgICBpZiAocy5pZCA9PT0gJ3JlY2VuY3knKSBkZXNjID0gJ1NvcnRzIGJ5IGxhc3QgYWNjZXNzZWQgdGltZSAobW9zdCByZWNlbnQgZmlyc3QpLic7XG4gICAgICAgIGVsc2UgaWYgKHMuaWQgPT09ICduZXN0aW5nJykgZGVzYyA9ICdTb3J0cyBiYXNlZCBvbiBoaWVyYXJjaHkgKHJvb3RzIHZzIGNoaWxkcmVuKS4nO1xuICAgICAgICBlbHNlIGlmIChzLmlkID09PSAncGlubmVkJykgZGVzYyA9ICdLZWVwcyBwaW5uZWQgdGFicyBhdCB0aGUgYmVnaW5uaW5nIG9mIHRoZSBsaXN0Lic7XG5cbiAgICAgICAgcmV0dXJuIGBcbiAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1pdGVtXCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1uYW1lXCI+JHtzLmxhYmVsfTwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktZGVzY1wiPiR7ZGVzY308L2Rpdj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInN0cmF0ZWd5LXZpZXctYnRuXCIgZGF0YS10eXBlPVwic29ydGluZ1wiIGRhdGEtbmFtZT1cIiR7cy5pZH1cIj5WaWV3IExvZ2ljPC9idXR0b24+XG4gICAgICA8L2Rpdj5cbiAgICBgO1xuICAgIH0pLmpvaW4oJycpO1xuICB9XG5cbiAgY29uc3QgcmVnaXN0cnlSZWYgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncmVnaXN0cnktcmVmJyk7XG4gIGlmIChyZWdpc3RyeVJlZiAmJiByZWdpc3RyeVJlZi5jaGlsZHJlbi5sZW5ndGggPT09IDApIHtcbiAgICAgIHJlZ2lzdHJ5UmVmLmlubmVySFRNTCA9IGBcbiAgICAgICAgPGRpdiBjbGFzcz1cInN0cmF0ZWd5LWl0ZW1cIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1uYW1lXCI+R2VuZXJhIFJlZ2lzdHJ5PC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktZGVzY1wiPlN0YXRpYyBsb29rdXAgdGFibGUgZm9yIGRvbWFpbiBjbGFzc2lmaWNhdGlvbiAoYXBwcm94ICR7T2JqZWN0LmtleXMoR0VORVJBX1JFR0lTVFJZKS5sZW5ndGh9IGVudHJpZXMpLjwvZGl2PlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInN0cmF0ZWd5LXZpZXctYnRuXCIgZGF0YS10eXBlPVwicmVnaXN0cnlcIiBkYXRhLW5hbWU9XCJnZW5lcmFcIj5WaWV3IFRhYmxlPC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuICAgICAgYDtcbiAgfVxufVxuXG5mdW5jdGlvbiByZW5kZXJTdHJhdGVneUNvbmZpZygpIHtcbiAgY29uc3QgZ3JvdXBpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1ncm91cGluZy1saXN0Jyk7XG4gIGNvbnN0IHNvcnRpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1zb3J0aW5nLWxpc3QnKTtcblxuICAvLyBVc2UgZHluYW1pYyBzdHJhdGVneSBsaXN0XG4gIGNvbnN0IHN0cmF0ZWdpZXM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0gZ2V0U3RyYXRlZ2llcyhsb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuXG4gIGlmIChncm91cGluZ0xpc3QpIHtcbiAgICAgIGNvbnN0IGdyb3VwaW5nU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gcy5pc0dyb3VwaW5nKTtcbiAgICAgIC8vIFdlIHNob3VsZCBwcmVzZXJ2ZSBjaGVja2VkIHN0YXRlIGlmIHJlLXJlbmRlcmluZywgYnV0IGZvciBub3cganVzdCBkZWZhdWx0aW5nIGlzIG9rYXkgb3IgcmVhZGluZyBjdXJyZW50IERPTVxuICAgICAgLy8gU2ltcGxpZmljYXRpb246IGp1c3QgcmUtcmVuZGVyLlxuICAgICAgcmVuZGVyU3RyYXRlZ3lMaXN0KGdyb3VwaW5nTGlzdCwgZ3JvdXBpbmdTdHJhdGVnaWVzLCBbJ2RvbWFpbicsICd0b3BpYyddKTtcbiAgfVxuXG4gIGlmIChzb3J0aW5nTGlzdCkge1xuICAgICAgY29uc3Qgc29ydGluZ1N0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IHMuaXNTb3J0aW5nKTtcbiAgICAgIHJlbmRlclN0cmF0ZWd5TGlzdChzb3J0aW5nTGlzdCwgc29ydGluZ1N0cmF0ZWdpZXMsIFsncGlubmVkJywgJ3JlY2VuY3knXSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVuZGVyU3RyYXRlZ3lMaXN0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHN0cmF0ZWdpZXM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdLCBkZWZhdWx0RW5hYmxlZDogc3RyaW5nW10pIHtcbiAgICBjb250YWluZXIuaW5uZXJIVE1MID0gJyc7XG5cbiAgICAvLyBTb3J0IGVuYWJsZWQgYnkgdGhlaXIgaW5kZXggaW4gZGVmYXVsdEVuYWJsZWRcbiAgICBjb25zdCBlbmFibGVkID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiBkZWZhdWx0RW5hYmxlZC5pbmNsdWRlcyhzLmlkIGFzIHN0cmluZykpO1xuICAgIC8vIFNhZmUgaW5kZXhvZiBjaGVjayBzaW5jZSBpZHMgYXJlIHN0cmluZ3MgaW4gZGVmYXVsdEVuYWJsZWRcbiAgICBlbmFibGVkLnNvcnQoKGEsIGIpID0+IGRlZmF1bHRFbmFibGVkLmluZGV4T2YoYS5pZCBhcyBzdHJpbmcpIC0gZGVmYXVsdEVuYWJsZWQuaW5kZXhPZihiLmlkIGFzIHN0cmluZykpO1xuXG4gICAgY29uc3QgZGlzYWJsZWQgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+ICFkZWZhdWx0RW5hYmxlZC5pbmNsdWRlcyhzLmlkIGFzIHN0cmluZykpO1xuXG4gICAgLy8gSW5pdGlhbCByZW5kZXIgb3JkZXI6IEVuYWJsZWQgKG9yZGVyZWQpIHRoZW4gRGlzYWJsZWRcbiAgICBjb25zdCBvcmRlcmVkID0gWy4uLmVuYWJsZWQsIC4uLmRpc2FibGVkXTtcblxuICAgIG9yZGVyZWQuZm9yRWFjaChzdHJhdGVneSA9PiB7XG4gICAgICAgIGNvbnN0IGlzQ2hlY2tlZCA9IGRlZmF1bHRFbmFibGVkLmluY2x1ZGVzKHN0cmF0ZWd5LmlkKTtcbiAgICAgICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIHJvdy5jbGFzc05hbWUgPSBgc3RyYXRlZ3ktcm93ICR7aXNDaGVja2VkID8gJycgOiAnZGlzYWJsZWQnfWA7XG4gICAgICAgIHJvdy5kYXRhc2V0LmlkID0gc3RyYXRlZ3kuaWQ7XG4gICAgICAgIHJvdy5kcmFnZ2FibGUgPSB0cnVlO1xuXG4gICAgICAgIHJvdy5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZHJhZy1oYW5kbGVcIj5cdTI2MzA8L2Rpdj5cbiAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiAke2lzQ2hlY2tlZCA/ICdjaGVja2VkJyA6ICcnfT5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwic3RyYXRlZ3ktbGFiZWxcIj4ke3N0cmF0ZWd5LmxhYmVsfTwvc3Bhbj5cbiAgICAgICAgYDtcblxuICAgICAgICAvLyBBZGQgbGlzdGVuZXJzXG4gICAgICAgIGNvbnN0IGNoZWNrYm94ID0gcm93LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJjaGVja2JveFwiXScpO1xuICAgICAgICBjaGVja2JveD8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKGUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNoZWNrZWQgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZDtcbiAgICAgICAgICAgIHJvdy5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsICFjaGVja2VkKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgYWRkRG5ETGlzdGVuZXJzKHJvdywgY29udGFpbmVyKTtcblxuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQocm93KTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gYWRkRG5ETGlzdGVuZXJzKHJvdzogSFRNTEVsZW1lbnQsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgcm93LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdzdGFydCcsIChlKSA9PiB7XG4gICAgcm93LmNsYXNzTGlzdC5hZGQoJ2RyYWdnaW5nJyk7XG4gICAgaWYgKGUuZGF0YVRyYW5zZmVyKSB7XG4gICAgICAgIGUuZGF0YVRyYW5zZmVyLmVmZmVjdEFsbG93ZWQgPSAnbW92ZSc7XG4gICAgICAgIC8vIFNldCBhIHRyYW5zcGFyZW50IGltYWdlIG9yIHNpbWlsYXIgaWYgZGVzaXJlZCwgYnV0IGRlZmF1bHQgaXMgdXN1YWxseSBmaW5lXG4gICAgfVxuICB9KTtcblxuICByb3cuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ2VuZCcsICgpID0+IHtcbiAgICByb3cuY2xhc3NMaXN0LnJlbW92ZSgnZHJhZ2dpbmcnKTtcbiAgfSk7XG5cbiAgLy8gVGhlIGNvbnRhaW5lciBoYW5kbGVzIHRoZSBkcm9wIHpvbmUgbG9naWMgdmlhIGRyYWdvdmVyXG4gIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdkcmFnb3ZlcicsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IGFmdGVyRWxlbWVudCA9IGdldERyYWdBZnRlckVsZW1lbnQoY29udGFpbmVyLCBlLmNsaWVudFkpO1xuICAgIGNvbnN0IGRyYWdnYWJsZSA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuZHJhZ2dpbmcnKTtcbiAgICBpZiAoZHJhZ2dhYmxlKSB7XG4gICAgICBpZiAoYWZ0ZXJFbGVtZW50ID09IG51bGwpIHtcbiAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGRyYWdnYWJsZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb250YWluZXIuaW5zZXJ0QmVmb3JlKGRyYWdnYWJsZSwgYWZ0ZXJFbGVtZW50KTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBnZXREcmFnQWZ0ZXJFbGVtZW50KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHk6IG51bWJlcikge1xuICBjb25zdCBkcmFnZ2FibGVFbGVtZW50cyA9IEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5zdHJhdGVneS1yb3c6bm90KC5kcmFnZ2luZyknKSk7XG5cbiAgcmV0dXJuIGRyYWdnYWJsZUVsZW1lbnRzLnJlZHVjZSgoY2xvc2VzdCwgY2hpbGQpID0+IHtcbiAgICBjb25zdCBib3ggPSBjaGlsZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBjb25zdCBvZmZzZXQgPSB5IC0gYm94LnRvcCAtIGJveC5oZWlnaHQgLyAyO1xuICAgIGlmIChvZmZzZXQgPCAwICYmIG9mZnNldCA+IGNsb3Nlc3Qub2Zmc2V0KSB7XG4gICAgICByZXR1cm4geyBvZmZzZXQ6IG9mZnNldCwgZWxlbWVudDogY2hpbGQgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGNsb3Nlc3Q7XG4gICAgfVxuICB9LCB7IG9mZnNldDogTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZLCBlbGVtZW50OiBudWxsIGFzIEVsZW1lbnQgfCBudWxsIH0pLmVsZW1lbnQ7XG59XG5cbmZ1bmN0aW9uIHNob3dNb2RhbCh0aXRsZTogc3RyaW5nLCBjb250ZW50OiBIVE1MRWxlbWVudCB8IHN0cmluZykge1xuICAgIGNvbnN0IG1vZGFsT3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIG1vZGFsT3ZlcmxheS5jbGFzc05hbWUgPSAnbW9kYWwtb3ZlcmxheSc7XG4gICAgbW9kYWxPdmVybGF5LmlubmVySFRNTCA9IGBcbiAgICAgICAgPGRpdiBjbGFzcz1cIm1vZGFsXCI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwibW9kYWwtaGVhZGVyXCI+XG4gICAgICAgICAgICAgICAgPGgzPiR7ZXNjYXBlSHRtbCh0aXRsZSl9PC9oMz5cbiAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwibW9kYWwtY2xvc2VcIj4mdGltZXM7PC9idXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1jb250ZW50XCI+PC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgIGA7XG5cbiAgICBjb25zdCBjb250ZW50Q29udGFpbmVyID0gbW9kYWxPdmVybGF5LnF1ZXJ5U2VsZWN0b3IoJy5tb2RhbC1jb250ZW50JykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgaWYgKHR5cGVvZiBjb250ZW50ID09PSAnc3RyaW5nJykge1xuICAgICAgICBjb250ZW50Q29udGFpbmVyLmlubmVySFRNTCA9IGNvbnRlbnQ7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZChjb250ZW50KTtcbiAgICB9XG5cbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG1vZGFsT3ZlcmxheSk7XG5cbiAgICBjb25zdCBjbG9zZUJ0biA9IG1vZGFsT3ZlcmxheS5xdWVyeVNlbGVjdG9yKCcubW9kYWwtY2xvc2UnKTtcbiAgICBjbG9zZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQobW9kYWxPdmVybGF5KTtcbiAgICB9KTtcblxuICAgIG1vZGFsT3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgIGlmIChlLnRhcmdldCA9PT0gbW9kYWxPdmVybGF5KSB7XG4gICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZChtb2RhbE92ZXJsYXkpO1xuICAgICAgICB9XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIHNob3dTdHJhdGVneURldGFpbHModHlwZTogc3RyaW5nLCBuYW1lOiBzdHJpbmcpIHtcbiAgICBsZXQgY29udGVudCA9IFwiXCI7XG4gICAgbGV0IHRpdGxlID0gYCR7bmFtZX0gKCR7dHlwZX0pYDtcblxuICAgIGlmICh0eXBlID09PSAnZ3JvdXBpbmcnKSB7XG4gICAgICAgIGlmIChuYW1lID09PSAnZG9tYWluJykge1xuICAgICAgICAgICAgY29udGVudCA9IGBcbjxoMz5Mb2dpYzogRG9tYWluIEV4dHJhY3Rpb248L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoZG9tYWluRnJvbVVybC50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG48aDM+TG9naWM6IEdyb3VwaW5nIEtleTwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChncm91cGluZ0tleS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG4gICAgICAgICAgICBgO1xuICAgICAgICB9IGVsc2UgaWYgKG5hbWUgPT09ICd0b3BpYycpIHtcbiAgICAgICAgICAgIGNvbnRlbnQgPSBgXG48aDM+TG9naWM6IFNlbWFudGljIEJ1Y2tldGluZzwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChzZW1hbnRpY0J1Y2tldC50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG48aDM+TG9naWM6IEdyb3VwaW5nIEtleTwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChncm91cGluZ0tleS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG4gICAgICAgICAgICBgO1xuICAgICAgICB9IGVsc2UgaWYgKG5hbWUgPT09ICdsaW5lYWdlJykge1xuICAgICAgICAgICAgY29udGVudCA9IGBcbjxoMz5Mb2dpYzogTmF2aWdhdGlvbiBLZXk8L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwobmF2aWdhdGlvbktleS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG48aDM+TG9naWM6IEdyb3VwaW5nIEtleTwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChncm91cGluZ0tleS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG4gICAgICAgICAgICBgO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIGN1c3RvbSBzdHJhdGVneSBkZXRhaWxzXG4gICAgICAgICAgICBjb25zdCBjdXN0b20gPSBsb2NhbEN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IG5hbWUpO1xuICAgICAgICAgICAgaWYgKGN1c3RvbSkge1xuICAgICAgICAgICAgICAgIGNvbnRlbnQgPSBgXG48aDM+Q3VzdG9tIFN0cmF0ZWd5OiAke2VzY2FwZUh0bWwoY3VzdG9tLmxhYmVsKX08L2gzPlxuPHA+PGI+Q29uZmlndXJhdGlvbjo8L2I+PC9wPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoSlNPTi5zdHJpbmdpZnkoY3VzdG9tLCBudWxsLCAyKSl9PC9jb2RlPjwvcHJlPlxuPGgzPkxvZ2ljOiBHcm91cGluZyBLZXk8L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoZ3JvdXBpbmdLZXkudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPlxuICAgICAgICAgICAgICAgIGA7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnRlbnQgPSBgXG48aDM+TG9naWM6IEdyb3VwaW5nIEtleTwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChncm91cGluZ0tleS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG4gICAgICAgICAgICAgICAgYDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3NvcnRpbmcnKSB7XG4gICAgICAgIGNvbnRlbnQgPSBgXG48aDM+TG9naWM6IENvbXBhcmlzb24gRnVuY3Rpb248L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoY29tcGFyZUJ5LnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5cbiAgICAgICAgYDtcblxuICAgICAgICBpZiAobmFtZSA9PT0gJ3JlY2VuY3knKSB7XG4gICAgICAgICAgICAgY29udGVudCArPSBgPGgzPkxvZ2ljOiBSZWNlbmN5IFNjb3JlPC9oMz48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChyZWNlbmN5U2NvcmUudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPmA7XG4gICAgICAgIH0gZWxzZSBpZiAobmFtZSA9PT0gJ25lc3RpbmcnKSB7XG4gICAgICAgICAgICAgY29udGVudCArPSBgPGgzPkxvZ2ljOiBIaWVyYXJjaHkgU2NvcmU8L2gzPjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKGhpZXJhcmNoeVNjb3JlLnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5gO1xuICAgICAgICB9IGVsc2UgaWYgKG5hbWUgPT09ICdwaW5uZWQnKSB7XG4gICAgICAgICAgICAgY29udGVudCArPSBgPGgzPkxvZ2ljOiBQaW5uZWQgU2NvcmU8L2gzPjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKHBpbm5lZFNjb3JlLnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5gO1xuICAgICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAncmVnaXN0cnknICYmIG5hbWUgPT09ICdnZW5lcmEnKSB7XG4gICAgICAgIGNvbnN0IGpzb24gPSBKU09OLnN0cmluZ2lmeShHRU5FUkFfUkVHSVNUUlksIG51bGwsIDIpO1xuICAgICAgICBjb250ZW50ID0gYFxuPGgzPkdlbmVyYSBSZWdpc3RyeSBEYXRhPC9oMz5cbjxwPk1hcHBpbmcgb2YgZG9tYWluIG5hbWVzIHRvIGNhdGVnb3JpZXMuPC9wPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoanNvbil9PC9jb2RlPjwvcHJlPlxuICAgICAgICBgO1xuICAgIH1cblxuICAgIHNob3dNb2RhbCh0aXRsZSwgY29udGVudCk7XG59XG5cbmZ1bmN0aW9uIGdldEVuYWJsZWRTdHJhdGVnaWVzRnJvbVVJKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBTb3J0aW5nU3RyYXRlZ3lbXSB7XG4gICAgcmV0dXJuIEFycmF5LmZyb20oY29udGFpbmVyLmNoaWxkcmVuKVxuICAgICAgICAuZmlsdGVyKHJvdyA9PiAocm93LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJjaGVja2JveFwiXScpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQpXG4gICAgICAgIC5tYXAocm93ID0+IChyb3cgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQuaWQgYXMgU29ydGluZ1N0cmF0ZWd5KTtcbn1cblxuZnVuY3Rpb24gcnVuU2ltdWxhdGlvbigpIHtcbiAgY29uc3QgZ3JvdXBpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1ncm91cGluZy1saXN0Jyk7XG4gIGNvbnN0IHNvcnRpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1zb3J0aW5nLWxpc3QnKTtcbiAgY29uc3QgcmVzdWx0Q29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbVJlc3VsdHMnKTtcblxuICBpZiAoIWdyb3VwaW5nTGlzdCB8fCAhc29ydGluZ0xpc3QgfHwgIXJlc3VsdENvbnRhaW5lcikgcmV0dXJuO1xuXG4gIGNvbnN0IGdyb3VwaW5nU3RyYXRzID0gZ2V0RW5hYmxlZFN0cmF0ZWdpZXNGcm9tVUkoZ3JvdXBpbmdMaXN0KTtcbiAgY29uc3Qgc29ydGluZ1N0cmF0cyA9IGdldEVuYWJsZWRTdHJhdGVnaWVzRnJvbVVJKHNvcnRpbmdMaXN0KTtcblxuICAvLyBQcmVwYXJlIGRhdGFcbiAgbGV0IHRhYnMgPSBnZXRNYXBwZWRUYWJzKCk7XG5cbiAgLy8gMS4gU29ydFxuICBpZiAoc29ydGluZ1N0cmF0cy5sZW5ndGggPiAwKSB7XG4gICAgdGFicyA9IHNvcnRUYWJzKHRhYnMsIHNvcnRpbmdTdHJhdHMpO1xuICB9XG5cbiAgLy8gMi4gR3JvdXBcbiAgY29uc3QgZ3JvdXBzID0gZ3JvdXBUYWJzKHRhYnMsIGdyb3VwaW5nU3RyYXRzKTtcblxuICAvLyAzLiBSZW5kZXJcbiAgaWYgKGdyb3Vwcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJlc3VsdENvbnRhaW5lci5pbm5lckhUTUwgPSAnPHA+Tm8gZ3JvdXBzIGNyZWF0ZWQgKGFyZSB0aGVyZSBhbnkgdGFicz8pLjwvcD4nO1xuICAgICAgcmV0dXJuO1xuICB9XG5cbiAgcmVzdWx0Q29udGFpbmVyLmlubmVySFRNTCA9IGdyb3Vwcy5tYXAoZ3JvdXAgPT4gYFxuICAgIDxkaXYgY2xhc3M9XCJncm91cC1yZXN1bHRcIj5cbiAgICAgIDxkaXYgY2xhc3M9XCJncm91cC1oZWFkZXJcIiBzdHlsZT1cImJvcmRlci1sZWZ0OiA1cHggc29saWQgJHtncm91cC5jb2xvcn1cIj5cbiAgICAgICAgPHNwYW4+JHtlc2NhcGVIdG1sKGdyb3VwLmxhYmVsIHx8ICdVbmdyb3VwZWQnKX08L3NwYW4+XG4gICAgICAgIDxzcGFuIGNsYXNzPVwiZ3JvdXAtbWV0YVwiPiR7Z3JvdXAudGFicy5sZW5ndGh9IHRhYnMgJmJ1bGw7IFJlYXNvbjogJHtlc2NhcGVIdG1sKGdyb3VwLnJlYXNvbil9PC9zcGFuPlxuICAgICAgPC9kaXY+XG4gICAgICA8dWwgY2xhc3M9XCJncm91cC10YWJzXCI+XG4gICAgICAgICR7Z3JvdXAudGFicy5tYXAodGFiID0+IGBcbiAgICAgICAgICA8bGkgY2xhc3M9XCJncm91cC10YWItaXRlbVwiPlxuICAgICAgICAgICAgJHt0YWIuZmF2SWNvblVybCA/IGA8aW1nIHNyYz1cIiR7ZXNjYXBlSHRtbCh0YWIuZmF2SWNvblVybCl9XCIgY2xhc3M9XCJ0YWItaWNvblwiIG9uZXJyb3I9XCJ0aGlzLnN0eWxlLmRpc3BsYXk9J25vbmUnXCI+YCA6ICc8ZGl2IGNsYXNzPVwidGFiLWljb25cIj48L2Rpdj4nfVxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJ0aXRsZS1jZWxsXCIgdGl0bGU9XCIke2VzY2FwZUh0bWwodGFiLnRpdGxlKX1cIj4ke2VzY2FwZUh0bWwodGFiLnRpdGxlKX08L3NwYW4+XG4gICAgICAgICAgICA8c3BhbiBzdHlsZT1cImNvbG9yOiAjOTk5OyBmb250LXNpemU6IDAuOGVtOyBtYXJnaW4tbGVmdDogYXV0bztcIj4ke2VzY2FwZUh0bWwobmV3IFVSTCh0YWIudXJsKS5ob3N0bmFtZSl9PC9zcGFuPlxuICAgICAgICAgIDwvbGk+XG4gICAgICAgIGApLmpvaW4oJycpfVxuICAgICAgPC91bD5cbiAgICA8L2Rpdj5cbiAgYCkuam9pbignJyk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGFwcGx5VG9Ccm93c2VyKCkge1xuICAgIGNvbnN0IGdyb3VwaW5nTGlzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaW0tZ3JvdXBpbmctbGlzdCcpO1xuICAgIGNvbnN0IHNvcnRpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1zb3J0aW5nLWxpc3QnKTtcblxuICAgIGlmICghZ3JvdXBpbmdMaXN0IHx8ICFzb3J0aW5nTGlzdCkgcmV0dXJuO1xuXG4gICAgY29uc3QgZ3JvdXBpbmdTdHJhdHMgPSBnZXRFbmFibGVkU3RyYXRlZ2llc0Zyb21VSShncm91cGluZ0xpc3QpO1xuICAgIGNvbnN0IHNvcnRpbmdTdHJhdHMgPSBnZXRFbmFibGVkU3RyYXRlZ2llc0Zyb21VSShzb3J0aW5nTGlzdCk7XG5cbiAgICAvLyBDb21iaW5lIHN0cmF0ZWdpZXMuXG4gICAgLy8gV2UgcHJpb3JpdGl6ZSBncm91cGluZyBzdHJhdGVnaWVzIGZpcnN0LCB0aGVuIHNvcnRpbmcgc3RyYXRlZ2llcyxcbiAgICAvLyBhcyB0aGUgYmFja2VuZCBmaWx0ZXJzIHRoZW0gd2hlbiBwZXJmb3JtaW5nIGFjdGlvbnMuXG4gICAgY29uc3QgYWxsU3RyYXRlZ2llcyA9IFsuLi5ncm91cGluZ1N0cmF0cywgLi4uc29ydGluZ1N0cmF0c107XG5cbiAgICB0cnkge1xuICAgICAgICAvLyAxLiBTYXZlIFByZWZlcmVuY2VzXG4gICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgcGF5bG9hZDogeyBzb3J0aW5nOiBhbGxTdHJhdGVnaWVzIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gMi4gVHJpZ2dlciBBcHBseSBHcm91cGluZyAod2hpY2ggdXNlcyB0aGUgbmV3IHByZWZlcmVuY2VzKVxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgIHR5cGU6ICdhcHBseUdyb3VwaW5nJyxcbiAgICAgICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICAgICAgICBzb3J0aW5nOiBhbGxTdHJhdGVnaWVzIC8vIFBhc3MgZXhwbGljaXRseSB0byBlbnN1cmUgaW1tZWRpYXRlIGVmZmVjdFxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2spIHtcbiAgICAgICAgICAgIGFsZXJ0KFwiQXBwbGllZCBzdWNjZXNzZnVsbHkhXCIpO1xuICAgICAgICAgICAgbG9hZFRhYnMoKTsgLy8gUmVmcmVzaCBkYXRhXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhbGVydChcIkZhaWxlZCB0byBhcHBseTogXCIgKyAocmVzcG9uc2UuZXJyb3IgfHwgJ1Vua25vd24gZXJyb3InKSk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJBcHBseSBmYWlsZWRcIiwgZSk7XG4gICAgICAgIGFsZXJ0KFwiQXBwbHkgZmFpbGVkOiBcIiArIGUpO1xuICAgIH1cbn1cblxuXG5mdW5jdGlvbiBlc2NhcGVIdG1sKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGlmICghdGV4dCkgcmV0dXJuICcnO1xuICByZXR1cm4gdGV4dFxuICAgIC5yZXBsYWNlKC8mL2csICcmYW1wOycpXG4gICAgLnJlcGxhY2UoLzwvZywgJyZsdDsnKVxuICAgIC5yZXBsYWNlKC8+L2csICcmZ3Q7JylcbiAgICAucmVwbGFjZSgvXCIvZywgJyZxdW90OycpXG4gICAgLnJlcGxhY2UoLycvZywgJyYjMDM5OycpO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZW5kZXJMaXZlVmlldygpIHtcbiAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbGl2ZS12aWV3LWNvbnRhaW5lcicpO1xuICAgIGlmICghY29udGFpbmVyKSByZXR1cm47XG5cbiAgICB0cnkge1xuICAgICAgICBjb25zdCB0YWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICAgICAgICBjb25zdCBncm91cHMgPSBhd2FpdCBjaHJvbWUudGFiR3JvdXBzLnF1ZXJ5KHt9KTtcbiAgICAgICAgY29uc3QgZ3JvdXBNYXAgPSBuZXcgTWFwKGdyb3Vwcy5tYXAoZyA9PiBbZy5pZCwgZ10pKTtcblxuICAgICAgICBjb25zdCB3aW5kb3dzID0gbmV3IFNldCh0YWJzLm1hcCh0ID0+IHQud2luZG93SWQpKTtcbiAgICAgICAgY29uc3Qgd2luZG93SWRzID0gQXJyYXkuZnJvbSh3aW5kb3dzKS5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG5cbiAgICAgICAgbGV0IGh0bWwgPSAnPGRpdiBzdHlsZT1cImZvbnQtc2l6ZTogMC45ZW07IGNvbG9yOiAjNjY2OyBtYXJnaW4tYm90dG9tOiAxMHB4O1wiPlNlbGVjdCBpdGVtcyBiZWxvdyB0byBzaW11bGF0ZSBzcGVjaWZpYyBzZWxlY3Rpb24gc3RhdGVzLjwvZGl2Pic7XG5cbiAgICAgICAgZm9yIChjb25zdCB3aW5JZCBvZiB3aW5kb3dJZHMpIHtcbiAgICAgICAgICAgIGNvbnN0IHdpblRhYnMgPSB0YWJzLmZpbHRlcih0ID0+IHQud2luZG93SWQgPT09IHdpbklkKTtcbiAgICAgICAgICAgIGNvbnN0IHdpblNlbGVjdGVkID0gd2luVGFicy5ldmVyeSh0ID0+IHQuaWQgJiYgc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKSk7XG5cbiAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJzZWxlY3RhYmxlLWl0ZW0gJHt3aW5TZWxlY3RlZCA/ICdzZWxlY3RlZCcgOiAnJ31cIiBkYXRhLXR5cGU9XCJ3aW5kb3dcIiBkYXRhLWlkPVwiJHt3aW5JZH1cIiBzdHlsZT1cIm1hcmdpbi1ib3R0b206IDE1cHg7IGJvcmRlci1yYWRpdXM6IDRweDsgcGFkZGluZzogNXB4O1wiPmA7XG4gICAgICAgICAgICBodG1sICs9IGA8ZGl2IHN0eWxlPVwiZm9udC13ZWlnaHQ6IGJvbGQ7XCI+V2luZG93ICR7d2luSWR9PC9kaXY+YDtcblxuICAgICAgICAgICAgLy8gT3JnYW5pemUgYnkgZ3JvdXBcbiAgICAgICAgICAgIGNvbnN0IHdpbkdyb3VwcyA9IG5ldyBNYXA8bnVtYmVyLCBjaHJvbWUudGFicy5UYWJbXT4oKTtcbiAgICAgICAgICAgIGNvbnN0IHVuZ3JvdXBlZDogY2hyb21lLnRhYnMuVGFiW10gPSBbXTtcblxuICAgICAgICAgICAgd2luVGFicy5mb3JFYWNoKHQgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh0Lmdyb3VwSWQgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghd2luR3JvdXBzLmhhcyh0Lmdyb3VwSWQpKSB3aW5Hcm91cHMuc2V0KHQuZ3JvdXBJZCwgW10pO1xuICAgICAgICAgICAgICAgICAgICB3aW5Hcm91cHMuZ2V0KHQuZ3JvdXBJZCkhLnB1c2godCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdW5ncm91cGVkLnB1c2godCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFJlbmRlciBVbmdyb3VwZWRcbiAgICAgICAgICAgIGlmICh1bmdyb3VwZWQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICBodG1sICs9IGA8ZGl2IHN0eWxlPVwibWFyZ2luLWxlZnQ6IDEwcHg7IG1hcmdpbi10b3A6IDVweDtcIj5gO1xuICAgICAgICAgICAgICAgICBodG1sICs9IGA8ZGl2IHN0eWxlPVwiZm9udC1zaXplOiAwLjllbTsgY29sb3I6ICM1NTU7XCI+VW5ncm91cGVkICgke3VuZ3JvdXBlZC5sZW5ndGh9KTwvZGl2PmA7XG4gICAgICAgICAgICAgICAgIHVuZ3JvdXBlZC5mb3JFYWNoKHQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNTZWxlY3RlZCA9IHQuaWQgJiYgc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJzZWxlY3RhYmxlLWl0ZW0gJHtpc1NlbGVjdGVkID8gJ3NlbGVjdGVkJyA6ICcnfVwiIGRhdGEtdHlwZT1cInRhYlwiIGRhdGEtaWQ9XCIke3QuaWR9XCIgc3R5bGU9XCJtYXJnaW4tbGVmdDogMTBweDsgcGFkZGluZzogMnB4IDVweDsgYm9yZGVyLXJhZGl1czogM3B4OyBjdXJzb3I6IHBvaW50ZXI7IGNvbG9yOiAjMzMzOyB3aGl0ZS1zcGFjZTogbm93cmFwOyBvdmVyZmxvdzogaGlkZGVuOyB0ZXh0LW92ZXJmbG93OiBlbGxpcHNpcztcIj4tICR7ZXNjYXBlSHRtbCh0LnRpdGxlIHx8ICdVbnRpdGxlZCcpfTwvZGl2PmA7XG4gICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICBodG1sICs9IGA8L2Rpdj5gO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBSZW5kZXIgR3JvdXBzXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtncm91cElkLCBnVGFic10gb2Ygd2luR3JvdXBzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBJbmZvID0gZ3JvdXBNYXAuZ2V0KGdyb3VwSWQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbG9yID0gZ3JvdXBJbmZvPy5jb2xvciB8fCAnZ3JleSc7XG4gICAgICAgICAgICAgICAgY29uc3QgdGl0bGUgPSBncm91cEluZm8/LnRpdGxlIHx8ICdVbnRpdGxlZCBHcm91cCc7XG4gICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBTZWxlY3RlZCA9IGdUYWJzLmV2ZXJ5KHQgPT4gdC5pZCAmJiBzaW11bGF0ZWRTZWxlY3Rpb24uaGFzKHQuaWQpKTtcblxuICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJzZWxlY3RhYmxlLWl0ZW0gJHtncm91cFNlbGVjdGVkID8gJ3NlbGVjdGVkJyA6ICcnfVwiIGRhdGEtdHlwZT1cImdyb3VwXCIgZGF0YS1pZD1cIiR7Z3JvdXBJZH1cIiBzdHlsZT1cIm1hcmdpbi1sZWZ0OiAxMHB4OyBtYXJnaW4tdG9wOiA1cHg7IGJvcmRlci1sZWZ0OiAzcHggc29saWQgJHtjb2xvcn07IHBhZGRpbmctbGVmdDogNXB4OyBwYWRkaW5nOiA1cHg7IGJvcmRlci1yYWRpdXM6IDNweDtcIj5gO1xuICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgc3R5bGU9XCJmb250LXdlaWdodDogYm9sZDsgZm9udC1zaXplOiAwLjllbTtcIj4ke2VzY2FwZUh0bWwodGl0bGUpfSAoJHtnVGFicy5sZW5ndGh9KTwvZGl2PmA7XG4gICAgICAgICAgICAgICAgZ1RhYnMuZm9yRWFjaCh0ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzU2VsZWN0ZWQgPSB0LmlkICYmIHNpbXVsYXRlZFNlbGVjdGlvbi5oYXModC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwic2VsZWN0YWJsZS1pdGVtICR7aXNTZWxlY3RlZCA/ICdzZWxlY3RlZCcgOiAnJ31cIiBkYXRhLXR5cGU9XCJ0YWJcIiBkYXRhLWlkPVwiJHt0LmlkfVwiIHN0eWxlPVwibWFyZ2luLWxlZnQ6IDEwcHg7IHBhZGRpbmc6IDJweCA1cHg7IGJvcmRlci1yYWRpdXM6IDNweDsgY3Vyc29yOiBwb2ludGVyOyBjb2xvcjogIzMzMzsgd2hpdGUtc3BhY2U6IG5vd3JhcDsgb3ZlcmZsb3c6IGhpZGRlbjsgdGV4dC1vdmVyZmxvdzogZWxsaXBzaXM7XCI+LSAke2VzY2FwZUh0bWwodC50aXRsZSB8fCAnVW50aXRsZWQnKX08L2Rpdj5gO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGh0bWwgKz0gYDwvZGl2PmA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGh0bWwgKz0gYDwvZGl2PmA7XG4gICAgICAgIH1cblxuICAgICAgICBjb250YWluZXIuaW5uZXJIVE1MID0gaHRtbDtcblxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29udGFpbmVyLmlubmVySFRNTCA9IGA8cCBzdHlsZT1cImNvbG9yOnJlZFwiPkVycm9yIGxvYWRpbmcgbGl2ZSB2aWV3OiAke2V9PC9wPmA7XG4gICAgfVxufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tIExPRyBWSUVXRVIgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5sZXQgY3VycmVudExvZ3M6IExvZ0VudHJ5W10gPSBbXTtcblxuYXN5bmMgZnVuY3Rpb24gbG9hZExvZ3MoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdnZXRMb2dzJyB9KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgIGN1cnJlbnRMb2dzID0gcmVzcG9uc2UuZGF0YTtcbiAgICAgICAgICAgIHJlbmRlckxvZ3MoKTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIGxvZ3NcIiwgZSk7XG4gICAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBjbGVhclJlbW90ZUxvZ3MoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnY2xlYXJMb2dzJyB9KTtcbiAgICAgICAgbG9hZExvZ3MoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gY2xlYXIgbG9nc1wiLCBlKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHJlbmRlckxvZ3MoKSB7XG4gICAgY29uc3QgdGJvZHkgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9ncy10YWJsZS1ib2R5Jyk7XG4gICAgY29uc3QgbGV2ZWxGaWx0ZXIgPSAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvZy1sZXZlbC1maWx0ZXInKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgY29uc3Qgc2VhcmNoVGV4dCA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9nLXNlYXJjaCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlLnRvTG93ZXJDYXNlKCk7XG5cbiAgICBpZiAoIXRib2R5KSByZXR1cm47XG5cbiAgICB0Ym9keS5pbm5lckhUTUwgPSAnJztcblxuICAgIGNvbnN0IGZpbHRlcmVkID0gY3VycmVudExvZ3MuZmlsdGVyKGVudHJ5ID0+IHtcbiAgICAgICAgaWYgKGxldmVsRmlsdGVyICE9PSAnYWxsJyAmJiBlbnRyeS5sZXZlbCAhPT0gbGV2ZWxGaWx0ZXIpIHJldHVybiBmYWxzZTtcbiAgICAgICAgaWYgKHNlYXJjaFRleHQpIHtcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSBgJHtlbnRyeS5tZXNzYWdlfSAke0pTT04uc3RyaW5naWZ5KGVudHJ5LmNvbnRleHQgfHwge30pfWAudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIGlmICghdGV4dC5pbmNsdWRlcyhzZWFyY2hUZXh0KSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH0pO1xuXG4gICAgaWYgKGZpbHRlcmVkLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICB0Ym9keS5pbm5lckhUTUwgPSAnPHRyPjx0ZCBjb2xzcGFuPVwiNFwiIHN0eWxlPVwicGFkZGluZzogMTBweDsgdGV4dC1hbGlnbjogY2VudGVyOyBjb2xvcjogIzg4ODtcIj5ObyBsb2dzIGZvdW5kLjwvdGQ+PC90cj4nO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZmlsdGVyZWQuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICAgIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RyJyk7XG5cbiAgICAgICAgLy8gQ29sb3IgY29kZSBsZXZlbFxuICAgICAgICBsZXQgY29sb3IgPSAnIzMzMyc7XG4gICAgICAgIGlmIChlbnRyeS5sZXZlbCA9PT0gJ2Vycm9yJyB8fCBlbnRyeS5sZXZlbCA9PT0gJ2NyaXRpY2FsJykgY29sb3IgPSAncmVkJztcbiAgICAgICAgZWxzZSBpZiAoZW50cnkubGV2ZWwgPT09ICd3YXJuJykgY29sb3IgPSAnb3JhbmdlJztcbiAgICAgICAgZWxzZSBpZiAoZW50cnkubGV2ZWwgPT09ICdkZWJ1ZycpIGNvbG9yID0gJ2JsdWUnO1xuXG4gICAgICAgIHJvdy5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICA8dGQgc3R5bGU9XCJwYWRkaW5nOiA4cHg7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAjZWVlOyB3aGl0ZS1zcGFjZTogbm93cmFwO1wiPiR7bmV3IERhdGUoZW50cnkudGltZXN0YW1wKS50b0xvY2FsZVRpbWVTdHJpbmcoKX0gKCR7ZW50cnkudGltZXN0YW1wfSk8L3RkPlxuICAgICAgICAgICAgPHRkIHN0eWxlPVwicGFkZGluZzogOHB4OyBib3JkZXItYm90dG9tOiAxcHggc29saWQgI2VlZTsgY29sb3I6ICR7Y29sb3J9OyBmb250LXdlaWdodDogYm9sZDtcIj4ke2VudHJ5LmxldmVsLnRvVXBwZXJDYXNlKCl9PC90ZD5cbiAgICAgICAgICAgIDx0ZCBzdHlsZT1cInBhZGRpbmc6IDhweDsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICNlZWU7XCI+JHtlc2NhcGVIdG1sKGVudHJ5Lm1lc3NhZ2UpfTwvdGQ+XG4gICAgICAgICAgICA8dGQgc3R5bGU9XCJwYWRkaW5nOiA4cHg7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAjZWVlO1wiPlxuICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cIm1heC1oZWlnaHQ6IDEwMHB4OyBvdmVyZmxvdy15OiBhdXRvO1wiPlxuICAgICAgICAgICAgICAgICAgJHtlbnRyeS5jb250ZXh0ID8gYDxwcmUgc3R5bGU9XCJtYXJnaW46IDA7XCI+JHtlc2NhcGVIdG1sKEpTT04uc3RyaW5naWZ5KGVudHJ5LmNvbnRleHQsIG51bGwsIDIpKX08L3ByZT5gIDogJy0nfVxuICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L3RkPlxuICAgICAgICBgO1xuICAgICAgICB0Ym9keS5hcHBlbmRDaGlsZChyb3cpO1xuICAgIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBsb2FkR2xvYmFsTG9nTGV2ZWwoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2FkUHJlZmVyZW5jZXMnIH0pO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgICAgICAgY29uc3QgcHJlZnMgPSByZXNwb25zZS5kYXRhIGFzIFByZWZlcmVuY2VzO1xuICAgICAgICAgICAgY29uc3Qgc2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dsb2JhbC1sb2ctbGV2ZWwnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgIGlmIChzZWxlY3QpIHtcbiAgICAgICAgICAgICAgICBzZWxlY3QudmFsdWUgPSBwcmVmcy5sb2dMZXZlbCB8fCAnaW5mbyc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBwcmVmcyBmb3IgbG9nc1wiLCBlKTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHVwZGF0ZUdsb2JhbExvZ0xldmVsKCkge1xuICAgIGNvbnN0IHNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnbG9iYWwtbG9nLWxldmVsJykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgaWYgKCFzZWxlY3QpIHJldHVybjtcbiAgICBjb25zdCBsZXZlbCA9IHNlbGVjdC52YWx1ZSBhcyBMb2dMZXZlbDtcblxuICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgcGF5bG9hZDogeyBsb2dMZXZlbDogbGV2ZWwgfVxuICAgICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gc2F2ZSBsb2cgbGV2ZWxcIiwgZSk7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U0FBUyxTQUFTLEVBQUcsV0FBVTtBQUFBLFdBQzdGLElBQUksU0FBUyxZQUFZLEtBQUssSUFBSSxTQUFTLFNBQVMsS0FBSyxJQUFJLFNBQVMsVUFBVSxLQUFLLElBQUksU0FBUyxZQUFZLEVBQUcsV0FBVTtBQUVwSSxTQUFPLEVBQUUsU0FBUyxRQUFRLFlBQVk7QUFDeEM7OztBQ2xJTyxJQUFNLGFBQW1DO0FBQUEsRUFDNUMsRUFBRSxJQUFJLFVBQVUsT0FBTyxVQUFVLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxFQUFFO0FBQUEsRUFDNUYsRUFBRSxJQUFJLGVBQWUsT0FBTyxlQUFlLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxFQUFFO0FBQUEsRUFDdEcsRUFBRSxJQUFJLFNBQVMsT0FBTyxTQUFTLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxFQUFFO0FBQUEsRUFDMUYsRUFBRSxJQUFJLFdBQVcsT0FBTyxXQUFXLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxFQUFFO0FBQUEsRUFDOUYsRUFBRSxJQUFJLFdBQVcsT0FBTyxXQUFXLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxFQUFFO0FBQUEsRUFDOUYsRUFBRSxJQUFJLFVBQVUsT0FBTyxVQUFVLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxFQUFFO0FBQUEsRUFDNUYsRUFBRSxJQUFJLFdBQVcsT0FBTyxXQUFXLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxFQUFFO0FBQUEsRUFDOUYsRUFBRSxJQUFJLE9BQU8sT0FBTyxPQUFPLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxFQUFFO0FBQUEsRUFDdEYsRUFBRSxJQUFJLE9BQU8sT0FBTyxPQUFPLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxFQUFF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
