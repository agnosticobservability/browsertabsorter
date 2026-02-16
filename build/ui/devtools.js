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
                ${tab.favIconUrl ? `<img src="${tab.favIconUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'">` : ""}
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
            ${tab.favIconUrl ? `<img src="${tab.favIconUrl}" class="tab-icon" onerror="this.style.display='none'">` : '<div class="tab-icon"></div>'}
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC9sb2dnZXIudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZXh0cmFjdGlvbi9sb2dpYy50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9leHRyYWN0aW9uL2dlbmVyYVJlZ2lzdHJ5LnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3N0b3JhZ2UudHMiLCAiLi4vLi4vc3JjL3NoYXJlZC91dGlscy50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9wcmVmZXJlbmNlcy50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9leHRyYWN0aW9uL2luZGV4LnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2NvbnRleHRBbmFseXNpcy50cyIsICIuLi8uLi9zcmMvc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy91aS9kZXZ0b29scy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgTG9nRW50cnksIExvZ0xldmVsLCBQcmVmZXJlbmNlcyB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmNvbnN0IFBSRUZJWCA9IFwiW1RhYlNvcnRlcl1cIjtcblxuY29uc3QgTEVWRUxfUFJJT1JJVFk6IFJlY29yZDxMb2dMZXZlbCwgbnVtYmVyPiA9IHtcbiAgZGVidWc6IDAsXG4gIGluZm86IDEsXG4gIHdhcm46IDIsXG4gIGVycm9yOiAzLFxuICBjcml0aWNhbDogNFxufTtcblxubGV0IGN1cnJlbnRMZXZlbDogTG9nTGV2ZWwgPSBcImluZm9cIjtcbmxldCBsb2dzOiBMb2dFbnRyeVtdID0gW107XG5jb25zdCBNQVhfTE9HUyA9IDEwMDA7XG5jb25zdCBTVE9SQUdFX0tFWSA9IFwic2Vzc2lvbkxvZ3NcIjtcblxuLy8gU2FmZSBjb250ZXh0IGNoZWNrXG5jb25zdCBpc1NlcnZpY2VXb3JrZXIgPSB0eXBlb2Ygc2VsZiAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZSAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYgaW5zdGFuY2VvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZTtcbmxldCBpc1NhdmluZyA9IGZhbHNlO1xubGV0IHBlbmRpbmdTYXZlID0gZmFsc2U7XG5sZXQgc2F2ZVRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuXG5jb25zdCBkb1NhdmUgPSAoKSA9PiB7XG4gICAgaWYgKCFpc1NlcnZpY2VXb3JrZXIgfHwgIWNocm9tZT8uc3RvcmFnZT8uc2Vzc2lvbiB8fCBpc1NhdmluZykge1xuICAgICAgICBwZW5kaW5nU2F2ZSA9IHRydWU7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpc1NhdmluZyA9IHRydWU7XG4gICAgcGVuZGluZ1NhdmUgPSBmYWxzZTtcblxuICAgIGNocm9tZS5zdG9yYWdlLnNlc3Npb24uc2V0KHsgW1NUT1JBR0VfS0VZXTogbG9ncyB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICAgICAgaWYgKHBlbmRpbmdTYXZlKSB7XG4gICAgICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgICAgICB9XG4gICAgfSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzYXZlIGxvZ3NcIiwgZXJyKTtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IHNhdmVMb2dzVG9TdG9yYWdlID0gKCkgPT4ge1xuICAgIGlmIChzYXZlVGltZXIpIGNsZWFyVGltZW91dChzYXZlVGltZXIpO1xuICAgIHNhdmVUaW1lciA9IHNldFRpbWVvdXQoZG9TYXZlLCAxMDAwKTtcbn07XG5cbmxldCByZXNvbHZlTG9nZ2VyUmVhZHk6ICgpID0+IHZvaWQ7XG5leHBvcnQgY29uc3QgbG9nZ2VyUmVhZHkgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcbiAgICByZXNvbHZlTG9nZ2VyUmVhZHkgPSByZXNvbHZlO1xufSk7XG5cbmV4cG9ydCBjb25zdCBpbml0TG9nZ2VyID0gYXN5bmMgKCkgPT4ge1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIgJiYgY2hyb21lPy5zdG9yYWdlPy5zZXNzaW9uKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uLmdldChTVE9SQUdFX0tFWSk7XG4gICAgICAgICAgICBpZiAocmVzdWx0W1NUT1JBR0VfS0VZXSAmJiBBcnJheS5pc0FycmF5KHJlc3VsdFtTVE9SQUdFX0tFWV0pKSB7XG4gICAgICAgICAgICAgICAgbG9ncyA9IHJlc3VsdFtTVE9SQUdFX0tFWV07XG4gICAgICAgICAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIGxvZ3MgPSBsb2dzLnNsaWNlKDAsIE1BWF9MT0dTKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byByZXN0b3JlIGxvZ3NcIiwgZSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHJlc29sdmVMb2dnZXJSZWFkeSkgcmVzb2x2ZUxvZ2dlclJlYWR5KCk7XG59O1xuXG5leHBvcnQgY29uc3Qgc2V0TG9nZ2VyUHJlZmVyZW5jZXMgPSAocHJlZnM6IFByZWZlcmVuY2VzKSA9PiB7XG4gIGlmIChwcmVmcy5sb2dMZXZlbCkge1xuICAgIGN1cnJlbnRMZXZlbCA9IHByZWZzLmxvZ0xldmVsO1xuICB9IGVsc2UgaWYgKHByZWZzLmRlYnVnKSB7XG4gICAgY3VycmVudExldmVsID0gXCJkZWJ1Z1wiO1xuICB9IGVsc2Uge1xuICAgIGN1cnJlbnRMZXZlbCA9IFwiaW5mb1wiO1xuICB9XG59O1xuXG5jb25zdCBzaG91bGRMb2cgPSAobGV2ZWw6IExvZ0xldmVsKTogYm9vbGVhbiA9PiB7XG4gIHJldHVybiBMRVZFTF9QUklPUklUWVtsZXZlbF0gPj0gTEVWRUxfUFJJT1JJVFlbY3VycmVudExldmVsXTtcbn07XG5cbmNvbnN0IGZvcm1hdE1lc3NhZ2UgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgcmV0dXJuIGNvbnRleHQgPyBgJHttZXNzYWdlfSA6OiAke0pTT04uc3RyaW5naWZ5KGNvbnRleHQpfWAgOiBtZXNzYWdlO1xufTtcblxuY29uc3QgYWRkTG9nID0gKGxldmVsOiBMb2dMZXZlbCwgbWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgLy8gQWx3YXlzIGFkZCB0byBidWZmZXIgcmVnYXJkbGVzcyBvZiBjdXJyZW50IGNvbnNvbGUgbGV2ZWwgc2V0dGluZyxcbiAgLy8gb3Igc2hvdWxkIHdlIHJlc3BlY3QgaXQ/IFVzdWFsbHkgZGVidWcgbG9ncyBhcmUgbm9pc3kuXG4gIC8vIExldCdzIHJlc3BlY3Qgc2hvdWxkTG9nIGZvciB0aGUgYnVmZmVyIHRvbyB0byBzYXZlIG1lbW9yeS9ub2lzZSxcbiAgLy8gT1Igd2UgY2FuIHN0b3JlIGV2ZXJ5dGhpbmcgYnV0IGZpbHRlciBvbiB2aWV3LlxuICAvLyBHaXZlbiB3ZSB3YW50IHRvIGRlYnVnIGlzc3Vlcywgc3RvcmluZyBldmVyeXRoaW5nIG1pZ2h0IGJlIGJldHRlcixcbiAgLy8gYnV0IGlmIHdlIHN0b3JlIGV2ZXJ5dGhpbmcgd2UgbWlnaHQgZmlsbCBidWZmZXIgd2l0aCBkZWJ1ZyBub2lzZSBxdWlja2x5LlxuICAvLyBMZXQncyBzdGljayB0byBzdG9yaW5nIHdoYXQgaXMgY29uZmlndXJlZCB0byBiZSBsb2dnZWQuXG4gIC8vIFdhaXQsIGlmIEkgd2FudCB0byBcImRlYnVnXCIgc29tZXRoaW5nLCBJIHVzdWFsbHkgdHVybiBvbiBkZWJ1ZyBsb2dzLlxuICAvLyBJZiBJIGNhbid0IHNlZSBwYXN0IGxvZ3MgYmVjYXVzZSB0aGV5IHdlcmVuJ3Qgc3RvcmVkLCBJIGhhdmUgdG8gcmVwcm8uXG4gIC8vIExldCdzIHN0b3JlIGlmIGl0IHBhc3NlcyBgc2hvdWxkTG9nYC5cblxuICBpZiAoc2hvdWxkTG9nKGxldmVsKSkge1xuICAgICAgY29uc3QgZW50cnk6IExvZ0VudHJ5ID0ge1xuICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgICAgICBsZXZlbCxcbiAgICAgICAgICBtZXNzYWdlLFxuICAgICAgICAgIGNvbnRleHRcbiAgICAgIH07XG5cbiAgICAgIGlmIChpc1NlcnZpY2VXb3JrZXIpIHtcbiAgICAgICAgICBsb2dzLnVuc2hpZnQoZW50cnkpO1xuICAgICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICAgIGxvZ3MucG9wKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEluIG90aGVyIGNvbnRleHRzLCBzZW5kIHRvIFNXXG4gICAgICAgICAgaWYgKGNocm9tZT8ucnVudGltZT8uc2VuZE1lc3NhZ2UpIHtcbiAgICAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2dFbnRyeScsIHBheWxvYWQ6IGVudHJ5IH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgLy8gSWdub3JlIGlmIG1lc3NhZ2UgZmFpbHMgKGUuZy4gY29udGV4dCBpbnZhbGlkYXRlZClcbiAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICB9XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBhZGRMb2dFbnRyeSA9IChlbnRyeTogTG9nRW50cnkpID0+IHtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSB7XG4gICAgICAgIGxvZ3MudW5zaGlmdChlbnRyeSk7XG4gICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICBsb2dzLnBvcCgpO1xuICAgICAgICB9XG4gICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGdldExvZ3MgPSAoKSA9PiBbLi4ubG9nc107XG5leHBvcnQgY29uc3QgY2xlYXJMb2dzID0gKCkgPT4ge1xuICAgIGxvZ3MubGVuZ3RoID0gMDtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSBzYXZlTG9nc1RvU3RvcmFnZSgpO1xufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0RlYnVnID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImRlYnVnXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiZGVidWdcIikpIHtcbiAgICBjb25zb2xlLmRlYnVnKGAke1BSRUZJWH0gW0RFQlVHXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dJbmZvID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImluZm9cIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJpbmZvXCIpKSB7XG4gICAgY29uc29sZS5pbmZvKGAke1BSRUZJWH0gW0lORk9dICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ1dhcm4gPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwid2FyblwiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcIndhcm5cIikpIHtcbiAgICBjb25zb2xlLndhcm4oYCR7UFJFRklYfSBbV0FSTl0gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nRXJyb3IgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiZXJyb3JcIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJlcnJvclwiKSkge1xuICAgIGNvbnNvbGUuZXJyb3IoYCR7UFJFRklYfSBbRVJST1JdICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0NyaXRpY2FsID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImNyaXRpY2FsXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiY3JpdGljYWxcIikpIHtcbiAgICAvLyBDcml0aWNhbCBsb2dzIHVzZSBlcnJvciBjb25zb2xlIGJ1dCB3aXRoIGRpc3RpbmN0IHByZWZpeCBhbmQgbWF5YmUgc3R5bGluZyBpZiBzdXBwb3J0ZWRcbiAgICBjb25zb2xlLmVycm9yKGAke1BSRUZJWH0gW0NSSVRJQ0FMXSBcdUQ4M0RcdURFQTggJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuIiwgIi8vIGxvZ2ljLnRzXG4vLyBQdXJlIGZ1bmN0aW9ucyBmb3IgZXh0cmFjdGlvbiBsb2dpY1xuXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplVXJsKHVybFN0cjogc3RyaW5nKTogc3RyaW5nIHtcbiAgdHJ5IHtcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHVybFN0cik7XG4gICAgY29uc3QgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh1cmwuc2VhcmNoKTtcbiAgICBjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICAgIHBhcmFtcy5mb3JFYWNoKChfLCBrZXkpID0+IGtleXMucHVzaChrZXkpKTtcbiAgICBjb25zdCBob3N0bmFtZSA9IHVybC5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgJycpO1xuXG4gICAgY29uc3QgVFJBQ0tJTkcgPSBbL151dG1fLywgL15mYmNsaWQkLywgL15nY2xpZCQvLCAvXl9nYSQvLCAvXnJlZiQvLCAvXnljbGlkJC8sIC9eX2hzL107XG4gICAgY29uc3QgaXNZb3V0dWJlID0gaG9zdG5hbWUuZW5kc1dpdGgoJ3lvdXR1YmUuY29tJykgfHwgaG9zdG5hbWUuZW5kc1dpdGgoJ3lvdXR1LmJlJyk7XG4gICAgY29uc3QgaXNHb29nbGUgPSBob3N0bmFtZS5lbmRzV2l0aCgnZ29vZ2xlLmNvbScpO1xuXG4gICAgY29uc3Qga2VlcDogc3RyaW5nW10gPSBbXTtcbiAgICBpZiAoaXNZb3V0dWJlKSBrZWVwLnB1c2goJ3YnLCAnbGlzdCcsICd0JywgJ2MnLCAnY2hhbm5lbCcsICdwbGF5bGlzdCcpO1xuICAgIGlmIChpc0dvb2dsZSkga2VlcC5wdXNoKCdxJywgJ2lkJywgJ3NvdXJjZWlkJyk7XG5cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgICBpZiAoVFJBQ0tJTkcuc29tZShyID0+IHIudGVzdChrZXkpKSkge1xuICAgICAgICAgcGFyYW1zLmRlbGV0ZShrZXkpO1xuICAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoKGlzWW91dHViZSB8fCBpc0dvb2dsZSkgJiYgIWtlZXAuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgICAgcGFyYW1zLmRlbGV0ZShrZXkpO1xuICAgICAgfVxuICAgIH1cbiAgICB1cmwuc2VhcmNoID0gcGFyYW1zLnRvU3RyaW5nKCk7XG4gICAgcmV0dXJuIHVybC50b1N0cmluZygpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIHVybFN0cjtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VZb3VUdWJlVXJsKHVybFN0cjogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgdXJsID0gbmV3IFVSTCh1cmxTdHIpO1xuICAgICAgICBjb25zdCB2ID0gdXJsLnNlYXJjaFBhcmFtcy5nZXQoJ3YnKTtcbiAgICAgICAgY29uc3QgaXNTaG9ydHMgPSB1cmwucGF0aG5hbWUuaW5jbHVkZXMoJy9zaG9ydHMvJyk7XG4gICAgICAgIGxldCB2aWRlb0lkID1cbiAgICAgICAgICB2IHx8XG4gICAgICAgICAgKGlzU2hvcnRzID8gdXJsLnBhdGhuYW1lLnNwbGl0KCcvc2hvcnRzLycpWzFdIDogbnVsbCkgfHxcbiAgICAgICAgICAodXJsLmhvc3RuYW1lID09PSAneW91dHUuYmUnID8gdXJsLnBhdGhuYW1lLnJlcGxhY2UoJy8nLCAnJykgOiBudWxsKTtcblxuICAgICAgICBjb25zdCBwbGF5bGlzdElkID0gdXJsLnNlYXJjaFBhcmFtcy5nZXQoJ2xpc3QnKTtcbiAgICAgICAgY29uc3QgcGxheWxpc3RJbmRleCA9IHBhcnNlSW50KHVybC5zZWFyY2hQYXJhbXMuZ2V0KCdpbmRleCcpIHx8ICcwJywgMTApO1xuXG4gICAgICAgIHJldHVybiB7IHZpZGVvSWQsIGlzU2hvcnRzLCBwbGF5bGlzdElkLCBwbGF5bGlzdEluZGV4IH07XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4geyB2aWRlb0lkOiBudWxsLCBpc1Nob3J0czogZmFsc2UsIHBsYXlsaXN0SWQ6IG51bGwsIHBsYXlsaXN0SW5kZXg6IG51bGwgfTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0SnNvbkxkRmllbGRzKGpzb25MZDogYW55W10pIHtcbiAgICBsZXQgYXV0aG9yOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgcHVibGlzaGVkQXQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIGxldCBtb2RpZmllZEF0OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgdGFnczogc3RyaW5nW10gPSBbXTtcbiAgICBsZXQgYnJlYWRjcnVtYnM6IHN0cmluZ1tdID0gW107XG5cbiAgICAvLyBGaW5kIG1haW4gZW50aXR5XG4gICAgLy8gQWRkZWQgc2FmZXR5IGNoZWNrOiBpICYmIGlbJ0B0eXBlJ11cbiAgICBjb25zdCBtYWluRW50aXR5ID0ganNvbkxkLmZpbmQoaSA9PiBpICYmIChpWydAdHlwZSddID09PSAnQXJ0aWNsZScgfHwgaVsnQHR5cGUnXSA9PT0gJ1ZpZGVvT2JqZWN0JyB8fCBpWydAdHlwZSddID09PSAnTmV3c0FydGljbGUnKSkgfHwganNvbkxkWzBdO1xuXG4gICAgaWYgKG1haW5FbnRpdHkpIHtcbiAgICAgICBpZiAobWFpbkVudGl0eS5hdXRob3IpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIG1haW5FbnRpdHkuYXV0aG9yID09PSAnc3RyaW5nJykgYXV0aG9yID0gbWFpbkVudGl0eS5hdXRob3I7XG4gICAgICAgICAgZWxzZSBpZiAobWFpbkVudGl0eS5hdXRob3IubmFtZSkgYXV0aG9yID0gbWFpbkVudGl0eS5hdXRob3IubmFtZTtcbiAgICAgICAgICBlbHNlIGlmIChBcnJheS5pc0FycmF5KG1haW5FbnRpdHkuYXV0aG9yKSAmJiBtYWluRW50aXR5LmF1dGhvclswXT8ubmFtZSkgYXV0aG9yID0gbWFpbkVudGl0eS5hdXRob3JbMF0ubmFtZTtcbiAgICAgICB9XG4gICAgICAgaWYgKG1haW5FbnRpdHkuZGF0ZVB1Ymxpc2hlZCkgcHVibGlzaGVkQXQgPSBtYWluRW50aXR5LmRhdGVQdWJsaXNoZWQ7XG4gICAgICAgaWYgKG1haW5FbnRpdHkuZGF0ZU1vZGlmaWVkKSBtb2RpZmllZEF0ID0gbWFpbkVudGl0eS5kYXRlTW9kaWZpZWQ7XG4gICAgICAgaWYgKG1haW5FbnRpdHkua2V5d29yZHMpIHtcbiAgICAgICAgIGlmICh0eXBlb2YgbWFpbkVudGl0eS5rZXl3b3JkcyA9PT0gJ3N0cmluZycpIHRhZ3MgPSBtYWluRW50aXR5LmtleXdvcmRzLnNwbGl0KCcsJykubWFwKChzOiBzdHJpbmcpID0+IHMudHJpbSgpKTtcbiAgICAgICAgIGVsc2UgaWYgKEFycmF5LmlzQXJyYXkobWFpbkVudGl0eS5rZXl3b3JkcykpIHRhZ3MgPSBtYWluRW50aXR5LmtleXdvcmRzO1xuICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBZGRlZCBzYWZldHkgY2hlY2s6IGkgJiYgaVsnQHR5cGUnXVxuICAgIGNvbnN0IGJyZWFkY3J1bWJMZCA9IGpzb25MZC5maW5kKGkgPT4gaSAmJiBpWydAdHlwZSddID09PSAnQnJlYWRjcnVtYkxpc3QnKTtcbiAgICBpZiAoYnJlYWRjcnVtYkxkICYmIEFycmF5LmlzQXJyYXkoYnJlYWRjcnVtYkxkLml0ZW1MaXN0RWxlbWVudCkpIHtcbiAgICAgICBjb25zdCBsaXN0ID0gYnJlYWRjcnVtYkxkLml0ZW1MaXN0RWxlbWVudC5zb3J0KChhOiBhbnksIGI6IGFueSkgPT4gYS5wb3NpdGlvbiAtIGIucG9zaXRpb24pO1xuICAgICAgIGxpc3QuZm9yRWFjaCgoaXRlbTogYW55KSA9PiB7XG4gICAgICAgICBpZiAoaXRlbS5uYW1lKSBicmVhZGNydW1icy5wdXNoKGl0ZW0ubmFtZSk7XG4gICAgICAgICBlbHNlIGlmIChpdGVtLml0ZW0gJiYgaXRlbS5pdGVtLm5hbWUpIGJyZWFkY3J1bWJzLnB1c2goaXRlbS5pdGVtLm5hbWUpO1xuICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiB7IGF1dGhvciwgcHVibGlzaGVkQXQsIG1vZGlmaWVkQXQsIHRhZ3MsIGJyZWFkY3J1bWJzIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0WW91VHViZUNoYW5uZWxGcm9tSHRtbChodG1sOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgLy8gMS4gVHJ5IEpTT04tTERcbiAgLy8gTG9vayBmb3IgPHNjcmlwdCB0eXBlPVwiYXBwbGljYXRpb24vbGQranNvblwiPi4uLjwvc2NyaXB0PlxuICAvLyBXZSBuZWVkIHRvIGxvb3AgYmVjYXVzZSB0aGVyZSBtaWdodCBiZSBtdWx0aXBsZSBzY3JpcHRzXG4gIGNvbnN0IHNjcmlwdFJlZ2V4ID0gLzxzY3JpcHRcXHMrdHlwZT1bXCInXWFwcGxpY2F0aW9uXFwvbGRcXCtqc29uW1wiJ11bXj5dKj4oW1xcc1xcU10qPyk8XFwvc2NyaXB0Pi9naTtcbiAgbGV0IG1hdGNoO1xuICB3aGlsZSAoKG1hdGNoID0gc2NyaXB0UmVnZXguZXhlYyhodG1sKSkgIT09IG51bGwpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QganNvbiA9IEpTT04ucGFyc2UobWF0Y2hbMV0pO1xuICAgICAgICAgIGNvbnN0IGFycmF5ID0gQXJyYXkuaXNBcnJheShqc29uKSA/IGpzb24gOiBbanNvbl07XG4gICAgICAgICAgY29uc3QgZmllbGRzID0gZXh0cmFjdEpzb25MZEZpZWxkcyhhcnJheSk7XG4gICAgICAgICAgaWYgKGZpZWxkcy5hdXRob3IpIHJldHVybiBmaWVsZHMuYXV0aG9yO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIC8vIGlnbm9yZSBwYXJzZSBlcnJvcnNcbiAgICAgIH1cbiAgfVxuXG4gIC8vIDIuIFRyeSA8bGluayBpdGVtcHJvcD1cIm5hbWVcIiBjb250ZW50PVwiLi4uXCI+IChZb3VUdWJlIG9mdGVuIHB1dHMgY2hhbm5lbCBuYW1lIGhlcmUgaW4gc29tZSBjb250ZXh0cylcbiAgLy8gT3IgPG1ldGEgaXRlbXByb3A9XCJjaGFubmVsSWRcIiBjb250ZW50PVwiLi4uXCI+IC0+IGJ1dCB0aGF0J3MgSUQuXG4gIC8vIDxsaW5rIGl0ZW1wcm9wPVwibmFtZVwiIGNvbnRlbnQ9XCJDaGFubmVsIE5hbWVcIj5cbiAgLy8gPHNwYW4gaXRlbXByb3A9XCJhdXRob3JcIiBpdGVtc2NvcGUgaXRlbXR5cGU9XCJodHRwOi8vc2NoZW1hLm9yZy9QZXJzb25cIj48bGluayBpdGVtcHJvcD1cIm5hbWVcIiBjb250ZW50PVwiQ2hhbm5lbCBOYW1lXCI+PC9zcGFuPlxuICBjb25zdCBsaW5rTmFtZVJlZ2V4ID0gLzxsaW5rXFxzK2l0ZW1wcm9wPVtcIiddbmFtZVtcIiddXFxzK2NvbnRlbnQ9W1wiJ10oW15cIiddKylbXCInXVxccypcXC8/Pi9pO1xuICBjb25zdCBsaW5rTWF0Y2ggPSBsaW5rTmFtZVJlZ2V4LmV4ZWMoaHRtbCk7XG4gIGlmIChsaW5rTWF0Y2ggJiYgbGlua01hdGNoWzFdKSByZXR1cm4gZGVjb2RlSHRtbEVudGl0aWVzKGxpbmtNYXRjaFsxXSk7XG5cbiAgLy8gMy4gVHJ5IG1ldGEgYXV0aG9yXG4gIGNvbnN0IG1ldGFBdXRob3JSZWdleCA9IC88bWV0YVxccytuYW1lPVtcIiddYXV0aG9yW1wiJ11cXHMrY29udGVudD1bXCInXShbXlwiJ10rKVtcIiddXFxzKlxcLz8+L2k7XG4gIGNvbnN0IG1ldGFNYXRjaCA9IG1ldGFBdXRob3JSZWdleC5leGVjKGh0bWwpO1xuICBpZiAobWV0YU1hdGNoICYmIG1ldGFNYXRjaFsxXSkge1xuICAgICAgLy8gWW91VHViZSBtZXRhIGF1dGhvciBpcyBvZnRlbiBcIkNoYW5uZWwgTmFtZVwiXG4gICAgICByZXR1cm4gZGVjb2RlSHRtbEVudGl0aWVzKG1ldGFNYXRjaFsxXSk7XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RZb3VUdWJlR2VucmVGcm9tSHRtbChodG1sOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgLy8gMS4gVHJ5IDxtZXRhIGl0ZW1wcm9wPVwiZ2VucmVcIiBjb250ZW50PVwiLi4uXCI+XG4gIGNvbnN0IG1ldGFHZW5yZVJlZ2V4ID0gLzxtZXRhXFxzK2l0ZW1wcm9wPVtcIiddZ2VucmVbXCInXVxccytjb250ZW50PVtcIiddKFteXCInXSspW1wiJ11cXHMqXFwvPz4vaTtcbiAgY29uc3QgbWV0YU1hdGNoID0gbWV0YUdlbnJlUmVnZXguZXhlYyhodG1sKTtcbiAgaWYgKG1ldGFNYXRjaCAmJiBtZXRhTWF0Y2hbMV0pIHtcbiAgICAgIHJldHVybiBkZWNvZGVIdG1sRW50aXRpZXMobWV0YU1hdGNoWzFdKTtcbiAgfVxuXG4gIC8vIDIuIFRyeSBKU09OIFwiY2F0ZWdvcnlcIiBpbiBzY3JpcHRzXG4gIC8vIFwiY2F0ZWdvcnlcIjpcIkdhbWluZ1wiXG4gIGNvbnN0IGNhdGVnb3J5UmVnZXggPSAvXCJjYXRlZ29yeVwiXFxzKjpcXHMqXCIoW15cIl0rKVwiLztcbiAgY29uc3QgY2F0TWF0Y2ggPSBjYXRlZ29yeVJlZ2V4LmV4ZWMoaHRtbCk7XG4gIGlmIChjYXRNYXRjaCAmJiBjYXRNYXRjaFsxXSkge1xuICAgICAgcmV0dXJuIGRlY29kZUh0bWxFbnRpdGllcyhjYXRNYXRjaFsxXSk7XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gZGVjb2RlSHRtbEVudGl0aWVzKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGlmICghdGV4dCkgcmV0dXJuIHRleHQ7XG5cbiAgY29uc3QgZW50aXRpZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgJyZhbXA7JzogJyYnLFxuICAgICcmbHQ7JzogJzwnLFxuICAgICcmZ3Q7JzogJz4nLFxuICAgICcmcXVvdDsnOiAnXCInLFxuICAgICcmIzM5Oyc6IFwiJ1wiLFxuICAgICcmYXBvczsnOiBcIidcIixcbiAgICAnJm5ic3A7JzogJyAnXG4gIH07XG5cbiAgcmV0dXJuIHRleHQucmVwbGFjZSgvJihbYS16MC05XSt8I1swLTldezEsNn18I3hbMC05YS1mQS1GXXsxLDZ9KTsvaWcsIChtYXRjaCkgPT4ge1xuICAgICAgY29uc3QgbG93ZXIgPSBtYXRjaC50b0xvd2VyQ2FzZSgpO1xuICAgICAgaWYgKGVudGl0aWVzW2xvd2VyXSkgcmV0dXJuIGVudGl0aWVzW2xvd2VyXTtcbiAgICAgIGlmIChlbnRpdGllc1ttYXRjaF0pIHJldHVybiBlbnRpdGllc1ttYXRjaF07XG5cbiAgICAgIGlmIChsb3dlci5zdGFydHNXaXRoKCcmI3gnKSkge1xuICAgICAgICAgIHRyeSB7IHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnNlSW50KGxvd2VyLnNsaWNlKDMsIC0xKSwgMTYpKTsgfSBjYXRjaCB7IHJldHVybiBtYXRjaDsgfVxuICAgICAgfVxuICAgICAgaWYgKGxvd2VyLnN0YXJ0c1dpdGgoJyYjJykpIHtcbiAgICAgICAgICB0cnkgeyByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJzZUludChsb3dlci5zbGljZSgyLCAtMSksIDEwKSk7IH0gY2F0Y2ggeyByZXR1cm4gbWF0Y2g7IH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBtYXRjaDtcbiAgfSk7XG59XG4iLCAiXG5leHBvcnQgY29uc3QgR0VORVJBX1JFR0lTVFJZOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAvLyBTZWFyY2hcbiAgJ2dvb2dsZS5jb20nOiAnU2VhcmNoJyxcbiAgJ2JpbmcuY29tJzogJ1NlYXJjaCcsXG4gICdkdWNrZHVja2dvLmNvbSc6ICdTZWFyY2gnLFxuICAneWFob28uY29tJzogJ1NlYXJjaCcsXG4gICdiYWlkdS5jb20nOiAnU2VhcmNoJyxcbiAgJ3lhbmRleC5jb20nOiAnU2VhcmNoJyxcbiAgJ2thZ2kuY29tJzogJ1NlYXJjaCcsXG4gICdlY29zaWEub3JnJzogJ1NlYXJjaCcsXG5cbiAgLy8gU29jaWFsXG4gICdmYWNlYm9vay5jb20nOiAnU29jaWFsJyxcbiAgJ3R3aXR0ZXIuY29tJzogJ1NvY2lhbCcsXG4gICd4LmNvbSc6ICdTb2NpYWwnLFxuICAnaW5zdGFncmFtLmNvbSc6ICdTb2NpYWwnLFxuICAnbGlua2VkaW4uY29tJzogJ1NvY2lhbCcsXG4gICdyZWRkaXQuY29tJzogJ1NvY2lhbCcsXG4gICd0aWt0b2suY29tJzogJ1NvY2lhbCcsXG4gICdwaW50ZXJlc3QuY29tJzogJ1NvY2lhbCcsXG4gICdzbmFwY2hhdC5jb20nOiAnU29jaWFsJyxcbiAgJ3R1bWJsci5jb20nOiAnU29jaWFsJyxcbiAgJ3RocmVhZHMubmV0JzogJ1NvY2lhbCcsXG4gICdibHVlc2t5LmFwcCc6ICdTb2NpYWwnLFxuICAnbWFzdG9kb24uc29jaWFsJzogJ1NvY2lhbCcsXG5cbiAgLy8gVmlkZW9cbiAgJ3lvdXR1YmUuY29tJzogJ1ZpZGVvJyxcbiAgJ3lvdXR1LmJlJzogJ1ZpZGVvJyxcbiAgJ3ZpbWVvLmNvbSc6ICdWaWRlbycsXG4gICd0d2l0Y2gudHYnOiAnVmlkZW8nLFxuICAnbmV0ZmxpeC5jb20nOiAnVmlkZW8nLFxuICAnaHVsdS5jb20nOiAnVmlkZW8nLFxuICAnZGlzbmV5cGx1cy5jb20nOiAnVmlkZW8nLFxuICAnZGFpbHltb3Rpb24uY29tJzogJ1ZpZGVvJyxcbiAgJ3ByaW1ldmlkZW8uY29tJzogJ1ZpZGVvJyxcbiAgJ2hib21heC5jb20nOiAnVmlkZW8nLFxuICAnbWF4LmNvbSc6ICdWaWRlbycsXG4gICdwZWFjb2NrdHYuY29tJzogJ1ZpZGVvJyxcblxuICAvLyBEZXZlbG9wbWVudFxuICAnZ2l0aHViLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdnaXRsYWIuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ3N0YWNrb3ZlcmZsb3cuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ25wbWpzLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdweXBpLm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICdkZXZlbG9wZXIubW96aWxsYS5vcmcnOiAnRGV2ZWxvcG1lbnQnLFxuICAndzNzY2hvb2xzLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdnZWVrc2ZvcmdlZWtzLm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICdqaXJhLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdhdGxhc3NpYW4ubmV0JzogJ0RldmVsb3BtZW50JywgLy8gb2Z0ZW4gamlyYVxuICAnYml0YnVja2V0Lm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICdkZXYudG8nOiAnRGV2ZWxvcG1lbnQnLFxuICAnaGFzaG5vZGUuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ21lZGl1bS5jb20nOiAnRGV2ZWxvcG1lbnQnLCAvLyBHZW5lcmFsIGJ1dCBvZnRlbiBkZXZcbiAgJ3ZlcmNlbC5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnbmV0bGlmeS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnaGVyb2t1LmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdhd3MuYW1hem9uLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdjb25zb2xlLmF3cy5hbWF6b24uY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2Nsb3VkLmdvb2dsZS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnYXp1cmUubWljcm9zb2Z0LmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdwb3J0YWwuYXp1cmUuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2RvY2tlci5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAna3ViZXJuZXRlcy5pbyc6ICdEZXZlbG9wbWVudCcsXG5cbiAgLy8gTmV3c1xuICAnY25uLmNvbSc6ICdOZXdzJyxcbiAgJ2JiYy5jb20nOiAnTmV3cycsXG4gICdueXRpbWVzLmNvbSc6ICdOZXdzJyxcbiAgJ3dhc2hpbmd0b25wb3N0LmNvbSc6ICdOZXdzJyxcbiAgJ3RoZWd1YXJkaWFuLmNvbSc6ICdOZXdzJyxcbiAgJ2ZvcmJlcy5jb20nOiAnTmV3cycsXG4gICdibG9vbWJlcmcuY29tJzogJ05ld3MnLFxuICAncmV1dGVycy5jb20nOiAnTmV3cycsXG4gICd3c2ouY29tJzogJ05ld3MnLFxuICAnY25iYy5jb20nOiAnTmV3cycsXG4gICdodWZmcG9zdC5jb20nOiAnTmV3cycsXG4gICduZXdzLmdvb2dsZS5jb20nOiAnTmV3cycsXG4gICdmb3huZXdzLmNvbSc6ICdOZXdzJyxcbiAgJ25iY25ld3MuY29tJzogJ05ld3MnLFxuICAnYWJjbmV3cy5nby5jb20nOiAnTmV3cycsXG4gICd1c2F0b2RheS5jb20nOiAnTmV3cycsXG5cbiAgLy8gU2hvcHBpbmdcbiAgJ2FtYXpvbi5jb20nOiAnU2hvcHBpbmcnLFxuICAnZWJheS5jb20nOiAnU2hvcHBpbmcnLFxuICAnd2FsbWFydC5jb20nOiAnU2hvcHBpbmcnLFxuICAnZXRzeS5jb20nOiAnU2hvcHBpbmcnLFxuICAndGFyZ2V0LmNvbSc6ICdTaG9wcGluZycsXG4gICdiZXN0YnV5LmNvbSc6ICdTaG9wcGluZycsXG4gICdhbGlleHByZXNzLmNvbSc6ICdTaG9wcGluZycsXG4gICdzaG9waWZ5LmNvbSc6ICdTaG9wcGluZycsXG4gICd0ZW11LmNvbSc6ICdTaG9wcGluZycsXG4gICdzaGVpbi5jb20nOiAnU2hvcHBpbmcnLFxuICAnd2F5ZmFpci5jb20nOiAnU2hvcHBpbmcnLFxuICAnY29zdGNvLmNvbSc6ICdTaG9wcGluZycsXG5cbiAgLy8gQ29tbXVuaWNhdGlvblxuICAnbWFpbC5nb29nbGUuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnb3V0bG9vay5saXZlLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3NsYWNrLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ2Rpc2NvcmQuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnem9vbS51cyc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3RlYW1zLm1pY3Jvc29mdC5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICd3aGF0c2FwcC5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICd0ZWxlZ3JhbS5vcmcnOiAnQ29tbXVuaWNhdGlvbicsXG4gICdtZXNzZW5nZXIuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnc2t5cGUuY29tJzogJ0NvbW11bmljYXRpb24nLFxuXG4gIC8vIEZpbmFuY2VcbiAgJ3BheXBhbC5jb20nOiAnRmluYW5jZScsXG4gICdjaGFzZS5jb20nOiAnRmluYW5jZScsXG4gICdiYW5rb2ZhbWVyaWNhLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3dlbGxzZmFyZ28uY29tJzogJ0ZpbmFuY2UnLFxuICAnYW1lcmljYW5leHByZXNzLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3N0cmlwZS5jb20nOiAnRmluYW5jZScsXG4gICdjb2luYmFzZS5jb20nOiAnRmluYW5jZScsXG4gICdiaW5hbmNlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2tyYWtlbi5jb20nOiAnRmluYW5jZScsXG4gICdyb2Jpbmhvb2QuY29tJzogJ0ZpbmFuY2UnLFxuICAnZmlkZWxpdHkuY29tJzogJ0ZpbmFuY2UnLFxuICAndmFuZ3VhcmQuY29tJzogJ0ZpbmFuY2UnLFxuICAnc2Nod2FiLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ21pbnQuaW50dWl0LmNvbSc6ICdGaW5hbmNlJyxcblxuICAvLyBFZHVjYXRpb25cbiAgJ3dpa2lwZWRpYS5vcmcnOiAnRWR1Y2F0aW9uJyxcbiAgJ2NvdXJzZXJhLm9yZyc6ICdFZHVjYXRpb24nLFxuICAndWRlbXkuY29tJzogJ0VkdWNhdGlvbicsXG4gICdlZHgub3JnJzogJ0VkdWNhdGlvbicsXG4gICdraGFuYWNhZGVteS5vcmcnOiAnRWR1Y2F0aW9uJyxcbiAgJ3F1aXpsZXQuY29tJzogJ0VkdWNhdGlvbicsXG4gICdkdW9saW5nby5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2NhbnZhcy5pbnN0cnVjdHVyZS5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2JsYWNrYm9hcmQuY29tJzogJ0VkdWNhdGlvbicsXG4gICdtaXQuZWR1JzogJ0VkdWNhdGlvbicsXG4gICdoYXJ2YXJkLmVkdSc6ICdFZHVjYXRpb24nLFxuICAnc3RhbmZvcmQuZWR1JzogJ0VkdWNhdGlvbicsXG4gICdhY2FkZW1pYS5lZHUnOiAnRWR1Y2F0aW9uJyxcbiAgJ3Jlc2VhcmNoZ2F0ZS5uZXQnOiAnRWR1Y2F0aW9uJyxcblxuICAvLyBEZXNpZ25cbiAgJ2ZpZ21hLmNvbSc6ICdEZXNpZ24nLFxuICAnY2FudmEuY29tJzogJ0Rlc2lnbicsXG4gICdiZWhhbmNlLm5ldCc6ICdEZXNpZ24nLFxuICAnZHJpYmJibGUuY29tJzogJ0Rlc2lnbicsXG4gICdhZG9iZS5jb20nOiAnRGVzaWduJyxcbiAgJ3Vuc3BsYXNoLmNvbSc6ICdEZXNpZ24nLFxuICAncGV4ZWxzLmNvbSc6ICdEZXNpZ24nLFxuICAncGl4YWJheS5jb20nOiAnRGVzaWduJyxcbiAgJ3NodXR0ZXJzdG9jay5jb20nOiAnRGVzaWduJyxcblxuICAvLyBQcm9kdWN0aXZpdHlcbiAgJ2RvY3MuZ29vZ2xlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnc2hlZXRzLmdvb2dsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ3NsaWRlcy5nb29nbGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdkcml2ZS5nb29nbGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdub3Rpb24uc28nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ3RyZWxsby5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2FzYW5hLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnbW9uZGF5LmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnYWlydGFibGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdldmVybm90ZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2Ryb3Bib3guY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdjbGlja3VwLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnbGluZWFyLmFwcCc6ICdQcm9kdWN0aXZpdHknLFxuICAnbWlyby5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2x1Y2lkY2hhcnQuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG5cbiAgLy8gQUlcbiAgJ29wZW5haS5jb20nOiAnQUknLFxuICAnY2hhdGdwdC5jb20nOiAnQUknLFxuICAnYW50aHJvcGljLmNvbSc6ICdBSScsXG4gICdtaWRqb3VybmV5LmNvbSc6ICdBSScsXG4gICdodWdnaW5nZmFjZS5jbyc6ICdBSScsXG4gICdiYXJkLmdvb2dsZS5jb20nOiAnQUknLFxuICAnZ2VtaW5pLmdvb2dsZS5jb20nOiAnQUknLFxuICAnY2xhdWRlLmFpJzogJ0FJJyxcbiAgJ3BlcnBsZXhpdHkuYWknOiAnQUknLFxuICAncG9lLmNvbSc6ICdBSScsXG5cbiAgLy8gTXVzaWMvQXVkaW9cbiAgJ3Nwb3RpZnkuY29tJzogJ011c2ljJyxcbiAgJ3NvdW5kY2xvdWQuY29tJzogJ011c2ljJyxcbiAgJ211c2ljLmFwcGxlLmNvbSc6ICdNdXNpYycsXG4gICdwYW5kb3JhLmNvbSc6ICdNdXNpYycsXG4gICd0aWRhbC5jb20nOiAnTXVzaWMnLFxuICAnYmFuZGNhbXAuY29tJzogJ011c2ljJyxcbiAgJ2F1ZGlibGUuY29tJzogJ011c2ljJyxcblxuICAvLyBHYW1pbmdcbiAgJ3N0ZWFtcG93ZXJlZC5jb20nOiAnR2FtaW5nJyxcbiAgJ3JvYmxveC5jb20nOiAnR2FtaW5nJyxcbiAgJ2VwaWNnYW1lcy5jb20nOiAnR2FtaW5nJyxcbiAgJ3hib3guY29tJzogJ0dhbWluZycsXG4gICdwbGF5c3RhdGlvbi5jb20nOiAnR2FtaW5nJyxcbiAgJ25pbnRlbmRvLmNvbSc6ICdHYW1pbmcnLFxuICAnaWduLmNvbSc6ICdHYW1pbmcnLFxuICAnZ2FtZXNwb3QuY29tJzogJ0dhbWluZycsXG4gICdrb3Rha3UuY29tJzogJ0dhbWluZycsXG4gICdwb2x5Z29uLmNvbSc6ICdHYW1pbmcnXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0R2VuZXJhKGhvc3RuYW1lOiBzdHJpbmcsIGN1c3RvbVJlZ2lzdHJ5PzogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IHN0cmluZyB8IG51bGwge1xuICBpZiAoIWhvc3RuYW1lKSByZXR1cm4gbnVsbDtcblxuICAvLyAwLiBDaGVjayBjdXN0b20gcmVnaXN0cnkgZmlyc3RcbiAgaWYgKGN1c3RvbVJlZ2lzdHJ5KSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IGhvc3RuYW1lLnNwbGl0KCcuJyk7XG4gICAgICAvLyBDaGVjayBmdWxsIGhvc3RuYW1lIGFuZCBwcm9ncmVzc2l2ZWx5IHNob3J0ZXIgc3VmZml4ZXNcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGFydHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgICAgY29uc3QgZG9tYWluID0gcGFydHMuc2xpY2UoaSkuam9pbignLicpO1xuICAgICAgICAgIGlmIChjdXN0b21SZWdpc3RyeVtkb21haW5dKSB7XG4gICAgICAgICAgICAgIHJldHVybiBjdXN0b21SZWdpc3RyeVtkb21haW5dO1xuICAgICAgICAgIH1cbiAgICAgIH1cbiAgfVxuXG4gIC8vIDEuIEV4YWN0IG1hdGNoXG4gIGlmIChHRU5FUkFfUkVHSVNUUllbaG9zdG5hbWVdKSB7XG4gICAgcmV0dXJuIEdFTkVSQV9SRUdJU1RSWVtob3N0bmFtZV07XG4gIH1cblxuICAvLyAyLiBTdWJkb21haW4gY2hlY2sgKHN0cmlwcGluZyBzdWJkb21haW5zKVxuICAvLyBlLmcuIFwiY29uc29sZS5hd3MuYW1hem9uLmNvbVwiIC0+IFwiYXdzLmFtYXpvbi5jb21cIiAtPiBcImFtYXpvbi5jb21cIlxuICBjb25zdCBwYXJ0cyA9IGhvc3RuYW1lLnNwbGl0KCcuJyk7XG5cbiAgLy8gVHJ5IG1hdGNoaW5nIHByb2dyZXNzaXZlbHkgc2hvcnRlciBzdWZmaXhlc1xuICAvLyBlLmcuIGEuYi5jLmNvbSAtPiBiLmMuY29tIC0+IGMuY29tXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcGFydHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICBjb25zdCBkb21haW4gPSBwYXJ0cy5zbGljZShpKS5qb2luKCcuJyk7XG4gICAgICBpZiAoR0VORVJBX1JFR0lTVFJZW2RvbWFpbl0pIHtcbiAgICAgICAgICByZXR1cm4gR0VORVJBX1JFR0lTVFJZW2RvbWFpbl07XG4gICAgICB9XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cbiIsICJleHBvcnQgY29uc3QgZ2V0U3RvcmVkVmFsdWUgPSBhc3luYyA8VD4oa2V5OiBzdHJpbmcpOiBQcm9taXNlPFQgfCBudWxsPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChrZXksIChpdGVtcykgPT4ge1xuICAgICAgcmVzb2x2ZSgoaXRlbXNba2V5XSBhcyBUKSA/PyBudWxsKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG5leHBvcnQgY29uc3Qgc2V0U3RvcmVkVmFsdWUgPSBhc3luYyA8VD4oa2V5OiBzdHJpbmcsIHZhbHVlOiBUKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IFtrZXldOiB2YWx1ZSB9LCAoKSA9PiByZXNvbHZlKCkpO1xuICB9KTtcbn07XG4iLCAiaW1wb3J0IHsgUHJlZmVyZW5jZXMsIFNvcnRpbmdTdHJhdGVneSwgVGFiTWV0YWRhdGEgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5leHBvcnQgY29uc3QgbWFwQ2hyb21lVGFiID0gKHRhYjogY2hyb21lLnRhYnMuVGFiKTogVGFiTWV0YWRhdGEgfCBudWxsID0+IHtcbiAgaWYgKCF0YWIuaWQgfHwgIXRhYi53aW5kb3dJZCkgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgaWQ6IHRhYi5pZCxcbiAgICB3aW5kb3dJZDogdGFiLndpbmRvd0lkLFxuICAgIHRpdGxlOiB0YWIudGl0bGUgfHwgXCJVbnRpdGxlZFwiLFxuICAgIHVybDogdGFiLnVybCB8fCBcImFib3V0OmJsYW5rXCIsXG4gICAgcGlubmVkOiBCb29sZWFuKHRhYi5waW5uZWQpLFxuICAgIGxhc3RBY2Nlc3NlZDogdGFiLmxhc3RBY2Nlc3NlZCxcbiAgICBvcGVuZXJUYWJJZDogdGFiLm9wZW5lclRhYklkID8/IHVuZGVmaW5lZCxcbiAgICBmYXZJY29uVXJsOiB0YWIuZmF2SWNvblVybCxcbiAgICBncm91cElkOiB0YWIuZ3JvdXBJZCxcbiAgICBpbmRleDogdGFiLmluZGV4LFxuICAgIGFjdGl2ZTogdGFiLmFjdGl2ZSxcbiAgICBzdGF0dXM6IHRhYi5zdGF0dXMsXG4gICAgc2VsZWN0ZWQ6IHRhYi5oaWdobGlnaHRlZFxuICB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGdldFN0b3JlZFByZWZlcmVuY2VzID0gYXN5bmMgKCk6IFByb21pc2U8UHJlZmVyZW5jZXMgfCBudWxsPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChcInByZWZlcmVuY2VzXCIsIChpdGVtcykgPT4ge1xuICAgICAgcmVzb2x2ZSgoaXRlbXNbXCJwcmVmZXJlbmNlc1wiXSBhcyBQcmVmZXJlbmNlcykgPz8gbnVsbCk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IGFzQXJyYXkgPSA8VD4odmFsdWU6IHVua25vd24pOiBUW10gPT4ge1xuICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkgcmV0dXJuIHZhbHVlIGFzIFRbXTtcbiAgICByZXR1cm4gW107XG59O1xuIiwgImltcG9ydCB7IEN1c3RvbVN0cmF0ZWd5LCBQcmVmZXJlbmNlcywgU29ydGluZ1N0cmF0ZWd5IH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZ2V0U3RvcmVkVmFsdWUsIHNldFN0b3JlZFZhbHVlIH0gZnJvbSBcIi4vc3RvcmFnZS5qc1wiO1xuaW1wb3J0IHsgc2V0TG9nZ2VyUHJlZmVyZW5jZXMsIGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmNvbnN0IFBSRUZFUkVOQ0VTX0tFWSA9IFwicHJlZmVyZW5jZXNcIjtcblxuZXhwb3J0IGNvbnN0IGRlZmF1bHRQcmVmZXJlbmNlczogUHJlZmVyZW5jZXMgPSB7XG4gIHNvcnRpbmc6IFtcInBpbm5lZFwiLCBcInJlY2VuY3lcIl0sXG4gIGRlYnVnOiBmYWxzZSxcbiAgbG9nTGV2ZWw6IFwiaW5mb1wiLFxuICB0aGVtZTogXCJkYXJrXCIsXG4gIGN1c3RvbUdlbmVyYToge31cbn07XG5cbmNvbnN0IG5vcm1hbGl6ZVNvcnRpbmcgPSAoc29ydGluZzogdW5rbm93bik6IFNvcnRpbmdTdHJhdGVneVtdID0+IHtcbiAgaWYgKEFycmF5LmlzQXJyYXkoc29ydGluZykpIHtcbiAgICByZXR1cm4gc29ydGluZy5maWx0ZXIoKHZhbHVlKTogdmFsdWUgaXMgU29ydGluZ1N0cmF0ZWd5ID0+IHR5cGVvZiB2YWx1ZSA9PT0gXCJzdHJpbmdcIik7XG4gIH1cbiAgaWYgKHR5cGVvZiBzb3J0aW5nID09PSBcInN0cmluZ1wiKSB7XG4gICAgcmV0dXJuIFtzb3J0aW5nXTtcbiAgfVxuICByZXR1cm4gWy4uLmRlZmF1bHRQcmVmZXJlbmNlcy5zb3J0aW5nXTtcbn07XG5cbmNvbnN0IG5vcm1hbGl6ZVN0cmF0ZWdpZXMgPSAoc3RyYXRlZ2llczogdW5rbm93bik6IEN1c3RvbVN0cmF0ZWd5W10gPT4ge1xuICAgIGNvbnN0IGFyciA9IGFzQXJyYXk8YW55PihzdHJhdGVnaWVzKS5maWx0ZXIocyA9PiB0eXBlb2YgcyA9PT0gJ29iamVjdCcgJiYgcyAhPT0gbnVsbCk7XG4gICAgcmV0dXJuIGFyci5tYXAocyA9PiAoe1xuICAgICAgICAuLi5zLFxuICAgICAgICBncm91cGluZ1J1bGVzOiBhc0FycmF5KHMuZ3JvdXBpbmdSdWxlcyksXG4gICAgICAgIHNvcnRpbmdSdWxlczogYXNBcnJheShzLnNvcnRpbmdSdWxlcyksXG4gICAgICAgIGdyb3VwU29ydGluZ1J1bGVzOiBzLmdyb3VwU29ydGluZ1J1bGVzID8gYXNBcnJheShzLmdyb3VwU29ydGluZ1J1bGVzKSA6IHVuZGVmaW5lZCxcbiAgICAgICAgZmlsdGVyczogcy5maWx0ZXJzID8gYXNBcnJheShzLmZpbHRlcnMpIDogdW5kZWZpbmVkLFxuICAgICAgICBmaWx0ZXJHcm91cHM6IHMuZmlsdGVyR3JvdXBzID8gYXNBcnJheShzLmZpbHRlckdyb3VwcykubWFwKChnOiBhbnkpID0+IGFzQXJyYXkoZykpIDogdW5kZWZpbmVkLFxuICAgICAgICBydWxlczogcy5ydWxlcyA/IGFzQXJyYXkocy5ydWxlcykgOiB1bmRlZmluZWRcbiAgICB9KSk7XG59O1xuXG5jb25zdCBub3JtYWxpemVQcmVmZXJlbmNlcyA9IChwcmVmcz86IFBhcnRpYWw8UHJlZmVyZW5jZXM+IHwgbnVsbCk6IFByZWZlcmVuY2VzID0+IHtcbiAgY29uc3QgbWVyZ2VkID0geyAuLi5kZWZhdWx0UHJlZmVyZW5jZXMsIC4uLihwcmVmcyA/PyB7fSkgfTtcbiAgcmV0dXJuIHtcbiAgICAuLi5tZXJnZWQsXG4gICAgc29ydGluZzogbm9ybWFsaXplU29ydGluZyhtZXJnZWQuc29ydGluZyksXG4gICAgY3VzdG9tU3RyYXRlZ2llczogbm9ybWFsaXplU3RyYXRlZ2llcyhtZXJnZWQuY3VzdG9tU3RyYXRlZ2llcylcbiAgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBsb2FkUHJlZmVyZW5jZXMgPSBhc3luYyAoKTogUHJvbWlzZTxQcmVmZXJlbmNlcz4gPT4ge1xuICBjb25zdCBzdG9yZWQgPSBhd2FpdCBnZXRTdG9yZWRWYWx1ZTxQcmVmZXJlbmNlcz4oUFJFRkVSRU5DRVNfS0VZKTtcbiAgY29uc3QgbWVyZ2VkID0gbm9ybWFsaXplUHJlZmVyZW5jZXMoc3RvcmVkID8/IHVuZGVmaW5lZCk7XG4gIHNldExvZ2dlclByZWZlcmVuY2VzKG1lcmdlZCk7XG4gIHJldHVybiBtZXJnZWQ7XG59O1xuXG5leHBvcnQgY29uc3Qgc2F2ZVByZWZlcmVuY2VzID0gYXN5bmMgKHByZWZzOiBQYXJ0aWFsPFByZWZlcmVuY2VzPik6IFByb21pc2U8UHJlZmVyZW5jZXM+ID0+IHtcbiAgbG9nRGVidWcoXCJVcGRhdGluZyBwcmVmZXJlbmNlc1wiLCB7IGtleXM6IE9iamVjdC5rZXlzKHByZWZzKSB9KTtcbiAgY29uc3QgY3VycmVudCA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICBjb25zdCBtZXJnZWQgPSBub3JtYWxpemVQcmVmZXJlbmNlcyh7IC4uLmN1cnJlbnQsIC4uLnByZWZzIH0pO1xuICBhd2FpdCBzZXRTdG9yZWRWYWx1ZShQUkVGRVJFTkNFU19LRVksIG1lcmdlZCk7XG4gIHNldExvZ2dlclByZWZlcmVuY2VzKG1lcmdlZCk7XG4gIHJldHVybiBtZXJnZWQ7XG59O1xuIiwgImltcG9ydCB7IFBhZ2VDb250ZXh0LCBUYWJNZXRhZGF0YSB9IGZyb20gXCIuLi8uLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IG5vcm1hbGl6ZVVybCwgcGFyc2VZb3VUdWJlVXJsLCBleHRyYWN0WW91VHViZUNoYW5uZWxGcm9tSHRtbCwgZXh0cmFjdFlvdVR1YmVHZW5yZUZyb21IdG1sIH0gZnJvbSBcIi4vbG9naWMuanNcIjtcbmltcG9ydCB7IGdldEdlbmVyYSB9IGZyb20gXCIuL2dlbmVyYVJlZ2lzdHJ5LmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZyB9IGZyb20gXCIuLi8uLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBsb2FkUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi4vcHJlZmVyZW5jZXMuanNcIjtcblxuaW50ZXJmYWNlIEV4dHJhY3Rpb25SZXNwb25zZSB7XG4gIGRhdGE6IFBhZ2VDb250ZXh0IHwgbnVsbDtcbiAgZXJyb3I/OiBzdHJpbmc7XG4gIHN0YXR1czpcbiAgICB8ICdPSydcbiAgICB8ICdSRVNUUklDVEVEJ1xuICAgIHwgJ0lOSkVDVElPTl9GQUlMRUQnXG4gICAgfCAnTk9fUkVTUE9OU0UnXG4gICAgfCAnTk9fSE9TVF9QRVJNSVNTSU9OJ1xuICAgIHwgJ0ZSQU1FX0FDQ0VTU19ERU5JRUQnO1xufVxuXG4vLyBTaW1wbGUgY29uY3VycmVuY3kgY29udHJvbFxubGV0IGFjdGl2ZUZldGNoZXMgPSAwO1xuY29uc3QgTUFYX0NPTkNVUlJFTlRfRkVUQ0hFUyA9IDU7IC8vIENvbnNlcnZhdGl2ZSBsaW1pdCB0byBhdm9pZCByYXRlIGxpbWl0aW5nXG5jb25zdCBGRVRDSF9RVUVVRTogKCgpID0+IHZvaWQpW10gPSBbXTtcblxuY29uc3QgZmV0Y2hXaXRoVGltZW91dCA9IGFzeW5jICh1cmw6IHN0cmluZywgdGltZW91dCA9IDIwMDApOiBQcm9taXNlPFJlc3BvbnNlPiA9PiB7XG4gICAgY29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICBjb25zdCBpZCA9IHNldFRpbWVvdXQoKCkgPT4gY29udHJvbGxlci5hYm9ydCgpLCB0aW1lb3V0KTtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCwgeyBzaWduYWw6IGNvbnRyb2xsZXIuc2lnbmFsIH0pO1xuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KGlkKTtcbiAgICB9XG59O1xuXG5jb25zdCBlbnF1ZXVlRmV0Y2ggPSBhc3luYyA8VD4oZm46ICgpID0+IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+ID0+IHtcbiAgICBpZiAoYWN0aXZlRmV0Y2hlcyA+PSBNQVhfQ09OQ1VSUkVOVF9GRVRDSEVTKSB7XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gRkVUQ0hfUVVFVUUucHVzaChyZXNvbHZlKSk7XG4gICAgfVxuICAgIGFjdGl2ZUZldGNoZXMrKztcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gYXdhaXQgZm4oKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgICBhY3RpdmVGZXRjaGVzLS07XG4gICAgICAgIGlmIChGRVRDSF9RVUVVRS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zdCBuZXh0ID0gRkVUQ0hfUVVFVUUuc2hpZnQoKTtcbiAgICAgICAgICAgIGlmIChuZXh0KSBuZXh0KCk7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgY29uc3QgZXh0cmFjdFBhZ2VDb250ZXh0ID0gYXN5bmMgKHRhYjogVGFiTWV0YWRhdGEgfCBjaHJvbWUudGFicy5UYWIpOiBQcm9taXNlPEV4dHJhY3Rpb25SZXNwb25zZT4gPT4ge1xuICB0cnkge1xuICAgIGlmICghdGFiIHx8ICF0YWIudXJsKSB7XG4gICAgICAgIHJldHVybiB7IGRhdGE6IG51bGwsIGVycm9yOiBcIlRhYiBub3QgZm91bmQgb3Igbm8gVVJMXCIsIHN0YXR1czogJ05PX1JFU1BPTlNFJyB9O1xuICAgIH1cblxuICAgIGlmIChcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnY2hyb21lOi8vJykgfHxcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnZWRnZTovLycpIHx8XG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2Fib3V0OicpIHx8XG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2Nocm9tZS1leHRlbnNpb246Ly8nKSB8fFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdjaHJvbWUtZXJyb3I6Ly8nKVxuICAgICkge1xuICAgICAgICByZXR1cm4geyBkYXRhOiBudWxsLCBlcnJvcjogXCJSZXN0cmljdGVkIFVSTCBzY2hlbWVcIiwgc3RhdHVzOiAnUkVTVFJJQ1RFRCcgfTtcbiAgICB9XG5cbiAgICBjb25zdCBwcmVmcyA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICAgIGxldCBiYXNlbGluZSA9IGJ1aWxkQmFzZWxpbmVDb250ZXh0KHRhYiBhcyBjaHJvbWUudGFicy5UYWIsIHByZWZzLmN1c3RvbUdlbmVyYSk7XG5cbiAgICAvLyBGZXRjaCBhbmQgZW5yaWNoIGZvciBZb3VUdWJlIGlmIGF1dGhvciBpcyBtaXNzaW5nIGFuZCBpdCBpcyBhIHZpZGVvXG4gICAgY29uc3QgdGFyZ2V0VXJsID0gdGFiLnVybDtcbiAgICBjb25zdCB1cmxPYmogPSBuZXcgVVJMKHRhcmdldFVybCk7XG4gICAgY29uc3QgaG9zdG5hbWUgPSB1cmxPYmouaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sICcnKTtcbiAgICBpZiAoKGhvc3RuYW1lLmVuZHNXaXRoKCd5b3V0dWJlLmNvbScpIHx8IGhvc3RuYW1lLmVuZHNXaXRoKCd5b3V0dS5iZScpKSAmJiAoIWJhc2VsaW5lLmF1dGhvck9yQ3JlYXRvciB8fCBiYXNlbGluZS5nZW5yZSA9PT0gJ1ZpZGVvJykpIHtcbiAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgLy8gV2UgdXNlIGEgcXVldWUgdG8gcHJldmVudCBmbG9vZGluZyByZXF1ZXN0c1xuICAgICAgICAgICAgIGF3YWl0IGVucXVldWVGZXRjaChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2hXaXRoVGltZW91dCh0YXJnZXRVcmwpO1xuICAgICAgICAgICAgICAgICBpZiAocmVzcG9uc2Uub2spIHtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGh0bWwgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG4gICAgICAgICAgICAgICAgICAgICBjb25zdCBjaGFubmVsID0gZXh0cmFjdFlvdVR1YmVDaGFubmVsRnJvbUh0bWwoaHRtbCk7XG4gICAgICAgICAgICAgICAgICAgICBpZiAoY2hhbm5lbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgIGJhc2VsaW5lLmF1dGhvck9yQ3JlYXRvciA9IGNoYW5uZWw7XG4gICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICBjb25zdCBnZW5yZSA9IGV4dHJhY3RZb3VUdWJlR2VucmVGcm9tSHRtbChodG1sKTtcbiAgICAgICAgICAgICAgICAgICAgIGlmIChnZW5yZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgIGJhc2VsaW5lLmdlbnJlID0gZ2VucmU7XG4gICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9KTtcbiAgICAgICAgIH0gY2F0Y2ggKGZldGNoRXJyKSB7XG4gICAgICAgICAgICAgbG9nRGVidWcoXCJGYWlsZWQgdG8gZmV0Y2ggWW91VHViZSBwYWdlIGNvbnRlbnRcIiwgeyBlcnJvcjogU3RyaW5nKGZldGNoRXJyKSB9KTtcbiAgICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgZGF0YTogYmFzZWxpbmUsXG4gICAgICBzdGF0dXM6ICdPSydcbiAgICB9O1xuXG4gIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgIGxvZ0RlYnVnKGBFeHRyYWN0aW9uIGZhaWxlZCBmb3IgdGFiICR7dGFiLmlkfWAsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgZGF0YTogbnVsbCxcbiAgICAgIGVycm9yOiBTdHJpbmcoZSksXG4gICAgICBzdGF0dXM6ICdJTkpFQ1RJT05fRkFJTEVEJ1xuICAgIH07XG4gIH1cbn07XG5cbmNvbnN0IGJ1aWxkQmFzZWxpbmVDb250ZXh0ID0gKHRhYjogY2hyb21lLnRhYnMuVGFiLCBjdXN0b21HZW5lcmE/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUGFnZUNvbnRleHQgPT4ge1xuICBjb25zdCB1cmwgPSB0YWIudXJsIHx8IFwiXCI7XG4gIGxldCBob3N0bmFtZSA9IFwiXCI7XG4gIHRyeSB7XG4gICAgaG9zdG5hbWUgPSBuZXcgVVJMKHVybCkuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sICcnKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGhvc3RuYW1lID0gXCJcIjtcbiAgfVxuXG4gIC8vIERldGVybWluZSBPYmplY3QgVHlwZSBmaXJzdFxuICBsZXQgb2JqZWN0VHlwZTogUGFnZUNvbnRleHRbJ29iamVjdFR5cGUnXSA9ICd1bmtub3duJztcbiAgbGV0IGF1dGhvck9yQ3JlYXRvcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cbiAgaWYgKHVybC5pbmNsdWRlcygnL2xvZ2luJykgfHwgdXJsLmluY2x1ZGVzKCcvc2lnbmluJykpIHtcbiAgICAgIG9iamVjdFR5cGUgPSAnbG9naW4nO1xuICB9IGVsc2UgaWYgKGhvc3RuYW1lLmluY2x1ZGVzKCd5b3V0dWJlLmNvbScpIHx8IGhvc3RuYW1lLmluY2x1ZGVzKCd5b3V0dS5iZScpKSB7XG4gICAgICBjb25zdCB7IHZpZGVvSWQgfSA9IHBhcnNlWW91VHViZVVybCh1cmwpO1xuICAgICAgaWYgKHZpZGVvSWQpIG9iamVjdFR5cGUgPSAndmlkZW8nO1xuXG4gICAgICAvLyBUcnkgdG8gZ3Vlc3MgY2hhbm5lbCBmcm9tIFVSTCBpZiBwb3NzaWJsZVxuICAgICAgaWYgKHVybC5pbmNsdWRlcygnL0AnKSkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzID0gdXJsLnNwbGl0KCcvQCcpO1xuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGhhbmRsZSA9IHBhcnRzWzFdLnNwbGl0KCcvJylbMF07XG4gICAgICAgICAgICAgIGF1dGhvck9yQ3JlYXRvciA9ICdAJyArIGhhbmRsZTtcbiAgICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHVybC5pbmNsdWRlcygnL2MvJykpIHtcbiAgICAgICAgICBjb25zdCBwYXJ0cyA9IHVybC5zcGxpdCgnL2MvJyk7XG4gICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgYXV0aG9yT3JDcmVhdG9yID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhcnRzWzFdLnNwbGl0KCcvJylbMF0pO1xuICAgICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodXJsLmluY2x1ZGVzKCcvdXNlci8nKSkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzID0gdXJsLnNwbGl0KCcvdXNlci8nKTtcbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICBhdXRob3JPckNyZWF0b3IgPSBkZWNvZGVVUklDb21wb25lbnQocGFydHNbMV0uc3BsaXQoJy8nKVswXSk7XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9IGVsc2UgaWYgKGhvc3RuYW1lID09PSAnZ2l0aHViLmNvbScgJiYgdXJsLmluY2x1ZGVzKCcvcHVsbC8nKSkge1xuICAgICAgb2JqZWN0VHlwZSA9ICd0aWNrZXQnO1xuICB9IGVsc2UgaWYgKGhvc3RuYW1lID09PSAnZ2l0aHViLmNvbScgJiYgIXVybC5pbmNsdWRlcygnL3B1bGwvJykgJiYgdXJsLnNwbGl0KCcvJykubGVuZ3RoID49IDUpIHtcbiAgICAgIC8vIHJvdWdoIGNoZWNrIGZvciByZXBvXG4gICAgICBvYmplY3RUeXBlID0gJ3JlcG8nO1xuICB9XG5cbiAgLy8gRGV0ZXJtaW5lIEdlbnJlXG4gIC8vIFByaW9yaXR5IDE6IFNpdGUtc3BlY2lmaWMgZXh0cmFjdGlvbiAoZGVyaXZlZCBmcm9tIG9iamVjdFR5cGUpXG4gIGxldCBnZW5yZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gIGlmIChvYmplY3RUeXBlID09PSAndmlkZW8nKSBnZW5yZSA9ICdWaWRlbyc7XG4gIGVsc2UgaWYgKG9iamVjdFR5cGUgPT09ICdyZXBvJyB8fCBvYmplY3RUeXBlID09PSAndGlja2V0JykgZ2VucmUgPSAnRGV2ZWxvcG1lbnQnO1xuXG4gIC8vIFByaW9yaXR5IDI6IEZhbGxiYWNrIHRvIFJlZ2lzdHJ5XG4gIGlmICghZ2VucmUpIHtcbiAgICAgZ2VucmUgPSBnZXRHZW5lcmEoaG9zdG5hbWUsIGN1c3RvbUdlbmVyYSkgfHwgdW5kZWZpbmVkO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjYW5vbmljYWxVcmw6IHVybCB8fCBudWxsLFxuICAgIG5vcm1hbGl6ZWRVcmw6IG5vcm1hbGl6ZVVybCh1cmwpLFxuICAgIHNpdGVOYW1lOiBob3N0bmFtZSB8fCBudWxsLFxuICAgIHBsYXRmb3JtOiBob3N0bmFtZSB8fCBudWxsLFxuICAgIG9iamVjdFR5cGUsXG4gICAgb2JqZWN0SWQ6IHVybCB8fCBudWxsLFxuICAgIHRpdGxlOiB0YWIudGl0bGUgfHwgbnVsbCxcbiAgICBnZW5yZSxcbiAgICBkZXNjcmlwdGlvbjogbnVsbCxcbiAgICBhdXRob3JPckNyZWF0b3I6IGF1dGhvck9yQ3JlYXRvcixcbiAgICBwdWJsaXNoZWRBdDogbnVsbCxcbiAgICBtb2RpZmllZEF0OiBudWxsLFxuICAgIGxhbmd1YWdlOiBudWxsLFxuICAgIHRhZ3M6IFtdLFxuICAgIGJyZWFkY3J1bWJzOiBbXSxcbiAgICBpc0F1ZGlibGU6IGZhbHNlLFxuICAgIGlzTXV0ZWQ6IGZhbHNlLFxuICAgIGlzQ2FwdHVyaW5nOiBmYWxzZSxcbiAgICBwcm9ncmVzczogbnVsbCxcbiAgICBoYXNVbnNhdmVkQ2hhbmdlc0xpa2VseTogZmFsc2UsXG4gICAgaXNBdXRoZW50aWNhdGVkTGlrZWx5OiBmYWxzZSxcbiAgICBzb3VyY2VzOiB7XG4gICAgICBjYW5vbmljYWxVcmw6ICd1cmwnLFxuICAgICAgbm9ybWFsaXplZFVybDogJ3VybCcsXG4gICAgICBzaXRlTmFtZTogJ3VybCcsXG4gICAgICBwbGF0Zm9ybTogJ3VybCcsXG4gICAgICBvYmplY3RUeXBlOiAndXJsJyxcbiAgICAgIHRpdGxlOiB0YWIudGl0bGUgPyAndGFiJyA6ICd1cmwnLFxuICAgICAgZ2VucmU6ICdyZWdpc3RyeSdcbiAgICB9LFxuICAgIGNvbmZpZGVuY2U6IHt9XG4gIH07XG59O1xuIiwgImltcG9ydCB7IFRhYk1ldGFkYXRhLCBQYWdlQ29udGV4dCB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnLCBsb2dFcnJvciB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBleHRyYWN0UGFnZUNvbnRleHQgfSBmcm9tIFwiLi9leHRyYWN0aW9uL2luZGV4LmpzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29udGV4dFJlc3VsdCB7XG4gIGNvbnRleHQ6IHN0cmluZztcbiAgc291cmNlOiAnQUknIHwgJ0hldXJpc3RpYycgfCAnRXh0cmFjdGlvbic7XG4gIGRhdGE/OiBQYWdlQ29udGV4dDtcbiAgZXJyb3I/OiBzdHJpbmc7XG4gIHN0YXR1cz86IHN0cmluZztcbn1cblxuY29uc3QgY29udGV4dENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIENvbnRleHRSZXN1bHQ+KCk7XG5cbmV4cG9ydCBjb25zdCBhbmFseXplVGFiQ29udGV4dCA9IGFzeW5jIChcbiAgdGFiczogVGFiTWV0YWRhdGFbXSxcbiAgb25Qcm9ncmVzcz86IChjb21wbGV0ZWQ6IG51bWJlciwgdG90YWw6IG51bWJlcikgPT4gdm9pZFxuKTogUHJvbWlzZTxNYXA8bnVtYmVyLCBDb250ZXh0UmVzdWx0Pj4gPT4ge1xuICBjb25zdCBjb250ZXh0TWFwID0gbmV3IE1hcDxudW1iZXIsIENvbnRleHRSZXN1bHQ+KCk7XG4gIGxldCBjb21wbGV0ZWQgPSAwO1xuICBjb25zdCB0b3RhbCA9IHRhYnMubGVuZ3RoO1xuXG4gIGNvbnN0IHByb21pc2VzID0gdGFicy5tYXAoYXN5bmMgKHRhYikgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBjYWNoZUtleSA9IGAke3RhYi5pZH06OiR7dGFiLnVybH1gO1xuICAgICAgaWYgKGNvbnRleHRDYWNoZS5oYXMoY2FjaGVLZXkpKSB7XG4gICAgICAgIGNvbnRleHRNYXAuc2V0KHRhYi5pZCwgY29udGV4dENhY2hlLmdldChjYWNoZUtleSkhKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaENvbnRleHRGb3JUYWIodGFiKTtcblxuICAgICAgLy8gT25seSBjYWNoZSB2YWxpZCByZXN1bHRzIHRvIGFsbG93IHJldHJ5aW5nIG9uIHRyYW5zaWVudCBlcnJvcnM/XG4gICAgICAvLyBBY3R1YWxseSwgaWYgd2UgY2FjaGUgZXJyb3IsIHdlIHN0b3AgcmV0cnlpbmcuXG4gICAgICAvLyBMZXQncyBjYWNoZSBldmVyeXRoaW5nIGZvciBub3cgdG8gcHJldmVudCBzcGFtbWluZyBpZiBpdCBrZWVwcyBmYWlsaW5nLlxuICAgICAgY29udGV4dENhY2hlLnNldChjYWNoZUtleSwgcmVzdWx0KTtcblxuICAgICAgY29udGV4dE1hcC5zZXQodGFiLmlkLCByZXN1bHQpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dFcnJvcihgRmFpbGVkIHRvIGFuYWx5emUgY29udGV4dCBmb3IgdGFiICR7dGFiLmlkfWAsIHsgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgICAvLyBFdmVuIGlmIGZldGNoQ29udGV4dEZvclRhYiBmYWlscyBjb21wbGV0ZWx5LCB3ZSB0cnkgYSBzYWZlIHN5bmMgZmFsbGJhY2tcbiAgICAgIGNvbnRleHRNYXAuc2V0KHRhYi5pZCwgeyBjb250ZXh0OiBcIlVuY2F0ZWdvcml6ZWRcIiwgc291cmNlOiAnSGV1cmlzdGljJywgZXJyb3I6IFN0cmluZyhlcnJvciksIHN0YXR1czogJ0VSUk9SJyB9KTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgY29tcGxldGVkKys7XG4gICAgICBpZiAob25Qcm9ncmVzcykgb25Qcm9ncmVzcyhjb21wbGV0ZWQsIHRvdGFsKTtcbiAgICB9XG4gIH0pO1xuXG4gIGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgcmV0dXJuIGNvbnRleHRNYXA7XG59O1xuXG5jb25zdCBmZXRjaENvbnRleHRGb3JUYWIgPSBhc3luYyAodGFiOiBUYWJNZXRhZGF0YSk6IFByb21pc2U8Q29udGV4dFJlc3VsdD4gPT4ge1xuICAvLyAxLiBSdW4gR2VuZXJpYyBFeHRyYWN0aW9uIChBbHdheXMpXG4gIGxldCBkYXRhOiBQYWdlQ29udGV4dCB8IG51bGwgPSBudWxsO1xuICBsZXQgZXJyb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgbGV0IHN0YXR1czogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gIHRyeSB7XG4gICAgICBjb25zdCBleHRyYWN0aW9uID0gYXdhaXQgZXh0cmFjdFBhZ2VDb250ZXh0KHRhYik7XG4gICAgICBkYXRhID0gZXh0cmFjdGlvbi5kYXRhO1xuICAgICAgZXJyb3IgPSBleHRyYWN0aW9uLmVycm9yO1xuICAgICAgc3RhdHVzID0gZXh0cmFjdGlvbi5zdGF0dXM7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ0RlYnVnKGBFeHRyYWN0aW9uIGZhaWxlZCBmb3IgdGFiICR7dGFiLmlkfWAsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgIGVycm9yID0gU3RyaW5nKGUpO1xuICAgICAgc3RhdHVzID0gJ0VSUk9SJztcbiAgfVxuXG4gIGxldCBjb250ZXh0ID0gXCJVbmNhdGVnb3JpemVkXCI7XG4gIGxldCBzb3VyY2U6IENvbnRleHRSZXN1bHRbJ3NvdXJjZSddID0gJ0hldXJpc3RpYyc7XG5cbiAgLy8gMi4gVHJ5IHRvIERldGVybWluZSBDYXRlZ29yeSBmcm9tIEV4dHJhY3Rpb24gRGF0YVxuICBpZiAoZGF0YSkge1xuICAgICAgaWYgKGRhdGEucGxhdGZvcm0gPT09ICdZb3VUdWJlJyB8fCBkYXRhLnBsYXRmb3JtID09PSAnTmV0ZmxpeCcgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ1Nwb3RpZnknIHx8IGRhdGEucGxhdGZvcm0gPT09ICdUd2l0Y2gnKSB7XG4gICAgICAgICAgY29udGV4dCA9IFwiRW50ZXJ0YWlubWVudFwiO1xuICAgICAgICAgIHNvdXJjZSA9ICdFeHRyYWN0aW9uJztcbiAgICAgIH0gZWxzZSBpZiAoZGF0YS5wbGF0Zm9ybSA9PT0gJ0dpdEh1YicgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ1N0YWNrIE92ZXJmbG93JyB8fCBkYXRhLnBsYXRmb3JtID09PSAnSmlyYScgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ0dpdExhYicpIHtcbiAgICAgICAgICBjb250ZXh0ID0gXCJEZXZlbG9wbWVudFwiO1xuICAgICAgICAgIHNvdXJjZSA9ICdFeHRyYWN0aW9uJztcbiAgICAgIH0gZWxzZSBpZiAoZGF0YS5wbGF0Zm9ybSA9PT0gJ0dvb2dsZScgJiYgKGRhdGEubm9ybWFsaXplZFVybC5pbmNsdWRlcygnZG9jcycpIHx8IGRhdGEubm9ybWFsaXplZFVybC5pbmNsdWRlcygnc2hlZXRzJykgfHwgZGF0YS5ub3JtYWxpemVkVXJsLmluY2x1ZGVzKCdzbGlkZXMnKSkpIHtcbiAgICAgICAgICBjb250ZXh0ID0gXCJXb3JrXCI7XG4gICAgICAgICAgc291cmNlID0gJ0V4dHJhY3Rpb24nO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gSWYgd2UgaGF2ZSBzdWNjZXNzZnVsIGV4dHJhY3Rpb24gZGF0YSBidXQgbm8gc3BlY2lmaWMgcnVsZSBtYXRjaGVkLFxuICAgICAgICAvLyB1c2UgdGhlIE9iamVjdCBUeXBlIG9yIGdlbmVyaWMgXCJHZW5lcmFsIFdlYlwiIHRvIGluZGljYXRlIGV4dHJhY3Rpb24gd29ya2VkLlxuICAgICAgICAvLyBXZSBwcmVmZXIgc3BlY2lmaWMgY2F0ZWdvcmllcywgYnV0IFwiQXJ0aWNsZVwiIG9yIFwiVmlkZW9cIiBhcmUgYmV0dGVyIHRoYW4gXCJVbmNhdGVnb3JpemVkXCIuXG4gICAgICAgIGlmIChkYXRhLm9iamVjdFR5cGUgJiYgZGF0YS5vYmplY3RUeXBlICE9PSAndW5rbm93bicpIHtcbiAgICAgICAgICAgICAvLyBNYXAgb2JqZWN0IHR5cGVzIHRvIGNhdGVnb3JpZXMgaWYgcG9zc2libGVcbiAgICAgICAgICAgICBpZiAoZGF0YS5vYmplY3RUeXBlID09PSAndmlkZW8nKSBjb250ZXh0ID0gJ0VudGVydGFpbm1lbnQnO1xuICAgICAgICAgICAgIGVsc2UgaWYgKGRhdGEub2JqZWN0VHlwZSA9PT0gJ2FydGljbGUnKSBjb250ZXh0ID0gJ05ld3MnOyAvLyBMb29zZSBtYXBwaW5nLCBidXQgYmV0dGVyIHRoYW4gbm90aGluZ1xuICAgICAgICAgICAgIGVsc2UgY29udGV4dCA9IGRhdGEub2JqZWN0VHlwZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGRhdGEub2JqZWN0VHlwZS5zbGljZSgxKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICBjb250ZXh0ID0gXCJHZW5lcmFsIFdlYlwiO1xuICAgICAgICB9XG4gICAgICAgIHNvdXJjZSA9ICdFeHRyYWN0aW9uJztcbiAgICAgIH1cbiAgfVxuXG4gIC8vIDMuIEZhbGxiYWNrIHRvIExvY2FsIEhldXJpc3RpYyAoVVJMIFJlZ2V4KVxuICBpZiAoY29udGV4dCA9PT0gXCJVbmNhdGVnb3JpemVkXCIpIHtcbiAgICAgIGNvbnN0IGggPSBhd2FpdCBsb2NhbEhldXJpc3RpYyh0YWIpO1xuICAgICAgaWYgKGguY29udGV4dCAhPT0gXCJVbmNhdGVnb3JpemVkXCIpIHtcbiAgICAgICAgICBjb250ZXh0ID0gaC5jb250ZXh0O1xuICAgICAgICAgIC8vIHNvdXJjZSByZW1haW5zICdIZXVyaXN0aWMnIChvciBtYXliZSB3ZSBzaG91bGQgc2F5ICdIZXVyaXN0aWMnIGlzIHRoZSBzb3VyY2U/KVxuICAgICAgICAgIC8vIFRoZSBsb2NhbEhldXJpc3RpYyBmdW5jdGlvbiByZXR1cm5zIHsgc291cmNlOiAnSGV1cmlzdGljJyB9XG4gICAgICB9XG4gIH1cblxuICAvLyA0LiBGYWxsYmFjayB0byBBSSAoTExNKSAtIFJFTU9WRURcbiAgLy8gVGhlIEh1Z2dpbmdGYWNlIEFQSSBlbmRwb2ludCBpcyA0MTAgR29uZSBhbmQvb3IgcmVxdWlyZXMgYXV0aGVudGljYXRpb24gd2hpY2ggd2UgZG8gbm90IGhhdmUuXG4gIC8vIFRoZSBjb2RlIGhhcyBiZWVuIHJlbW92ZWQgdG8gcHJldmVudCBlcnJvcnMuXG5cbiAgaWYgKGNvbnRleHQgIT09IFwiVW5jYXRlZ29yaXplZFwiICYmIHNvdXJjZSAhPT0gXCJFeHRyYWN0aW9uXCIpIHtcbiAgICBlcnJvciA9IHVuZGVmaW5lZDtcbiAgICBzdGF0dXMgPSB1bmRlZmluZWQ7XG4gIH1cblxuICByZXR1cm4geyBjb250ZXh0LCBzb3VyY2UsIGRhdGE6IGRhdGEgfHwgdW5kZWZpbmVkLCBlcnJvciwgc3RhdHVzIH07XG59O1xuXG5jb25zdCBsb2NhbEhldXJpc3RpYyA9IGFzeW5jICh0YWI6IFRhYk1ldGFkYXRhKTogUHJvbWlzZTxDb250ZXh0UmVzdWx0PiA9PiB7XG4gIGNvbnN0IHVybCA9IHRhYi51cmwudG9Mb3dlckNhc2UoKTtcbiAgbGV0IGNvbnRleHQgPSBcIlVuY2F0ZWdvcml6ZWRcIjtcblxuICBpZiAodXJsLmluY2x1ZGVzKFwiZ2l0aHViXCIpIHx8IHVybC5pbmNsdWRlcyhcInN0YWNrb3ZlcmZsb3dcIikgfHwgdXJsLmluY2x1ZGVzKFwibG9jYWxob3N0XCIpIHx8IHVybC5pbmNsdWRlcyhcImppcmFcIikgfHwgdXJsLmluY2x1ZGVzKFwiZ2l0bGFiXCIpKSBjb250ZXh0ID0gXCJEZXZlbG9wbWVudFwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJnb29nbGVcIikgJiYgKHVybC5pbmNsdWRlcyhcImRvY3NcIikgfHwgdXJsLmluY2x1ZGVzKFwic2hlZXRzXCIpIHx8IHVybC5pbmNsdWRlcyhcInNsaWRlc1wiKSkpIGNvbnRleHQgPSBcIldvcmtcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwibGlua2VkaW5cIikgfHwgdXJsLmluY2x1ZGVzKFwic2xhY2tcIikgfHwgdXJsLmluY2x1ZGVzKFwiem9vbVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ0ZWFtc1wiKSkgY29udGV4dCA9IFwiV29ya1wiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJuZXRmbGl4XCIpIHx8IHVybC5pbmNsdWRlcyhcInNwb3RpZnlcIikgfHwgdXJsLmluY2x1ZGVzKFwiaHVsdVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJkaXNuZXlcIikgfHwgdXJsLmluY2x1ZGVzKFwieW91dHViZVwiKSkgY29udGV4dCA9IFwiRW50ZXJ0YWlubWVudFwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJ0d2l0dGVyXCIpIHx8IHVybC5pbmNsdWRlcyhcImZhY2Vib29rXCIpIHx8IHVybC5pbmNsdWRlcyhcImluc3RhZ3JhbVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJyZWRkaXRcIikgfHwgdXJsLmluY2x1ZGVzKFwidGlrdG9rXCIpIHx8IHVybC5pbmNsdWRlcyhcInBpbnRlcmVzdFwiKSkgY29udGV4dCA9IFwiU29jaWFsXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImFtYXpvblwiKSB8fCB1cmwuaW5jbHVkZXMoXCJlYmF5XCIpIHx8IHVybC5pbmNsdWRlcyhcIndhbG1hcnRcIikgfHwgdXJsLmluY2x1ZGVzKFwidGFyZ2V0XCIpIHx8IHVybC5pbmNsdWRlcyhcInNob3BpZnlcIikpIGNvbnRleHQgPSBcIlNob3BwaW5nXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImNublwiKSB8fCB1cmwuaW5jbHVkZXMoXCJiYmNcIikgfHwgdXJsLmluY2x1ZGVzKFwibnl0aW1lc1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJ3YXNoaW5ndG9ucG9zdFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJmb3huZXdzXCIpKSBjb250ZXh0ID0gXCJOZXdzXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImNvdXJzZXJhXCIpIHx8IHVybC5pbmNsdWRlcyhcInVkZW15XCIpIHx8IHVybC5pbmNsdWRlcyhcImVkeFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJraGFuYWNhZGVteVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJjYW52YXNcIikpIGNvbnRleHQgPSBcIkVkdWNhdGlvblwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJleHBlZGlhXCIpIHx8IHVybC5pbmNsdWRlcyhcImJvb2tpbmdcIikgfHwgdXJsLmluY2x1ZGVzKFwiYWlyYm5iXCIpIHx8IHVybC5pbmNsdWRlcyhcInRyaXBhZHZpc29yXCIpIHx8IHVybC5pbmNsdWRlcyhcImtheWFrXCIpKSBjb250ZXh0ID0gXCJUcmF2ZWxcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwid2VibWRcIikgfHwgdXJsLmluY2x1ZGVzKFwibWF5b2NsaW5pY1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJuaWguZ292XCIpIHx8IHVybC5pbmNsdWRlcyhcImhlYWx0aFwiKSkgY29udGV4dCA9IFwiSGVhbHRoXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImVzcG5cIikgfHwgdXJsLmluY2x1ZGVzKFwibmJhXCIpIHx8IHVybC5pbmNsdWRlcyhcIm5mbFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJtbGJcIikgfHwgdXJsLmluY2x1ZGVzKFwiZmlmYVwiKSkgY29udGV4dCA9IFwiU3BvcnRzXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcInRlY2hjcnVuY2hcIikgfHwgdXJsLmluY2x1ZGVzKFwid2lyZWRcIikgfHwgdXJsLmluY2x1ZGVzKFwidGhldmVyZ2VcIikgfHwgdXJsLmluY2x1ZGVzKFwiYXJzdGVjaG5pY2FcIikpIGNvbnRleHQgPSBcIlRlY2hub2xvZ3lcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwic2NpZW5jZVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJuYXR1cmUuY29tXCIpIHx8IHVybC5pbmNsdWRlcyhcIm5hc2EuZ292XCIpKSBjb250ZXh0ID0gXCJTY2llbmNlXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcInR3aXRjaFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJzdGVhbVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJyb2Jsb3hcIikgfHwgdXJsLmluY2x1ZGVzKFwiaWduXCIpIHx8IHVybC5pbmNsdWRlcyhcImdhbWVzcG90XCIpKSBjb250ZXh0ID0gXCJHYW1pbmdcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwic291bmRjbG91ZFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJiYW5kY2FtcFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJsYXN0LmZtXCIpKSBjb250ZXh0ID0gXCJNdXNpY1wiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJkZXZpYW50YXJ0XCIpIHx8IHVybC5pbmNsdWRlcyhcImJlaGFuY2VcIikgfHwgdXJsLmluY2x1ZGVzKFwiZHJpYmJibGVcIikgfHwgdXJsLmluY2x1ZGVzKFwiYXJ0c3RhdGlvblwiKSkgY29udGV4dCA9IFwiQXJ0XCI7XG5cbiAgcmV0dXJuIHsgY29udGV4dCwgc291cmNlOiAnSGV1cmlzdGljJyB9O1xufTtcbiIsICJpbXBvcnQgeyBDdXN0b21TdHJhdGVneSwgU29ydGluZ1N0cmF0ZWd5IH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBTdHJhdGVneURlZmluaXRpb24ge1xuICAgIGlkOiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmc7XG4gICAgbGFiZWw6IHN0cmluZztcbiAgICBpc0dyb3VwaW5nOiBib29sZWFuO1xuICAgIGlzU29ydGluZzogYm9vbGVhbjtcbiAgICB0YWdzPzogc3RyaW5nW107XG4gICAgYXV0b1J1bj86IGJvb2xlYW47XG4gICAgaXNDdXN0b20/OiBib29sZWFuO1xufVxuXG4vLyBSZXN0b3JlZCBzdHJhdGVnaWVzIG1hdGNoaW5nIGJhY2tncm91bmQgY2FwYWJpbGl0aWVzLlxuZXhwb3J0IGNvbnN0IFNUUkFURUdJRVM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0gW1xuICAgIHsgaWQ6IFwiZG9tYWluXCIsIGxhYmVsOiBcIkRvbWFpblwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiZG9tYWluX2Z1bGxcIiwgbGFiZWw6IFwiRnVsbCBEb21haW5cIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInRvcGljXCIsIGxhYmVsOiBcIlRvcGljXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJjb250ZXh0XCIsIGxhYmVsOiBcIkNvbnRleHRcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImxpbmVhZ2VcIiwgbGFiZWw6IFwiTGluZWFnZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwicGlubmVkXCIsIGxhYmVsOiBcIlBpbm5lZFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwicmVjZW5jeVwiLCBsYWJlbDogXCJSZWNlbmN5XCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJhZ2VcIiwgbGFiZWw6IFwiQWdlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ1cmxcIiwgbGFiZWw6IFwiVVJMXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJuZXN0aW5nXCIsIGxhYmVsOiBcIk5lc3RpbmdcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInRpdGxlXCIsIGxhYmVsOiBcIlRpdGxlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG5dO1xuXG5leHBvcnQgY29uc3QgZ2V0U3RyYXRlZ2llcyA9IChjdXN0b21TdHJhdGVnaWVzPzogQ3VzdG9tU3RyYXRlZ3lbXSk6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0+IHtcbiAgICBpZiAoIWN1c3RvbVN0cmF0ZWdpZXMgfHwgY3VzdG9tU3RyYXRlZ2llcy5sZW5ndGggPT09IDApIHJldHVybiBTVFJBVEVHSUVTO1xuXG4gICAgLy8gQ3VzdG9tIHN0cmF0ZWdpZXMgY2FuIG92ZXJyaWRlIGJ1aWx0LWlucyBpZiBJRHMgbWF0Y2gsIG9yIGFkZCBuZXcgb25lcy5cbiAgICBjb25zdCBjb21iaW5lZCA9IFsuLi5TVFJBVEVHSUVTXTtcblxuICAgIGN1c3RvbVN0cmF0ZWdpZXMuZm9yRWFjaChjdXN0b20gPT4ge1xuICAgICAgICBjb25zdCBleGlzdGluZ0luZGV4ID0gY29tYmluZWQuZmluZEluZGV4KHMgPT4gcy5pZCA9PT0gY3VzdG9tLmlkKTtcblxuICAgICAgICAvLyBEZXRlcm1pbmUgY2FwYWJpbGl0aWVzIGJhc2VkIG9uIHJ1bGVzIHByZXNlbmNlXG4gICAgICAgIGNvbnN0IGhhc0dyb3VwaW5nID0gKGN1c3RvbS5ncm91cGluZ1J1bGVzICYmIGN1c3RvbS5ncm91cGluZ1J1bGVzLmxlbmd0aCA+IDApIHx8IChjdXN0b20ucnVsZXMgJiYgY3VzdG9tLnJ1bGVzLmxlbmd0aCA+IDApIHx8IGZhbHNlO1xuICAgICAgICBjb25zdCBoYXNTb3J0aW5nID0gKGN1c3RvbS5zb3J0aW5nUnVsZXMgJiYgY3VzdG9tLnNvcnRpbmdSdWxlcy5sZW5ndGggPiAwKSB8fCAoY3VzdG9tLnJ1bGVzICYmIGN1c3RvbS5ydWxlcy5sZW5ndGggPiAwKSB8fCBmYWxzZTtcblxuICAgICAgICBjb25zdCB0YWdzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBpZiAoaGFzR3JvdXBpbmcpIHRhZ3MucHVzaChcImdyb3VwXCIpO1xuICAgICAgICBpZiAoaGFzU29ydGluZykgdGFncy5wdXNoKFwic29ydFwiKTtcblxuICAgICAgICBjb25zdCBkZWZpbml0aW9uOiBTdHJhdGVneURlZmluaXRpb24gPSB7XG4gICAgICAgICAgICBpZDogY3VzdG9tLmlkLFxuICAgICAgICAgICAgbGFiZWw6IGN1c3RvbS5sYWJlbCxcbiAgICAgICAgICAgIGlzR3JvdXBpbmc6IGhhc0dyb3VwaW5nLFxuICAgICAgICAgICAgaXNTb3J0aW5nOiBoYXNTb3J0aW5nLFxuICAgICAgICAgICAgdGFnczogdGFncyxcbiAgICAgICAgICAgIGF1dG9SdW46IGN1c3RvbS5hdXRvUnVuLFxuICAgICAgICAgICAgaXNDdXN0b206IHRydWVcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoZXhpc3RpbmdJbmRleCAhPT0gLTEpIHtcbiAgICAgICAgICAgIGNvbWJpbmVkW2V4aXN0aW5nSW5kZXhdID0gZGVmaW5pdGlvbjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbWJpbmVkLnB1c2goZGVmaW5pdGlvbik7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBjb21iaW5lZDtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRTdHJhdGVneSA9IChpZDogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogU3RyYXRlZ3lEZWZpbml0aW9uIHwgdW5kZWZpbmVkID0+IFNUUkFURUdJRVMuZmluZChzID0+IHMuaWQgPT09IGlkKTtcbiIsICJpbXBvcnQgeyBHcm91cGluZ1N0cmF0ZWd5LCBTb3J0aW5nU3RyYXRlZ3ksIFRhYkdyb3VwLCBUYWJNZXRhZGF0YSwgQ3VzdG9tU3RyYXRlZ3ksIFN0cmF0ZWd5UnVsZSwgUnVsZUNvbmRpdGlvbiwgR3JvdXBpbmdSdWxlLCBTb3J0aW5nUnVsZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFN0cmF0ZWdpZXMgfSBmcm9tIFwiLi4vc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmxldCBjdXN0b21TdHJhdGVnaWVzOiBDdXN0b21TdHJhdGVneVtdID0gW107XG5cbmV4cG9ydCBjb25zdCBzZXRDdXN0b21TdHJhdGVnaWVzID0gKHN0cmF0ZWdpZXM6IEN1c3RvbVN0cmF0ZWd5W10pID0+IHtcbiAgICBjdXN0b21TdHJhdGVnaWVzID0gc3RyYXRlZ2llcztcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRDdXN0b21TdHJhdGVnaWVzID0gKCk6IEN1c3RvbVN0cmF0ZWd5W10gPT4gY3VzdG9tU3RyYXRlZ2llcztcblxuY29uc3QgQ09MT1JTID0gW1wiZ3JleVwiLCBcImJsdWVcIiwgXCJyZWRcIiwgXCJ5ZWxsb3dcIiwgXCJncmVlblwiLCBcInBpbmtcIiwgXCJwdXJwbGVcIiwgXCJjeWFuXCIsIFwib3JhbmdlXCJdO1xuXG5jb25zdCByZWdleENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIFJlZ0V4cD4oKTtcblxuZXhwb3J0IGNvbnN0IGRvbWFpbkZyb21VcmwgPSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwodXJsKTtcbiAgICByZXR1cm4gcGFyc2VkLmhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCBcIlwiKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBsb2dEZWJ1ZyhcIkZhaWxlZCB0byBwYXJzZSBkb21haW5cIiwgeyB1cmwsIGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgIHJldHVybiBcInVua25vd25cIjtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IHN1YmRvbWFpbkZyb21VcmwgPSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwodXJsKTtcbiAgICAgICAgbGV0IGhvc3RuYW1lID0gcGFyc2VkLmhvc3RuYW1lO1xuICAgICAgICAvLyBSZW1vdmUgd3d3LlxuICAgICAgICBob3N0bmFtZSA9IGhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCBcIlwiKTtcblxuICAgICAgICBjb25zdCBwYXJ0cyA9IGhvc3RuYW1lLnNwbGl0KCcuJyk7XG4gICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAyKSB7XG4gICAgICAgICAgICAgcmV0dXJuIHBhcnRzLnNsaWNlKDAsIHBhcnRzLmxlbmd0aCAtIDIpLmpvaW4oJy4nKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gXCJcIjtcbiAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgfVxufVxuXG5leHBvcnQgY29uc3QgZ2V0RmllbGRWYWx1ZSA9ICh0YWI6IFRhYk1ldGFkYXRhLCBmaWVsZDogc3RyaW5nKTogYW55ID0+IHtcbiAgICBzd2l0Y2goZmllbGQpIHtcbiAgICAgICAgY2FzZSAnaWQnOiByZXR1cm4gdGFiLmlkO1xuICAgICAgICBjYXNlICdpbmRleCc6IHJldHVybiB0YWIuaW5kZXg7XG4gICAgICAgIGNhc2UgJ3dpbmRvd0lkJzogcmV0dXJuIHRhYi53aW5kb3dJZDtcbiAgICAgICAgY2FzZSAnZ3JvdXBJZCc6IHJldHVybiB0YWIuZ3JvdXBJZDtcbiAgICAgICAgY2FzZSAndGl0bGUnOiByZXR1cm4gdGFiLnRpdGxlO1xuICAgICAgICBjYXNlICd1cmwnOiByZXR1cm4gdGFiLnVybDtcbiAgICAgICAgY2FzZSAnc3RhdHVzJzogcmV0dXJuIHRhYi5zdGF0dXM7XG4gICAgICAgIGNhc2UgJ2FjdGl2ZSc6IHJldHVybiB0YWIuYWN0aXZlO1xuICAgICAgICBjYXNlICdzZWxlY3RlZCc6IHJldHVybiB0YWIuc2VsZWN0ZWQ7XG4gICAgICAgIGNhc2UgJ3Bpbm5lZCc6IHJldHVybiB0YWIucGlubmVkO1xuICAgICAgICBjYXNlICdvcGVuZXJUYWJJZCc6IHJldHVybiB0YWIub3BlbmVyVGFiSWQ7XG4gICAgICAgIGNhc2UgJ2xhc3RBY2Nlc3NlZCc6IHJldHVybiB0YWIubGFzdEFjY2Vzc2VkO1xuICAgICAgICBjYXNlICdjb250ZXh0JzogcmV0dXJuIHRhYi5jb250ZXh0O1xuICAgICAgICBjYXNlICdnZW5yZSc6IHJldHVybiB0YWIuY29udGV4dERhdGE/LmdlbnJlO1xuICAgICAgICBjYXNlICdzaXRlTmFtZSc6IHJldHVybiB0YWIuY29udGV4dERhdGE/LnNpdGVOYW1lO1xuICAgICAgICAvLyBEZXJpdmVkIG9yIG1hcHBlZCBmaWVsZHNcbiAgICAgICAgY2FzZSAnZG9tYWluJzogcmV0dXJuIGRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGNhc2UgJ3N1YmRvbWFpbic6IHJldHVybiBzdWJkb21haW5Gcm9tVXJsKHRhYi51cmwpO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgaWYgKGZpZWxkLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgICAgICAgICAgcmV0dXJuIGZpZWxkLnNwbGl0KCcuJykucmVkdWNlKChvYmosIGtleSkgPT4gKG9iaiAmJiB0eXBlb2Ygb2JqID09PSAnb2JqZWN0JyAmJiBvYmogIT09IG51bGwpID8gKG9iaiBhcyBhbnkpW2tleV0gOiB1bmRlZmluZWQsIHRhYik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gKHRhYiBhcyBhbnkpW2ZpZWxkXTtcbiAgICB9XG59O1xuXG5jb25zdCBzdHJpcFRsZCA9IChkb21haW46IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIHJldHVybiBkb21haW4ucmVwbGFjZSgvXFwuKGNvbXxvcmd8Z292fG5ldHxlZHV8aW8pJC9pLCBcIlwiKTtcbn07XG5cbmV4cG9ydCBjb25zdCBzZW1hbnRpY0J1Y2tldCA9ICh0aXRsZTogc3RyaW5nLCB1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGtleSA9IGAke3RpdGxlfSAke3VybH1gLnRvTG93ZXJDYXNlKCk7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJkb2NcIikgfHwga2V5LmluY2x1ZGVzKFwicmVhZG1lXCIpIHx8IGtleS5pbmNsdWRlcyhcImd1aWRlXCIpKSByZXR1cm4gXCJEb2NzXCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJtYWlsXCIpIHx8IGtleS5pbmNsdWRlcyhcImluYm94XCIpKSByZXR1cm4gXCJDaGF0XCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJkYXNoYm9hcmRcIikgfHwga2V5LmluY2x1ZGVzKFwiY29uc29sZVwiKSkgcmV0dXJuIFwiRGFzaFwiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiaXNzdWVcIikgfHwga2V5LmluY2x1ZGVzKFwidGlja2V0XCIpKSByZXR1cm4gXCJUYXNrc1wiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZHJpdmVcIikgfHwga2V5LmluY2x1ZGVzKFwic3RvcmFnZVwiKSkgcmV0dXJuIFwiRmlsZXNcIjtcbiAgcmV0dXJuIFwiTWlzY1wiO1xufTtcblxuZXhwb3J0IGNvbnN0IG5hdmlnYXRpb25LZXkgPSAodGFiOiBUYWJNZXRhZGF0YSk6IHN0cmluZyA9PiB7XG4gIGlmICh0YWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBgY2hpbGQtb2YtJHt0YWIub3BlbmVyVGFiSWR9YDtcbiAgfVxuICByZXR1cm4gYHdpbmRvdy0ke3RhYi53aW5kb3dJZH1gO1xufTtcblxuY29uc3QgZ2V0UmVjZW5jeUxhYmVsID0gKGxhc3RBY2Nlc3NlZDogbnVtYmVyKTogc3RyaW5nID0+IHtcbiAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgY29uc3QgZGlmZiA9IG5vdyAtIGxhc3RBY2Nlc3NlZDtcbiAgaWYgKGRpZmYgPCAzNjAwMDAwKSByZXR1cm4gXCJKdXN0IG5vd1wiOyAvLyAxaFxuICBpZiAoZGlmZiA8IDg2NDAwMDAwKSByZXR1cm4gXCJUb2RheVwiOyAvLyAyNGhcbiAgaWYgKGRpZmYgPCAxNzI4MDAwMDApIHJldHVybiBcIlllc3RlcmRheVwiOyAvLyA0OGhcbiAgaWYgKGRpZmYgPCA2MDQ4MDAwMDApIHJldHVybiBcIlRoaXMgV2Vla1wiOyAvLyA3ZFxuICByZXR1cm4gXCJPbGRlclwiO1xufTtcblxuY29uc3QgY29sb3JGb3JLZXkgPSAoa2V5OiBzdHJpbmcsIG9mZnNldDogbnVtYmVyKTogc3RyaW5nID0+IENPTE9SU1soTWF0aC5hYnMoaGFzaENvZGUoa2V5KSkgKyBvZmZzZXQpICUgQ09MT1JTLmxlbmd0aF07XG5cbmNvbnN0IGhhc2hDb2RlID0gKHZhbHVlOiBzdHJpbmcpOiBudW1iZXIgPT4ge1xuICBsZXQgaGFzaCA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgdmFsdWUubGVuZ3RoOyBpICs9IDEpIHtcbiAgICBoYXNoID0gKGhhc2ggPDwgNSkgLSBoYXNoICsgdmFsdWUuY2hhckNvZGVBdChpKTtcbiAgICBoYXNoIHw9IDA7XG4gIH1cbiAgcmV0dXJuIGhhc2g7XG59O1xuXG4vLyBIZWxwZXIgdG8gZ2V0IGEgaHVtYW4tcmVhZGFibGUgbGFiZWwgY29tcG9uZW50IGZyb20gYSBzdHJhdGVneSBhbmQgYSBzZXQgb2YgdGFic1xuY29uc3QgZ2V0TGFiZWxDb21wb25lbnQgPSAoc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcsIHRhYnM6IFRhYk1ldGFkYXRhW10sIGFsbFRhYnNNYXA6IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPik6IHN0cmluZyB8IG51bGwgPT4ge1xuICBjb25zdCBmaXJzdFRhYiA9IHRhYnNbMF07XG4gIGlmICghZmlyc3RUYWIpIHJldHVybiBcIlVua25vd25cIjtcblxuICAvLyBDaGVjayBjdXN0b20gc3RyYXRlZ2llcyBmaXJzdFxuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG4gIGlmIChjdXN0b20pIHtcbiAgICAgIHJldHVybiBncm91cGluZ0tleShmaXJzdFRhYiwgc3RyYXRlZ3kpO1xuICB9XG5cbiAgc3dpdGNoIChzdHJhdGVneSkge1xuICAgIGNhc2UgXCJkb21haW5cIjoge1xuICAgICAgY29uc3Qgc2l0ZU5hbWVzID0gbmV3IFNldCh0YWJzLm1hcCh0ID0+IHQuY29udGV4dERhdGE/LnNpdGVOYW1lKS5maWx0ZXIoQm9vbGVhbikpO1xuICAgICAgaWYgKHNpdGVOYW1lcy5zaXplID09PSAxKSB7XG4gICAgICAgIHJldHVybiBzdHJpcFRsZChBcnJheS5mcm9tKHNpdGVOYW1lcylbMF0gYXMgc3RyaW5nKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdHJpcFRsZChkb21haW5Gcm9tVXJsKGZpcnN0VGFiLnVybCkpO1xuICAgIH1cbiAgICBjYXNlIFwiZG9tYWluX2Z1bGxcIjpcbiAgICAgIHJldHVybiBkb21haW5Gcm9tVXJsKGZpcnN0VGFiLnVybCk7XG4gICAgY2FzZSBcInRvcGljXCI6XG4gICAgICByZXR1cm4gc2VtYW50aWNCdWNrZXQoZmlyc3RUYWIudGl0bGUsIGZpcnN0VGFiLnVybCk7XG4gICAgY2FzZSBcImxpbmVhZ2VcIjpcbiAgICAgIGlmIChmaXJzdFRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNvbnN0IHBhcmVudCA9IGFsbFRhYnNNYXAuZ2V0KGZpcnN0VGFiLm9wZW5lclRhYklkKTtcbiAgICAgICAgaWYgKHBhcmVudCkge1xuICAgICAgICAgIGNvbnN0IHBhcmVudFRpdGxlID0gcGFyZW50LnRpdGxlLmxlbmd0aCA+IDIwID8gcGFyZW50LnRpdGxlLnN1YnN0cmluZygwLCAyMCkgKyBcIi4uLlwiIDogcGFyZW50LnRpdGxlO1xuICAgICAgICAgIHJldHVybiBgRnJvbTogJHtwYXJlbnRUaXRsZX1gO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBgRnJvbTogVGFiICR7Zmlyc3RUYWIub3BlbmVyVGFiSWR9YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgV2luZG93ICR7Zmlyc3RUYWIud2luZG93SWR9YDtcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgcmV0dXJuIGZpcnN0VGFiLmNvbnRleHQgfHwgXCJVbmNhdGVnb3JpemVkXCI7XG4gICAgY2FzZSBcInBpbm5lZFwiOlxuICAgICAgcmV0dXJuIGZpcnN0VGFiLnBpbm5lZCA/IFwiUGlubmVkXCIgOiBcIlVucGlubmVkXCI7XG4gICAgY2FzZSBcImFnZVwiOlxuICAgICAgcmV0dXJuIGdldFJlY2VuY3lMYWJlbChmaXJzdFRhYi5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgY2FzZSBcInVybFwiOlxuICAgICAgcmV0dXJuIFwiVVJMIEdyb3VwXCI7XG4gICAgY2FzZSBcInJlY2VuY3lcIjpcbiAgICAgIHJldHVybiBcIlRpbWUgR3JvdXBcIjtcbiAgICBjYXNlIFwibmVzdGluZ1wiOlxuICAgICAgcmV0dXJuIGZpcnN0VGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQgPyBcIkNoaWxkcmVuXCIgOiBcIlJvb3RzXCI7XG4gICAgZGVmYXVsdDpcbiAgICAgIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUoZmlyc3RUYWIsIHN0cmF0ZWd5KTtcbiAgICAgIGlmICh2YWwgIT09IHVuZGVmaW5lZCAmJiB2YWwgIT09IG51bGwpIHtcbiAgICAgICAgICByZXR1cm4gU3RyaW5nKHZhbCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gXCJVbmtub3duXCI7XG4gIH1cbn07XG5cbmNvbnN0IGdlbmVyYXRlTGFiZWwgPSAoXG4gIHN0cmF0ZWdpZXM6IChHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKVtdLFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBhbGxUYWJzTWFwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT5cbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGxhYmVscyA9IHN0cmF0ZWdpZXNcbiAgICAubWFwKHMgPT4gZ2V0TGFiZWxDb21wb25lbnQocywgdGFicywgYWxsVGFic01hcCkpXG4gICAgLmZpbHRlcihsID0+IGwgJiYgbCAhPT0gXCJVbmtub3duXCIgJiYgbCAhPT0gXCJHcm91cFwiICYmIGwgIT09IFwiVVJMIEdyb3VwXCIgJiYgbCAhPT0gXCJUaW1lIEdyb3VwXCIgJiYgbCAhPT0gXCJNaXNjXCIpO1xuXG4gIGlmIChsYWJlbHMubGVuZ3RoID09PSAwKSByZXR1cm4gXCJHcm91cFwiO1xuICByZXR1cm4gQXJyYXkuZnJvbShuZXcgU2V0KGxhYmVscykpLmpvaW4oXCIgLSBcIik7XG59O1xuXG5jb25zdCBnZXRTdHJhdGVneUNvbG9yUnVsZSA9IChzdHJhdGVneUlkOiBzdHJpbmcpOiBHcm91cGluZ1J1bGUgfCB1bmRlZmluZWQgPT4ge1xuICAgIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5SWQpO1xuICAgIGlmICghY3VzdG9tKSByZXR1cm4gdW5kZWZpbmVkO1xuXG4gICAgY29uc3QgZ3JvdXBpbmdSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgIC8vIEl0ZXJhdGUgbWFudWFsbHkgdG8gY2hlY2sgY29sb3JcbiAgICBmb3IgKGxldCBpID0gZ3JvdXBpbmdSdWxlc0xpc3QubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgY29uc3QgcnVsZSA9IGdyb3VwaW5nUnVsZXNMaXN0W2ldO1xuICAgICAgICBpZiAocnVsZSAmJiBydWxlLmNvbG9yICYmIHJ1bGUuY29sb3IgIT09ICdyYW5kb20nKSB7XG4gICAgICAgICAgICByZXR1cm4gcnVsZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufTtcblxuY29uc3QgcmVzb2x2ZVdpbmRvd01vZGUgPSAobW9kZXM6IChzdHJpbmcgfCB1bmRlZmluZWQpW10pOiBcImN1cnJlbnRcIiB8IFwibmV3XCIgfCBcImNvbXBvdW5kXCIgPT4ge1xuICAgIGlmIChtb2Rlcy5pbmNsdWRlcyhcIm5ld1wiKSkgcmV0dXJuIFwibmV3XCI7XG4gICAgaWYgKG1vZGVzLmluY2x1ZGVzKFwiY29tcG91bmRcIikpIHJldHVybiBcImNvbXBvdW5kXCI7XG4gICAgcmV0dXJuIFwiY3VycmVudFwiO1xufTtcblxuZXhwb3J0IGNvbnN0IGdyb3VwVGFicyA9IChcbiAgdGFiczogVGFiTWV0YWRhdGFbXSxcbiAgc3RyYXRlZ2llczogKFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZylbXVxuKTogVGFiR3JvdXBbXSA9PiB7XG4gIGNvbnN0IGF2YWlsYWJsZVN0cmF0ZWdpZXMgPSBnZXRTdHJhdGVnaWVzKGN1c3RvbVN0cmF0ZWdpZXMpO1xuICBjb25zdCBlZmZlY3RpdmVTdHJhdGVnaWVzID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiBhdmFpbGFibGVTdHJhdGVnaWVzLmZpbmQoYXZhaWwgPT4gYXZhaWwuaWQgPT09IHMpPy5pc0dyb3VwaW5nKTtcbiAgY29uc3QgYnVja2V0cyA9IG5ldyBNYXA8c3RyaW5nLCBUYWJHcm91cD4oKTtcblxuICBjb25zdCBhbGxUYWJzTWFwID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPigpO1xuICB0YWJzLmZvckVhY2godCA9PiBhbGxUYWJzTWFwLnNldCh0LmlkLCB0KSk7XG5cbiAgdGFicy5mb3JFYWNoKCh0YWIpID0+IHtcbiAgICBsZXQga2V5czogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBhcHBsaWVkU3RyYXRlZ2llczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBjb2xsZWN0ZWRNb2Rlczogc3RyaW5nW10gPSBbXTtcblxuICAgIHRyeSB7XG4gICAgICAgIGZvciAoY29uc3QgcyBvZiBlZmZlY3RpdmVTdHJhdGVnaWVzKSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBnZXRHcm91cGluZ1Jlc3VsdCh0YWIsIHMpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdC5rZXkgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBrZXlzLnB1c2goYCR7c306JHtyZXN1bHQua2V5fWApO1xuICAgICAgICAgICAgICAgIGFwcGxpZWRTdHJhdGVnaWVzLnB1c2gocyk7XG4gICAgICAgICAgICAgICAgY29sbGVjdGVkTW9kZXMucHVzaChyZXN1bHQubW9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgZ2VuZXJhdGluZyBncm91cGluZyBrZXlcIiwgeyB0YWJJZDogdGFiLmlkLCBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICByZXR1cm47IC8vIFNraXAgdGhpcyB0YWIgb24gZXJyb3JcbiAgICB9XG5cbiAgICAvLyBJZiBubyBzdHJhdGVnaWVzIGFwcGxpZWQgKGUuZy4gYWxsIGZpbHRlcmVkIG91dCksIHNraXAgZ3JvdXBpbmcgZm9yIHRoaXMgdGFiXG4gICAgaWYgKGtleXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBlZmZlY3RpdmVNb2RlID0gcmVzb2x2ZVdpbmRvd01vZGUoY29sbGVjdGVkTW9kZXMpO1xuICAgIGNvbnN0IHZhbHVlS2V5ID0ga2V5cy5qb2luKFwiOjpcIik7XG4gICAgbGV0IGJ1Y2tldEtleSA9IFwiXCI7XG4gICAgaWYgKGVmZmVjdGl2ZU1vZGUgPT09ICdjdXJyZW50Jykge1xuICAgICAgICAgYnVja2V0S2V5ID0gYHdpbmRvdy0ke3RhYi53aW5kb3dJZH06OmAgKyB2YWx1ZUtleTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAgYnVja2V0S2V5ID0gYGdsb2JhbDo6YCArIHZhbHVlS2V5O1xuICAgIH1cblxuICAgIGxldCBncm91cCA9IGJ1Y2tldHMuZ2V0KGJ1Y2tldEtleSk7XG4gICAgaWYgKCFncm91cCkge1xuICAgICAgbGV0IGdyb3VwQ29sb3IgPSBudWxsO1xuICAgICAgbGV0IGNvbG9yRmllbGQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICAgICAgZm9yIChjb25zdCBzSWQgb2YgYXBwbGllZFN0cmF0ZWdpZXMpIHtcbiAgICAgICAgY29uc3QgcnVsZSA9IGdldFN0cmF0ZWd5Q29sb3JSdWxlKHNJZCk7XG4gICAgICAgIGlmIChydWxlKSB7XG4gICAgICAgICAgICBncm91cENvbG9yID0gcnVsZS5jb2xvcjtcbiAgICAgICAgICAgIGNvbG9yRmllbGQgPSBydWxlLmNvbG9yRmllbGQ7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoZ3JvdXBDb2xvciA9PT0gJ21hdGNoJykge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkodmFsdWVLZXksIDApO1xuICAgICAgfSBlbHNlIGlmIChncm91cENvbG9yID09PSAnZmllbGQnICYmIGNvbG9yRmllbGQpIHtcbiAgICAgICAgY29uc3QgdmFsID0gZ2V0RmllbGRWYWx1ZSh0YWIsIGNvbG9yRmllbGQpO1xuICAgICAgICBjb25zdCBrZXkgPSB2YWwgIT09IHVuZGVmaW5lZCAmJiB2YWwgIT09IG51bGwgPyBTdHJpbmcodmFsKSA6IFwiXCI7XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleShrZXksIDApO1xuICAgICAgfSBlbHNlIGlmICghZ3JvdXBDb2xvciB8fCBncm91cENvbG9yID09PSAnZmllbGQnKSB7XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleShidWNrZXRLZXksIGJ1Y2tldHMuc2l6ZSk7XG4gICAgICB9XG5cbiAgICAgIGdyb3VwID0ge1xuICAgICAgICBpZDogYnVja2V0S2V5LFxuICAgICAgICB3aW5kb3dJZDogdGFiLndpbmRvd0lkLFxuICAgICAgICBsYWJlbDogXCJcIixcbiAgICAgICAgY29sb3I6IGdyb3VwQ29sb3IsXG4gICAgICAgIHRhYnM6IFtdLFxuICAgICAgICByZWFzb246IGFwcGxpZWRTdHJhdGVnaWVzLmpvaW4oXCIgKyBcIiksXG4gICAgICAgIHdpbmRvd01vZGU6IGVmZmVjdGl2ZU1vZGVcbiAgICAgIH07XG4gICAgICBidWNrZXRzLnNldChidWNrZXRLZXksIGdyb3VwKTtcbiAgICB9XG4gICAgZ3JvdXAudGFicy5wdXNoKHRhYik7XG4gIH0pO1xuXG4gIGNvbnN0IGdyb3VwcyA9IEFycmF5LmZyb20oYnVja2V0cy52YWx1ZXMoKSk7XG4gIGdyb3Vwcy5mb3JFYWNoKGdyb3VwID0+IHtcbiAgICBncm91cC5sYWJlbCA9IGdlbmVyYXRlTGFiZWwoZWZmZWN0aXZlU3RyYXRlZ2llcywgZ3JvdXAudGFicywgYWxsVGFic01hcCk7XG4gIH0pO1xuXG4gIHJldHVybiBncm91cHM7XG59O1xuXG5leHBvcnQgY29uc3QgY2hlY2tDb25kaXRpb24gPSAoY29uZGl0aW9uOiBSdWxlQ29uZGl0aW9uLCB0YWI6IFRhYk1ldGFkYXRhKTogYm9vbGVhbiA9PiB7XG4gICAgaWYgKCFjb25kaXRpb24pIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCByYXdWYWx1ZSA9IGdldEZpZWxkVmFsdWUodGFiLCBjb25kaXRpb24uZmllbGQpO1xuICAgIGNvbnN0IHZhbHVlVG9DaGVjayA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQgJiYgcmF3VmFsdWUgIT09IG51bGwgPyBTdHJpbmcocmF3VmFsdWUpLnRvTG93ZXJDYXNlKCkgOiBcIlwiO1xuICAgIGNvbnN0IHBhdHRlcm4gPSBjb25kaXRpb24udmFsdWUgPyBjb25kaXRpb24udmFsdWUudG9Mb3dlckNhc2UoKSA6IFwiXCI7XG5cbiAgICBzd2l0Y2ggKGNvbmRpdGlvbi5vcGVyYXRvcikge1xuICAgICAgICBjYXNlICdjb250YWlucyc6IHJldHVybiB2YWx1ZVRvQ2hlY2suaW5jbHVkZXMocGF0dGVybik7XG4gICAgICAgIGNhc2UgJ2RvZXNOb3RDb250YWluJzogcmV0dXJuICF2YWx1ZVRvQ2hlY2suaW5jbHVkZXMocGF0dGVybik7XG4gICAgICAgIGNhc2UgJ2VxdWFscyc6IHJldHVybiB2YWx1ZVRvQ2hlY2sgPT09IHBhdHRlcm47XG4gICAgICAgIGNhc2UgJ3N0YXJ0c1dpdGgnOiByZXR1cm4gdmFsdWVUb0NoZWNrLnN0YXJ0c1dpdGgocGF0dGVybik7XG4gICAgICAgIGNhc2UgJ2VuZHNXaXRoJzogcmV0dXJuIHZhbHVlVG9DaGVjay5lbmRzV2l0aChwYXR0ZXJuKTtcbiAgICAgICAgY2FzZSAnZXhpc3RzJzogcmV0dXJuIHJhd1ZhbHVlICE9PSB1bmRlZmluZWQ7XG4gICAgICAgIGNhc2UgJ2RvZXNOb3RFeGlzdCc6IHJldHVybiByYXdWYWx1ZSA9PT0gdW5kZWZpbmVkO1xuICAgICAgICBjYXNlICdpc051bGwnOiByZXR1cm4gcmF3VmFsdWUgPT09IG51bGw7XG4gICAgICAgIGNhc2UgJ2lzTm90TnVsbCc6IHJldHVybiByYXdWYWx1ZSAhPT0gbnVsbDtcbiAgICAgICAgY2FzZSAnbWF0Y2hlcyc6XG4gICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFJlZ0V4cChjb25kaXRpb24udmFsdWUsICdpJykudGVzdChyYXdWYWx1ZSAhPT0gdW5kZWZpbmVkICYmIHJhd1ZhbHVlICE9PSBudWxsID8gU3RyaW5nKHJhd1ZhbHVlKSA6IFwiXCIpO1xuICAgICAgICAgICAgIH0gY2F0Y2ggeyByZXR1cm4gZmFsc2U7IH1cbiAgICAgICAgZGVmYXVsdDogcmV0dXJuIGZhbHNlO1xuICAgIH1cbn07XG5cbmZ1bmN0aW9uIGV2YWx1YXRlTGVnYWN5UnVsZXMobGVnYWN5UnVsZXM6IFN0cmF0ZWd5UnVsZVtdLCB0YWI6IFRhYk1ldGFkYXRhKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgLy8gRGVmZW5zaXZlIGNoZWNrXG4gICAgaWYgKCFsZWdhY3lSdWxlcyB8fCAhQXJyYXkuaXNBcnJheShsZWdhY3lSdWxlcykpIHtcbiAgICAgICAgaWYgKCFsZWdhY3lSdWxlcykgcmV0dXJuIG51bGw7XG4gICAgICAgIC8vIFRyeSBhc0FycmF5IGlmIGl0J3Mgbm90IGFycmF5IGJ1dCB0cnV0aHkgKHVubGlrZWx5IGdpdmVuIHByZXZpb3VzIGxvZ2ljIGJ1dCBzYWZlKVxuICAgIH1cblxuICAgIGNvbnN0IGxlZ2FjeVJ1bGVzTGlzdCA9IGFzQXJyYXk8U3RyYXRlZ3lSdWxlPihsZWdhY3lSdWxlcyk7XG4gICAgaWYgKGxlZ2FjeVJ1bGVzTGlzdC5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGxlZ2FjeVJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHJhd1ZhbHVlID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgbGV0IHZhbHVlVG9DaGVjayA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQgJiYgcmF3VmFsdWUgIT09IG51bGwgPyBTdHJpbmcocmF3VmFsdWUpIDogXCJcIjtcbiAgICAgICAgICAgIHZhbHVlVG9DaGVjayA9IHZhbHVlVG9DaGVjay50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgY29uc3QgcGF0dGVybiA9IHJ1bGUudmFsdWUgPyBydWxlLnZhbHVlLnRvTG93ZXJDYXNlKCkgOiBcIlwiO1xuXG4gICAgICAgICAgICBsZXQgaXNNYXRjaCA9IGZhbHNlO1xuICAgICAgICAgICAgbGV0IG1hdGNoT2JqOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsID0gbnVsbDtcblxuICAgICAgICAgICAgc3dpdGNoIChydWxlLm9wZXJhdG9yKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAnY29udGFpbnMnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrLmluY2x1ZGVzKHBhdHRlcm4pOyBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdkb2VzTm90Q29udGFpbic6IGlzTWF0Y2ggPSAhdmFsdWVUb0NoZWNrLmluY2x1ZGVzKHBhdHRlcm4pOyBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdlcXVhbHMnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrID09PSBwYXR0ZXJuOyBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdzdGFydHNXaXRoJzogaXNNYXRjaCA9IHZhbHVlVG9DaGVjay5zdGFydHNXaXRoKHBhdHRlcm4pOyBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdlbmRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suZW5kc1dpdGgocGF0dGVybik7IGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2V4aXN0cyc6IGlzTWF0Y2ggPSByYXdWYWx1ZSAhPT0gdW5kZWZpbmVkOyBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdkb2VzTm90RXhpc3QnOiBpc01hdGNoID0gcmF3VmFsdWUgPT09IHVuZGVmaW5lZDsgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnaXNOdWxsJzogaXNNYXRjaCA9IHJhd1ZhbHVlID09PSBudWxsOyBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdpc05vdE51bGwnOiBpc01hdGNoID0gcmF3VmFsdWUgIT09IG51bGw7IGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ21hdGNoZXMnOlxuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHJ1bGUudmFsdWUsICdpJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBtYXRjaE9iaiA9IHJlZ2V4LmV4ZWMocmF3VmFsdWUgIT09IHVuZGVmaW5lZCAmJiByYXdWYWx1ZSAhPT0gbnVsbCA/IFN0cmluZyhyYXdWYWx1ZSkgOiBcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzTWF0Y2ggPSAhIW1hdGNoT2JqO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7fVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGlzTWF0Y2gpIHtcbiAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gcnVsZS5yZXN1bHQ7XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoT2JqKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbWF0Y2hPYmoubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShuZXcgUmVnRXhwKGBcXFxcJCR7aX1gLCAnZycpLCBtYXRjaE9ialtpXSB8fCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbG9nRGVidWcoXCJFcnJvciBldmFsdWF0aW5nIGxlZ2FjeSBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGNvbnN0IGdldEdyb3VwaW5nUmVzdWx0ID0gKHRhYjogVGFiTWV0YWRhdGEsIHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogeyBrZXk6IHN0cmluZyB8IG51bGwsIG1vZGU6IFwiY3VycmVudFwiIHwgXCJuZXdcIiB8IFwiY29tcG91bmRcIiB9ID0+IHtcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICBjb25zdCBmaWx0ZXJHcm91cHNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uW10+KGN1c3RvbS5maWx0ZXJHcm91cHMpO1xuICAgICAgY29uc3QgZmlsdGVyc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGN1c3RvbS5maWx0ZXJzKTtcblxuICAgICAgbGV0IG1hdGNoID0gZmFsc2U7XG5cbiAgICAgIGlmIChmaWx0ZXJHcm91cHNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBPUiBsb2dpY1xuICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZmlsdGVyR3JvdXBzTGlzdCkge1xuICAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihncm91cCk7XG4gICAgICAgICAgICAgIGlmIChncm91cFJ1bGVzLmxlbmd0aCA9PT0gMCB8fCBncm91cFJ1bGVzLmV2ZXJ5KHIgPT4gY2hlY2tDb25kaXRpb24ociwgdGFiKSkpIHtcbiAgICAgICAgICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChmaWx0ZXJzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gTGVnYWN5L1NpbXBsZSBBTkQgbG9naWNcbiAgICAgICAgICBpZiAoZmlsdGVyc0xpc3QuZXZlcnkoZiA9PiBjaGVja0NvbmRpdGlvbihmLCB0YWIpKSkge1xuICAgICAgICAgICAgICBtYXRjaCA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBObyBmaWx0ZXJzIC0+IE1hdGNoIGFsbFxuICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICAgIHJldHVybiB7IGtleTogbnVsbCwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZ3JvdXBpbmdSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgICAgaWYgKGdyb3VwaW5nUnVsZXNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICBjb25zdCBtb2Rlczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwaW5nUnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBsZXQgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICAgICBpZiAocnVsZS5zb3VyY2UgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJhdyA9IGdldEZpZWxkVmFsdWUodGFiLCBydWxlLnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHJhdyAhPT0gdW5kZWZpbmVkICYmIHJhdyAhPT0gbnVsbCA/IFN0cmluZyhyYXcpIDogXCJcIjtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgdmFsID0gcnVsZS52YWx1ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodmFsICYmIHJ1bGUudHJhbnNmb3JtICYmIHJ1bGUudHJhbnNmb3JtICE9PSAnbm9uZScpIHtcbiAgICAgICAgICAgICAgICAgICAgc3dpdGNoIChydWxlLnRyYW5zZm9ybSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnc3RyaXBUbGQnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHN0cmlwVGxkKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdsb3dlcmNhc2UnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHZhbC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAndXBwZXJjYXNlJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSB2YWwudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ2ZpcnN0Q2hhcic6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gdmFsLmNoYXJBdCgwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ2RvbWFpbic6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gZG9tYWluRnJvbVVybCh2YWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnaG9zdG5hbWUnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBuZXcgVVJMKHZhbCkuaG9zdG5hbWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIGtlZXAgYXMgaXMgKi8gfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAncmVnZXgnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChydWxlLnRyYW5zZm9ybVBhdHRlcm4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCByZWdleCA9IHJlZ2V4Q2FjaGUuZ2V0KHJ1bGUudHJhbnNmb3JtUGF0dGVybik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXJlZ2V4KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVnZXggPSBuZXcgUmVnRXhwKHJ1bGUudHJhbnNmb3JtUGF0dGVybik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVnZXhDYWNoZS5zZXQocnVsZS50cmFuc2Zvcm1QYXR0ZXJuLCByZWdleCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtYXRjaCA9IHJlZ2V4LmV4ZWModmFsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBleHRyYWN0ZWQgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbWF0Y2gubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXh0cmFjdGVkICs9IG1hdGNoW2ldIHx8IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IGV4dHJhY3RlZDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbG9nRGVidWcoXCJJbnZhbGlkIHJlZ2V4IGluIHRyYW5zZm9ybVwiLCB7IHBhdHRlcm46IHJ1bGUudHJhbnNmb3JtUGF0dGVybiwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgcGFydHMucHVzaCh2YWwpO1xuICAgICAgICAgICAgICAgICAgICBpZiAocnVsZS53aW5kb3dNb2RlKSBtb2Rlcy5wdXNoKHJ1bGUud2luZG93TW9kZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGFwcGx5aW5nIGdyb3VwaW5nIHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICByZXR1cm4geyBrZXk6IHBhcnRzLmpvaW4oXCIgLSBcIiksIG1vZGU6IHJlc29sdmVXaW5kb3dNb2RlKG1vZGVzKSB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4geyBrZXk6IGN1c3RvbS5mYWxsYmFjayB8fCBcIk1pc2NcIiwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH0gZWxzZSBpZiAoY3VzdG9tLnJ1bGVzKSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gZXZhbHVhdGVMZWdhY3lSdWxlcyhhc0FycmF5PFN0cmF0ZWd5UnVsZT4oY3VzdG9tLnJ1bGVzKSwgdGFiKTtcbiAgICAgICAgICBpZiAocmVzdWx0KSByZXR1cm4geyBrZXk6IHJlc3VsdCwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHsga2V5OiBjdXN0b20uZmFsbGJhY2sgfHwgXCJNaXNjXCIsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gIH1cblxuICAvLyBCdWlsdC1pbiBzdHJhdGVnaWVzXG4gIGxldCBzaW1wbGVLZXk6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcImRvbWFpblwiOlxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgc2ltcGxlS2V5ID0gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgc2ltcGxlS2V5ID0gc2VtYW50aWNCdWNrZXQodGFiLnRpdGxlLCB0YWIudXJsKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJsaW5lYWdlXCI6XG4gICAgICBzaW1wbGVLZXkgPSBuYXZpZ2F0aW9uS2V5KHRhYik7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLmNvbnRleHQgfHwgXCJVbmNhdGVnb3JpemVkXCI7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIucGlubmVkID8gXCJwaW5uZWRcIiA6IFwidW5waW5uZWRcIjtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJhZ2VcIjpcbiAgICAgIHNpbXBsZUtleSA9IGdldFJlY2VuY3lMYWJlbCh0YWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInVybFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnVybDtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ0aXRsZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnRpdGxlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInJlY2VuY3lcIjpcbiAgICAgIHNpbXBsZUtleSA9IFN0cmluZyh0YWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gXCJjaGlsZFwiIDogXCJyb290XCI7XG4gICAgICBicmVhaztcbiAgICBkZWZhdWx0OlxuICAgICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKHRhYiwgc3RyYXRlZ3kpO1xuICAgICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsKSB7XG4gICAgICAgICAgICBzaW1wbGVLZXkgPSBTdHJpbmcodmFsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNpbXBsZUtleSA9IFwiVW5rbm93blwiO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICB9XG4gIHJldHVybiB7IGtleTogc2ltcGxlS2V5LCBtb2RlOiBcImN1cnJlbnRcIiB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGdyb3VwaW5nS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEsIHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gICAgcmV0dXJuIGdldEdyb3VwaW5nUmVzdWx0KHRhYiwgc3RyYXRlZ3kpLmtleTtcbn07XG5cbmZ1bmN0aW9uIGlzQ29udGV4dEZpZWxkKGZpZWxkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gZmllbGQgPT09ICdjb250ZXh0JyB8fCBmaWVsZCA9PT0gJ2dlbnJlJyB8fCBmaWVsZCA9PT0gJ3NpdGVOYW1lJyB8fCBmaWVsZC5zdGFydHNXaXRoKCdjb250ZXh0RGF0YS4nKTtcbn1cblxuZXhwb3J0IGNvbnN0IHJlcXVpcmVzQ29udGV4dEFuYWx5c2lzID0gKHN0cmF0ZWd5SWRzOiAoc3RyaW5nIHwgU29ydGluZ1N0cmF0ZWd5KVtdKTogYm9vbGVhbiA9PiB7XG4gICAgLy8gQ2hlY2sgaWYgXCJjb250ZXh0XCIgc3RyYXRlZ3kgaXMgZXhwbGljaXRseSByZXF1ZXN0ZWRcbiAgICBpZiAoc3RyYXRlZ3lJZHMuaW5jbHVkZXMoXCJjb250ZXh0XCIpKSByZXR1cm4gdHJ1ZTtcblxuICAgIGNvbnN0IHN0cmF0ZWdpZXMgPSBnZXRTdHJhdGVnaWVzKGN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgIC8vIGZpbHRlciBvbmx5IHRob3NlIHRoYXQgbWF0Y2ggdGhlIHJlcXVlc3RlZCBJRHNcbiAgICBjb25zdCBhY3RpdmVEZWZzID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiBzdHJhdGVneUlkcy5pbmNsdWRlcyhzLmlkKSk7XG5cbiAgICBmb3IgKGNvbnN0IGRlZiBvZiBhY3RpdmVEZWZzKSB7XG4gICAgICAgIC8vIElmIGl0J3MgYSBidWlsdC1pbiBzdHJhdGVneSB0aGF0IG5lZWRzIGNvbnRleHQgKG9ubHkgJ2NvbnRleHQnIGRvZXMpXG4gICAgICAgIGlmIChkZWYuaWQgPT09ICdjb250ZXh0JykgcmV0dXJuIHRydWU7XG5cbiAgICAgICAgLy8gSWYgaXQgaXMgYSBjdXN0b20gc3RyYXRlZ3kgKG9yIG92ZXJyaWRlcyBidWlsdC1pbiksIGNoZWNrIGl0cyBydWxlc1xuICAgICAgICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQoYyA9PiBjLmlkID09PSBkZWYuaWQpO1xuICAgICAgICBpZiAoY3VzdG9tKSB7XG4gICAgICAgICAgICAgY29uc3QgZ3JvdXBSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IHNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uc29ydGluZ1J1bGVzKTtcbiAgICAgICAgICAgICBjb25zdCBncm91cFNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uZ3JvdXBTb3J0aW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IGZpbHRlcnNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihjdXN0b20uZmlsdGVycyk7XG4gICAgICAgICAgICAgY29uc3QgZmlsdGVyR3JvdXBzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbltdPihjdXN0b20uZmlsdGVyR3JvdXBzKTtcblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBydWxlLnNvdXJjZSA9PT0gJ2ZpZWxkJyAmJiBpc0NvbnRleHRGaWVsZChydWxlLnZhbHVlKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIHJ1bGUuY29sb3IgPT09ICdmaWVsZCcgJiYgcnVsZS5jb2xvckZpZWxkICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuY29sb3JGaWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBzb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBTb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZmlsdGVyc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZmlsdGVyR3JvdXBzTGlzdCkge1xuICAgICAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihncm91cCk7XG4gICAgICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFJ1bGVzKSB7XG4gICAgICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufTtcbiIsICJpbXBvcnQgeyBTb3J0aW5nU3RyYXRlZ3ksIFRhYk1ldGFkYXRhLCBDdXN0b21TdHJhdGVneSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBkb21haW5Gcm9tVXJsLCBzZW1hbnRpY0J1Y2tldCwgbmF2aWdhdGlvbktleSwgZ3JvdXBpbmdLZXksIGdldEZpZWxkVmFsdWUsIGdldEN1c3RvbVN0cmF0ZWdpZXMgfSBmcm9tIFwiLi9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCByZWNlbmN5U2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gdGFiLmxhc3RBY2Nlc3NlZCA/PyAwO1xuZXhwb3J0IGNvbnN0IGhpZXJhcmNoeVNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+ICh0YWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IDEgOiAwKTtcbmV4cG9ydCBjb25zdCBwaW5uZWRTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiAodGFiLnBpbm5lZCA/IDAgOiAxKTtcblxuZXhwb3J0IGNvbnN0IHNvcnRUYWJzID0gKHRhYnM6IFRhYk1ldGFkYXRhW10sIHN0cmF0ZWdpZXM6IFNvcnRpbmdTdHJhdGVneVtdKTogVGFiTWV0YWRhdGFbXSA9PiB7XG4gIGNvbnN0IHNjb3Jpbmc6IFNvcnRpbmdTdHJhdGVneVtdID0gc3RyYXRlZ2llcy5sZW5ndGggPyBzdHJhdGVnaWVzIDogW1wicGlubmVkXCIsIFwicmVjZW5jeVwiXTtcbiAgcmV0dXJuIFsuLi50YWJzXS5zb3J0KChhLCBiKSA9PiB7XG4gICAgZm9yIChjb25zdCBzdHJhdGVneSBvZiBzY29yaW5nKSB7XG4gICAgICBjb25zdCBkaWZmID0gY29tcGFyZUJ5KHN0cmF0ZWd5LCBhLCBiKTtcbiAgICAgIGlmIChkaWZmICE9PSAwKSByZXR1cm4gZGlmZjtcbiAgICB9XG4gICAgcmV0dXJuIGEuaWQgLSBiLmlkO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBjb21wYXJlQnkgPSAoc3RyYXRlZ3k6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZywgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyID0+IHtcbiAgLy8gMS4gQ2hlY2sgQ3VzdG9tIFN0cmF0ZWdpZXMgZm9yIFNvcnRpbmcgUnVsZXNcbiAgY29uc3QgY3VzdG9tU3RyYXRzID0gZ2V0Q3VzdG9tU3RyYXRlZ2llcygpO1xuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdHMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5zb3J0aW5nUnVsZXMpO1xuICAgICAgaWYgKHNvcnRSdWxlc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIEV2YWx1YXRlIGN1c3RvbSBzb3J0aW5nIHJ1bGVzIGluIG9yZGVyXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBydWxlLmZpZWxkKTtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbEIgPSBnZXRGaWVsZFZhbHVlKGIsIHJ1bGUuZmllbGQpO1xuXG4gICAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gMDtcbiAgICAgICAgICAgICAgICAgIGlmICh2YWxBIDwgdmFsQikgcmVzdWx0ID0gLTE7XG4gICAgICAgICAgICAgICAgICBlbHNlIGlmICh2YWxBID4gdmFsQikgcmVzdWx0ID0gMTtcblxuICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBydWxlLm9yZGVyID09PSAnZGVzYycgPyAtcmVzdWx0IDogcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgY3VzdG9tIHNvcnRpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBJZiBhbGwgcnVsZXMgZXF1YWwsIGNvbnRpbnVlIHRvIG5leHQgc3RyYXRlZ3kgKHJldHVybiAwKVxuICAgICAgICAgIHJldHVybiAwO1xuICAgICAgfVxuICB9XG5cbiAgLy8gMi4gQnVpbHQtaW4gb3IgZmFsbGJhY2tcbiAgc3dpdGNoIChzdHJhdGVneSkge1xuICAgIGNhc2UgXCJyZWNlbmN5XCI6XG4gICAgICByZXR1cm4gKGIubGFzdEFjY2Vzc2VkID8/IDApIC0gKGEubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6IC8vIEZvcm1lcmx5IGhpZXJhcmNoeVxuICAgICAgcmV0dXJuIGhpZXJhcmNoeVNjb3JlKGEpIC0gaGllcmFyY2h5U2NvcmUoYik7XG4gICAgY2FzZSBcInBpbm5lZFwiOlxuICAgICAgcmV0dXJuIHBpbm5lZFNjb3JlKGEpIC0gcGlubmVkU2NvcmUoYik7XG4gICAgY2FzZSBcInRpdGxlXCI6XG4gICAgICByZXR1cm4gYS50aXRsZS5sb2NhbGVDb21wYXJlKGIudGl0bGUpO1xuICAgIGNhc2UgXCJ1cmxcIjpcbiAgICAgIHJldHVybiBhLnVybC5sb2NhbGVDb21wYXJlKGIudXJsKTtcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgcmV0dXJuIChhLmNvbnRleHQgPz8gXCJcIikubG9jYWxlQ29tcGFyZShiLmNvbnRleHQgPz8gXCJcIik7XG4gICAgY2FzZSBcImRvbWFpblwiOlxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgcmV0dXJuIGRvbWFpbkZyb21VcmwoYS51cmwpLmxvY2FsZUNvbXBhcmUoZG9tYWluRnJvbVVybChiLnVybCkpO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgcmV0dXJuIHNlbWFudGljQnVja2V0KGEudGl0bGUsIGEudXJsKS5sb2NhbGVDb21wYXJlKHNlbWFudGljQnVja2V0KGIudGl0bGUsIGIudXJsKSk7XG4gICAgY2FzZSBcImxpbmVhZ2VcIjpcbiAgICAgIHJldHVybiBuYXZpZ2F0aW9uS2V5KGEpLmxvY2FsZUNvbXBhcmUobmF2aWdhdGlvbktleShiKSk7XG4gICAgY2FzZSBcImFnZVwiOlxuICAgICAgLy8gUmV2ZXJzZSBhbHBoYWJldGljYWwgZm9yIGFnZSBidWNrZXRzIChUb2RheSA8IFllc3RlcmRheSksIHJvdWdoIGFwcHJveFxuICAgICAgcmV0dXJuIChncm91cGluZ0tleShhLCBcImFnZVwiKSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIFwiYWdlXCIpIHx8IFwiXCIpO1xuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBDaGVjayBpZiBpdCdzIGEgZ2VuZXJpYyBmaWVsZCBmaXJzdFxuICAgICAgY29uc3QgdmFsQSA9IGdldEZpZWxkVmFsdWUoYSwgc3RyYXRlZ3kpO1xuICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgc3RyYXRlZ3kpO1xuXG4gICAgICBpZiAodmFsQSAhPT0gdW5kZWZpbmVkICYmIHZhbEIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGlmICh2YWxBIDwgdmFsQikgcmV0dXJuIC0xO1xuICAgICAgICAgIGlmICh2YWxBID4gdmFsQikgcmV0dXJuIDE7XG4gICAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9XG5cbiAgICAgIC8vIEZhbGxiYWNrIGZvciBjdXN0b20gc3RyYXRlZ2llcyBncm91cGluZyBrZXkgKGlmIHVzaW5nIGN1c3RvbSBzdHJhdGVneSBhcyBzb3J0aW5nIGJ1dCBubyBzb3J0aW5nIHJ1bGVzIGRlZmluZWQpXG4gICAgICAvLyBvciB1bmhhbmRsZWQgYnVpbHQtaW5zXG4gICAgICByZXR1cm4gKGdyb3VwaW5nS2V5KGEsIHN0cmF0ZWd5KSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIHN0cmF0ZWd5KSB8fCBcIlwiKTtcbiAgfVxufTtcbiIsICJpbXBvcnQgeyBhbmFseXplVGFiQ29udGV4dCwgQ29udGV4dFJlc3VsdCB9IGZyb20gXCIuLi9iYWNrZ3JvdW5kL2NvbnRleHRBbmFseXNpcy5qc1wiO1xuaW1wb3J0IHtcbiAgZ3JvdXBUYWJzLFxuICBkb21haW5Gcm9tVXJsLFxuICBzZW1hbnRpY0J1Y2tldCxcbiAgbmF2aWdhdGlvbktleSxcbiAgZ3JvdXBpbmdLZXlcbn0gZnJvbSBcIi4uL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBHRU5FUkFfUkVHSVNUUlkgfSBmcm9tIFwiLi4vYmFja2dyb3VuZC9leHRyYWN0aW9uL2dlbmVyYVJlZ2lzdHJ5LmpzXCI7XG5pbXBvcnQge1xuICBzb3J0VGFicyxcbiAgcmVjZW5jeVNjb3JlLFxuICBoaWVyYXJjaHlTY29yZSxcbiAgcGlubmVkU2NvcmUsXG4gIGNvbXBhcmVCeVxufSBmcm9tIFwiLi4vYmFja2dyb3VuZC9zb3J0aW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgbWFwQ2hyb21lVGFiIH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuaW1wb3J0IHsgc2V0Q3VzdG9tU3RyYXRlZ2llcyB9IGZyb20gXCIuLi9iYWNrZ3JvdW5kL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgR3JvdXBpbmdTdHJhdGVneSwgUHJlZmVyZW5jZXMsIFNvcnRpbmdTdHJhdGVneSwgVGFiTWV0YWRhdGEsIFRhYkdyb3VwLCBDdXN0b21TdHJhdGVneSwgU3RyYXRlZ3lSdWxlLCBSdWxlQ29uZGl0aW9uLCBHcm91cGluZ1J1bGUsIFNvcnRpbmdSdWxlLCBMb2dFbnRyeSwgTG9nTGV2ZWwgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBTVFJBVEVHSUVTLCBTdHJhdGVneURlZmluaXRpb24sIGdldFN0cmF0ZWdpZXMgfSBmcm9tIFwiLi4vc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkuanNcIjtcbmltcG9ydCB7IGxvZ0luZm8gfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuXG4vLyBUeXBlc1xuaW50ZXJmYWNlIENvbHVtbkRlZmluaXRpb24ge1xuICAgIGtleTogc3RyaW5nO1xuICAgIGxhYmVsOiBzdHJpbmc7XG4gICAgdmlzaWJsZTogYm9vbGVhbjtcbiAgICB3aWR0aDogc3RyaW5nOyAvLyBDU1Mgd2lkdGhcbiAgICBmaWx0ZXJhYmxlOiBib29sZWFuO1xufVxuXG4vLyBTdGF0ZVxubGV0IGN1cnJlbnRUYWJzOiBjaHJvbWUudGFicy5UYWJbXSA9IFtdO1xubGV0IGxvY2FsQ3VzdG9tU3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSA9IFtdO1xubGV0IGN1cnJlbnRDb250ZXh0TWFwID0gbmV3IE1hcDxudW1iZXIsIENvbnRleHRSZXN1bHQ+KCk7XG5sZXQgdGFiVGl0bGVzID0gbmV3IE1hcDxudW1iZXIsIHN0cmluZz4oKTtcbmxldCBzb3J0S2V5OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbmxldCBzb3J0RGlyZWN0aW9uOiAnYXNjJyB8ICdkZXNjJyA9ICdhc2MnO1xubGV0IHNpbXVsYXRlZFNlbGVjdGlvbiA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXG4vLyBNb2Rlcm4gVGFibGUgU3RhdGVcbmxldCBnbG9iYWxTZWFyY2hRdWVyeSA9ICcnO1xubGV0IGNvbHVtbkZpbHRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbmxldCBjb2x1bW5zOiBDb2x1bW5EZWZpbml0aW9uW10gPSBbXG4gICAgeyBrZXk6ICdpZCcsIGxhYmVsOiAnSUQnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzYwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICdpbmRleCcsIGxhYmVsOiAnSW5kZXgnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzYwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICd3aW5kb3dJZCcsIGxhYmVsOiAnV2luZG93JywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICc3MHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnZ3JvdXBJZCcsIGxhYmVsOiAnR3JvdXAnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzcwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICd0aXRsZScsIGxhYmVsOiAnVGl0bGUnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzIwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAndXJsJywgbGFiZWw6ICdVUkwnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzI1MHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnZ2VucmUnLCBsYWJlbDogJ0dlbnJlJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ2NvbnRleHQnLCBsYWJlbDogJ0NhdGVnb3J5JywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ3NpdGVOYW1lJywgbGFiZWw6ICdTaXRlIE5hbWUnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEyMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAncGxhdGZvcm0nLCBsYWJlbDogJ1BsYXRmb3JtJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ29iamVjdFR5cGUnLCBsYWJlbDogJ09iamVjdCBUeXBlJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ2V4dHJhY3RlZFRpdGxlJywgbGFiZWw6ICdFeHRyYWN0ZWQgVGl0bGUnLCB2aXNpYmxlOiBmYWxzZSwgd2lkdGg6ICcyMDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ2F1dGhvck9yQ3JlYXRvcicsIGxhYmVsOiAnQXV0aG9yJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMjBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ3B1Ymxpc2hlZEF0JywgbGFiZWw6ICdQdWJsaXNoZWQnLCB2aXNpYmxlOiBmYWxzZSwgd2lkdGg6ICcxMDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ3N0YXR1cycsIGxhYmVsOiAnU3RhdHVzJywgdmlzaWJsZTogZmFsc2UsIHdpZHRoOiAnODBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ2FjdGl2ZScsIGxhYmVsOiAnQWN0aXZlJywgdmlzaWJsZTogZmFsc2UsIHdpZHRoOiAnNjBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ3Bpbm5lZCcsIGxhYmVsOiAnUGlubmVkJywgdmlzaWJsZTogZmFsc2UsIHdpZHRoOiAnNjBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ29wZW5lclRhYklkJywgbGFiZWw6ICdPcGVuZXInLCB2aXNpYmxlOiBmYWxzZSwgd2lkdGg6ICc3MHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAncGFyZW50VGl0bGUnLCBsYWJlbDogJ1BhcmVudCBUaXRsZScsIHZpc2libGU6IGZhbHNlLCB3aWR0aDogJzE1MHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnZ2VucmUnLCBsYWJlbDogJ0dlbnJlJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ2NvbnRleHQnLCBsYWJlbDogJ0V4dHJhY3RlZCBDb250ZXh0JywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICc0MDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ2xhc3RBY2Nlc3NlZCcsIGxhYmVsOiAnTGFzdCBBY2Nlc3NlZCcsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnMTUwcHgnLCBmaWx0ZXJhYmxlOiBmYWxzZSB9LFxuICAgIHsga2V5OiAnYWN0aW9ucycsIGxhYmVsOiAnQWN0aW9ucycsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnMTIwcHgnLCBmaWx0ZXJhYmxlOiBmYWxzZSB9XG5dO1xuXG5cbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHJlZnJlc2hCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncmVmcmVzaEJ0bicpO1xuICBpZiAocmVmcmVzaEJ0bikge1xuICAgIHJlZnJlc2hCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBsb2FkVGFicyk7XG4gIH1cblxuICAvLyBUYWIgU3dpdGNoaW5nIExvZ2ljXG4gIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy50YWItYnRuJykuZm9yRWFjaChidG4gPT4ge1xuICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgIC8vIFJlbW92ZSBhY3RpdmUgY2xhc3MgZnJvbSBhbGwgYnV0dG9ucyBhbmQgc2VjdGlvbnNcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy50YWItYnRuJykuZm9yRWFjaChiID0+IGIuY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJykpO1xuICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnZpZXctc2VjdGlvbicpLmZvckVhY2gocyA9PiBzLmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpKTtcblxuICAgICAgLy8gQWRkIGFjdGl2ZSBjbGFzcyB0byBjbGlja2VkIGJ1dHRvblxuICAgICAgYnRuLmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xuXG4gICAgICAvLyBTaG93IHRhcmdldCBzZWN0aW9uXG4gICAgICBjb25zdCB0YXJnZXRJZCA9IChidG4gYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQudGFyZ2V0O1xuICAgICAgaWYgKHRhcmdldElkKSB7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKHRhcmdldElkKT8uY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG4gICAgICAgIGxvZ0luZm8oXCJTd2l0Y2hlZCB2aWV3XCIsIHsgdGFyZ2V0SWQgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIElmIHN3aXRjaGluZyB0byBhbGdvcml0aG1zLCBwb3B1bGF0ZSByZWZlcmVuY2UgaWYgZW1wdHlcbiAgICAgIGlmICh0YXJnZXRJZCA9PT0gJ3ZpZXctYWxnb3JpdGhtcycpIHtcbiAgICAgICAgIHJlbmRlckFsZ29yaXRobXNWaWV3KCk7XG4gICAgICB9IGVsc2UgaWYgKHRhcmdldElkID09PSAndmlldy1zdHJhdGVneS1saXN0Jykge1xuICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMaXN0VGFibGUoKTtcbiAgICAgIH0gZWxzZSBpZiAodGFyZ2V0SWQgPT09ICd2aWV3LWxvZ3MnKSB7XG4gICAgICAgICBsb2FkTG9ncygpO1xuICAgICAgICAgbG9hZEdsb2JhbExvZ0xldmVsKCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pO1xuXG4gIC8vIExvZyBWaWV3ZXIgTG9naWNcbiAgY29uc3QgcmVmcmVzaExvZ3NCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncmVmcmVzaC1sb2dzLWJ0bicpO1xuICBpZiAocmVmcmVzaExvZ3NCdG4pIHJlZnJlc2hMb2dzQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgbG9hZExvZ3MpO1xuXG4gIGNvbnN0IGNsZWFyTG9nc0J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjbGVhci1sb2dzLWJ0bicpO1xuICBpZiAoY2xlYXJMb2dzQnRuKSBjbGVhckxvZ3NCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjbGVhclJlbW90ZUxvZ3MpO1xuXG4gIGNvbnN0IGxvZ0xldmVsRmlsdGVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvZy1sZXZlbC1maWx0ZXInKTtcbiAgaWYgKGxvZ0xldmVsRmlsdGVyKSBsb2dMZXZlbEZpbHRlci5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCByZW5kZXJMb2dzKTtcblxuICBjb25zdCBsb2dTZWFyY2ggPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9nLXNlYXJjaCcpO1xuICBpZiAobG9nU2VhcmNoKSBsb2dTZWFyY2guYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCByZW5kZXJMb2dzKTtcblxuICBjb25zdCBnbG9iYWxMb2dMZXZlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnbG9iYWwtbG9nLWxldmVsJyk7XG4gIGlmIChnbG9iYWxMb2dMZXZlbCkgZ2xvYmFsTG9nTGV2ZWwuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgdXBkYXRlR2xvYmFsTG9nTGV2ZWwpO1xuXG4gIC8vIFNpbXVsYXRpb24gTG9naWNcbiAgY29uc3QgcnVuU2ltQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3J1blNpbUJ0bicpO1xuICBpZiAocnVuU2ltQnRuKSB7XG4gICAgcnVuU2ltQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgcnVuU2ltdWxhdGlvbik7XG4gIH1cblxuICBjb25zdCBhcHBseUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhcHBseUJ0bicpO1xuICBpZiAoYXBwbHlCdG4pIHtcbiAgICBhcHBseUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGFwcGx5VG9Ccm93c2VyKTtcbiAgfVxuXG4gIC8vIE1vZGVybiBUYWJsZSBDb250cm9sc1xuICBjb25zdCBnbG9iYWxTZWFyY2hJbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnbG9iYWxTZWFyY2gnKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICBpZiAoZ2xvYmFsU2VhcmNoSW5wdXQpIHtcbiAgICAgIGdsb2JhbFNlYXJjaElucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgKGUpID0+IHtcbiAgICAgICAgICBnbG9iYWxTZWFyY2hRdWVyeSA9IChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICByZW5kZXJUYWJsZSgpO1xuICAgICAgfSk7XG4gIH1cblxuICBjb25zdCBjb2x1bW5zQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvbHVtbnNCdG4nKTtcbiAgaWYgKGNvbHVtbnNCdG4pIHtcbiAgICAgIGNvbHVtbnNCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgY29uc3QgbWVudSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjb2x1bW5zTWVudScpO1xuICAgICAgICAgIG1lbnU/LmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicpO1xuICAgICAgICAgIHJlbmRlckNvbHVtbnNNZW51KCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IHJlc2V0Vmlld0J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZXNldFZpZXdCdG4nKTtcbiAgaWYgKHJlc2V0Vmlld0J0bikge1xuICAgICAgcmVzZXRWaWV3QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgIC8vIFJlc2V0IGNvbHVtbnMgdG8gZGVmYXVsdHMgKHNpbXBsaWZpZWQsIGp1c3Qgc2hvdyBhbGwgcmVhc29uYWJsZSBvbmVzKVxuICAgICAgICAgICAgY29sdW1ucy5mb3JFYWNoKGMgPT4gYy52aXNpYmxlID0gWydpZCcsICd0aXRsZScsICd1cmwnLCAnd2luZG93SWQnLCAnZ3JvdXBJZCcsICdnZW5yZScsICdjb250ZXh0JywgJ3NpdGVOYW1lJywgJ3BsYXRmb3JtJywgJ29iamVjdFR5cGUnLCAnYXV0aG9yT3JDcmVhdG9yJywgJ2FjdGlvbnMnXS5pbmNsdWRlcyhjLmtleSkpO1xuICAgICAgICAgIGdsb2JhbFNlYXJjaFF1ZXJ5ID0gJyc7XG4gICAgICAgICAgaWYgKGdsb2JhbFNlYXJjaElucHV0KSBnbG9iYWxTZWFyY2hJbnB1dC52YWx1ZSA9ICcnO1xuICAgICAgICAgIGNvbHVtbkZpbHRlcnMgPSB7fTtcbiAgICAgICAgICByZW5kZXJUYWJsZUhlYWRlcigpO1xuICAgICAgICAgIHJlbmRlclRhYmxlKCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIEhpZGUgY29sdW1uIG1lbnUgd2hlbiBjbGlja2luZyBvdXRzaWRlXG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgaWYgKCF0YXJnZXQuY2xvc2VzdCgnLmNvbHVtbnMtbWVudS1jb250YWluZXInKSkge1xuICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjb2x1bW5zTWVudScpPy5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcbiAgICAgIH1cbiAgfSk7XG5cblxuICAvLyBMaXN0ZW4gZm9yIHRhYiB1cGRhdGVzIHRvIHJlZnJlc2ggZGF0YSAoU1BBIHN1cHBvcnQpXG4gIGNocm9tZS50YWJzLm9uVXBkYXRlZC5hZGRMaXN0ZW5lcigodGFiSWQsIGNoYW5nZUluZm8sIHRhYikgPT4ge1xuICAgIC8vIFdlIHVwZGF0ZSBpZiBVUkwgY2hhbmdlcyBvciBzdGF0dXMgY2hhbmdlcyB0byBjb21wbGV0ZVxuICAgIGlmIChjaGFuZ2VJbmZvLnVybCB8fCBjaGFuZ2VJbmZvLnN0YXR1cyA9PT0gJ2NvbXBsZXRlJykge1xuICAgICAgICBsb2FkVGFicygpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gTGlzdGVuIGZvciB0YWIgcmVtb3ZhbHMgdG8gcmVmcmVzaCBkYXRhXG4gIGNocm9tZS50YWJzLm9uUmVtb3ZlZC5hZGRMaXN0ZW5lcigoKSA9PiB7XG4gICAgbG9hZFRhYnMoKTtcbiAgfSk7XG5cbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZXZlbnQpID0+IHtcbiAgICBjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgIGlmICghdGFyZ2V0KSByZXR1cm47XG5cbiAgICBpZiAodGFyZ2V0Lm1hdGNoZXMoJy5jb250ZXh0LWpzb24tYnRuJykpIHtcbiAgICAgIGNvbnN0IHRhYklkID0gTnVtYmVyKHRhcmdldC5kYXRhc2V0LnRhYklkKTtcbiAgICAgIGlmICghdGFiSWQpIHJldHVybjtcbiAgICAgIGNvbnN0IGRhdGEgPSBjdXJyZW50Q29udGV4dE1hcC5nZXQodGFiSWQpPy5kYXRhO1xuICAgICAgaWYgKCFkYXRhKSByZXR1cm47XG4gICAgICBjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkoZGF0YSwgbnVsbCwgMik7XG4gICAgICBjb25zdCBodG1sQ29udGVudCA9IGBcbiAgICAgICAgPCFET0NUWVBFIGh0bWw+XG4gICAgICAgIDxodG1sPlxuICAgICAgICA8aGVhZD5cbiAgICAgICAgICA8dGl0bGU+SlNPTiBWaWV3PC90aXRsZT5cbiAgICAgICAgICA8c3R5bGU+XG4gICAgICAgICAgICBib2R5IHsgZm9udC1mYW1pbHk6IG1vbm9zcGFjZTsgYmFja2dyb3VuZC1jb2xvcjogI2YwZjBmMDsgcGFkZGluZzogMjBweDsgfVxuICAgICAgICAgICAgcHJlIHsgYmFja2dyb3VuZC1jb2xvcjogd2hpdGU7IHBhZGRpbmc6IDE1cHg7IGJvcmRlci1yYWRpdXM6IDVweDsgYm9yZGVyOiAxcHggc29saWQgI2NjYzsgb3ZlcmZsb3c6IGF1dG87IH1cbiAgICAgICAgICA8L3N0eWxlPlxuICAgICAgICA8L2hlYWQ+XG4gICAgICAgIDxib2R5PlxuICAgICAgICAgIDxoMz5KU09OIERhdGE8L2gzPlxuICAgICAgICAgIDxwcmU+JHtlc2NhcGVIdG1sKGpzb24pfTwvcHJlPlxuICAgICAgICA8L2JvZHk+XG4gICAgICAgIDwvaHRtbD5cbiAgICAgIGA7XG4gICAgICBjb25zdCBibG9iID0gbmV3IEJsb2IoW2h0bWxDb250ZW50XSwgeyB0eXBlOiAndGV4dC9odG1sJyB9KTtcbiAgICAgIGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICB3aW5kb3cub3Blbih1cmwsICdfYmxhbmsnLCAnbm9vcGVuZXIsbm9yZWZlcnJlcicpO1xuICAgIH0gZWxzZSBpZiAodGFyZ2V0Lm1hdGNoZXMoJy5nb3RvLXRhYi1idG4nKSkge1xuICAgICAgY29uc3QgdGFiSWQgPSBOdW1iZXIodGFyZ2V0LmRhdGFzZXQudGFiSWQpO1xuICAgICAgY29uc3Qgd2luZG93SWQgPSBOdW1iZXIodGFyZ2V0LmRhdGFzZXQud2luZG93SWQpO1xuICAgICAgaWYgKHRhYklkICYmIHdpbmRvd0lkKSB7XG4gICAgICAgIGNocm9tZS50YWJzLnVwZGF0ZSh0YWJJZCwgeyBhY3RpdmU6IHRydWUgfSk7XG4gICAgICAgIGNocm9tZS53aW5kb3dzLnVwZGF0ZSh3aW5kb3dJZCwgeyBmb2N1c2VkOiB0cnVlIH0pO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodGFyZ2V0Lm1hdGNoZXMoJy5jbG9zZS10YWItYnRuJykpIHtcbiAgICAgIGNvbnN0IHRhYklkID0gTnVtYmVyKHRhcmdldC5kYXRhc2V0LnRhYklkKTtcbiAgICAgIGlmICh0YWJJZCkge1xuICAgICAgICBjaHJvbWUudGFicy5yZW1vdmUodGFiSWQpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodGFyZ2V0Lm1hdGNoZXMoJy5zdHJhdGVneS12aWV3LWJ0bicpKSB7XG4gICAgICAgIGNvbnN0IHR5cGUgPSB0YXJnZXQuZGF0YXNldC50eXBlO1xuICAgICAgICBjb25zdCBuYW1lID0gdGFyZ2V0LmRhdGFzZXQubmFtZTtcbiAgICAgICAgaWYgKHR5cGUgJiYgbmFtZSkge1xuICAgICAgICAgICAgc2hvd1N0cmF0ZWd5RGV0YWlscyh0eXBlLCBuYW1lKTtcbiAgICAgICAgfVxuICAgIH1cbiAgfSk7XG5cbiAgLy8gSW5pdCB0YWJsZSBoZWFkZXJcbiAgcmVuZGVyVGFibGVIZWFkZXIoKTtcblxuICBsb2FkVGFicygpO1xuICAvLyBQcmUtcmVuZGVyIHN0YXRpYyBjb250ZW50XG4gIGF3YWl0IGxvYWRQcmVmZXJlbmNlc0FuZEluaXQoKTsgLy8gTG9hZCBwcmVmZXJlbmNlcyBmaXJzdCB0byBpbml0IHN0cmF0ZWdpZXNcbiAgcmVuZGVyQWxnb3JpdGhtc1ZpZXcoKTtcbiAgbG9hZEN1c3RvbUdlbmVyYSgpO1xuICBpbml0U3RyYXRlZ3lCdWlsZGVyKCk7XG5cbiAgY29uc3QgZXhwb3J0QWxsQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0ZWd5LWxpc3QtZXhwb3J0LWJ0bicpO1xuICBjb25zdCBpbXBvcnRBbGxCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXRlZ3ktbGlzdC1pbXBvcnQtYnRuJyk7XG4gIGlmIChleHBvcnRBbGxCdG4pIGV4cG9ydEFsbEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGV4cG9ydEFsbFN0cmF0ZWdpZXMpO1xuICBpZiAoaW1wb3J0QWxsQnRuKSBpbXBvcnRBbGxCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBpbXBvcnRBbGxTdHJhdGVnaWVzKTtcbn0pO1xuXG4vLyBDb2x1bW4gTWFuYWdlbWVudFxuXG5mdW5jdGlvbiByZW5kZXJDb2x1bW5zTWVudSgpIHtcbiAgICBjb25zdCBtZW51ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvbHVtbnNNZW51Jyk7XG4gICAgaWYgKCFtZW51KSByZXR1cm47XG5cbiAgICBtZW51LmlubmVySFRNTCA9IGNvbHVtbnMubWFwKGNvbCA9PiBgXG4gICAgICAgIDxsYWJlbCBjbGFzcz1cImNvbHVtbi10b2dnbGVcIj5cbiAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBkYXRhLWtleT1cIiR7Y29sLmtleX1cIiAke2NvbC52aXNpYmxlID8gJ2NoZWNrZWQnIDogJyd9PlxuICAgICAgICAgICAgJHtlc2NhcGVIdG1sKGNvbC5sYWJlbCl9XG4gICAgICAgIDwvbGFiZWw+XG4gICAgYCkuam9pbignJyk7XG5cbiAgICBtZW51LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0JykuZm9yRWFjaChpbnB1dCA9PiB7XG4gICAgICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkuZGF0YXNldC5rZXk7XG4gICAgICAgICAgICBjb25zdCBjaGVja2VkID0gKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQ7XG4gICAgICAgICAgICBjb25zdCBjb2wgPSBjb2x1bW5zLmZpbmQoYyA9PiBjLmtleSA9PT0ga2V5KTtcbiAgICAgICAgICAgIGlmIChjb2wpIHtcbiAgICAgICAgICAgICAgICBjb2wudmlzaWJsZSA9IGNoZWNrZWQ7XG4gICAgICAgICAgICAgICAgcmVuZGVyVGFibGVIZWFkZXIoKTsgLy8gUmUtcmVuZGVyIGhlYWRlciB0byBhZGQvcmVtb3ZlIGNvbHVtbnNcbiAgICAgICAgICAgICAgICByZW5kZXJUYWJsZSgpOyAvLyBSZS1yZW5kZXIgYm9keVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyVGFibGVIZWFkZXIoKSB7XG4gICAgY29uc3QgaGVhZGVyUm93ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2hlYWRlclJvdycpO1xuICAgIGNvbnN0IGZpbHRlclJvdyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmaWx0ZXJSb3cnKTtcbiAgICBpZiAoIWhlYWRlclJvdyB8fCAhZmlsdGVyUm93KSByZXR1cm47XG5cbiAgICBjb25zdCB2aXNpYmxlQ29scyA9IGNvbHVtbnMuZmlsdGVyKGMgPT4gYy52aXNpYmxlKTtcblxuICAgIC8vIFJlbmRlciBIZWFkZXJzXG4gICAgaGVhZGVyUm93LmlubmVySFRNTCA9IHZpc2libGVDb2xzLm1hcChjb2wgPT4gYFxuICAgICAgICA8dGggY2xhc3M9XCIke2NvbC5rZXkgIT09ICdhY3Rpb25zJyA/ICdzb3J0YWJsZScgOiAnJ31cIiBkYXRhLWtleT1cIiR7Y29sLmtleX1cIiBzdHlsZT1cIndpZHRoOiAke2NvbC53aWR0aH07IHBvc2l0aW9uOiByZWxhdGl2ZTtcIj5cbiAgICAgICAgICAgICR7ZXNjYXBlSHRtbChjb2wubGFiZWwpfVxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJlc2l6ZXJcIj48L2Rpdj5cbiAgICAgICAgPC90aD5cbiAgICBgKS5qb2luKCcnKTtcblxuICAgIC8vIFJlbmRlciBGaWx0ZXIgSW5wdXRzXG4gICAgZmlsdGVyUm93LmlubmVySFRNTCA9IHZpc2libGVDb2xzLm1hcChjb2wgPT4ge1xuICAgICAgICBpZiAoIWNvbC5maWx0ZXJhYmxlKSByZXR1cm4gJzx0aD48L3RoPic7XG4gICAgICAgIGNvbnN0IHZhbCA9IGNvbHVtbkZpbHRlcnNbY29sLmtleV0gfHwgJyc7XG4gICAgICAgIHJldHVybiBgXG4gICAgICAgICAgICA8dGg+XG4gICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJmaWx0ZXItaW5wdXRcIiBkYXRhLWtleT1cIiR7Y29sLmtleX1cIiB2YWx1ZT1cIiR7ZXNjYXBlSHRtbCh2YWwpfVwiIHBsYWNlaG9sZGVyPVwiRmlsdGVyLi4uXCI+XG4gICAgICAgICAgICA8L3RoPlxuICAgICAgICBgO1xuICAgIH0pLmpvaW4oJycpO1xuXG4gICAgLy8gQXR0YWNoIFNvcnQgTGlzdGVuZXJzXG4gICAgaGVhZGVyUm93LnF1ZXJ5U2VsZWN0b3JBbGwoJy5zb3J0YWJsZScpLmZvckVhY2godGggPT4ge1xuICAgICAgICB0aC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgICAgICAvLyBJZ25vcmUgaWYgY2xpY2tlZCBvbiByZXNpemVyXG4gICAgICAgICAgICBpZiAoKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbGFzc0xpc3QuY29udGFpbnMoJ3Jlc2l6ZXInKSkgcmV0dXJuO1xuXG4gICAgICAgICAgICBjb25zdCBrZXkgPSB0aC5nZXRBdHRyaWJ1dGUoJ2RhdGEta2V5Jyk7XG4gICAgICAgICAgICBpZiAoa2V5KSBoYW5kbGVTb3J0KGtleSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgLy8gQXR0YWNoIEZpbHRlciBMaXN0ZW5lcnNcbiAgICBmaWx0ZXJSb3cucXVlcnlTZWxlY3RvckFsbCgnLmZpbHRlci1pbnB1dCcpLmZvckVhY2goaW5wdXQgPT4ge1xuICAgICAgICBpbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSAoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQua2V5O1xuICAgICAgICAgICAgY29uc3QgdmFsID0gKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgaWYgKGtleSkge1xuICAgICAgICAgICAgICAgIGNvbHVtbkZpbHRlcnNba2V5XSA9IHZhbDtcbiAgICAgICAgICAgICAgICByZW5kZXJUYWJsZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIEF0dGFjaCBSZXNpemUgTGlzdGVuZXJzXG4gICAgaGVhZGVyUm93LnF1ZXJ5U2VsZWN0b3JBbGwoJy5yZXNpemVyJykuZm9yRWFjaChyZXNpemVyID0+IHtcbiAgICAgICAgaW5pdFJlc2l6ZShyZXNpemVyIGFzIEhUTUxFbGVtZW50KTtcbiAgICB9KTtcblxuICAgIHVwZGF0ZUhlYWRlclN0eWxlcygpO1xufVxuXG5mdW5jdGlvbiBpbml0UmVzaXplKHJlc2l6ZXI6IEhUTUxFbGVtZW50KSB7XG4gICAgbGV0IHggPSAwO1xuICAgIGxldCB3ID0gMDtcbiAgICBsZXQgdGg6IEhUTUxFbGVtZW50O1xuXG4gICAgY29uc3QgbW91c2VEb3duSGFuZGxlciA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgIHRoID0gcmVzaXplci5wYXJlbnRFbGVtZW50IGFzIEhUTUxFbGVtZW50O1xuICAgICAgICB4ID0gZS5jbGllbnRYO1xuICAgICAgICB3ID0gdGgub2Zmc2V0V2lkdGg7XG5cbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgbW91c2VNb3ZlSGFuZGxlcik7XG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCBtb3VzZVVwSGFuZGxlcik7XG4gICAgICAgIHJlc2l6ZXIuY2xhc3NMaXN0LmFkZCgncmVzaXppbmcnKTtcbiAgICB9O1xuXG4gICAgY29uc3QgbW91c2VNb3ZlSGFuZGxlciA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgIGNvbnN0IGR4ID0gZS5jbGllbnRYIC0geDtcbiAgICAgICAgY29uc3QgY29sS2V5ID0gdGguZ2V0QXR0cmlidXRlKCdkYXRhLWtleScpO1xuICAgICAgICBjb25zdCBjb2wgPSBjb2x1bW5zLmZpbmQoYyA9PiBjLmtleSA9PT0gY29sS2V5KTtcbiAgICAgICAgaWYgKGNvbCkge1xuICAgICAgICAgICAgY29uc3QgbmV3V2lkdGggPSBNYXRoLm1heCgzMCwgdyArIGR4KTsgLy8gTWluIHdpZHRoIDMwcHhcbiAgICAgICAgICAgIGNvbC53aWR0aCA9IGAke25ld1dpZHRofXB4YDtcbiAgICAgICAgICAgIHRoLnN0eWxlLndpZHRoID0gY29sLndpZHRoO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGNvbnN0IG1vdXNlVXBIYW5kbGVyID0gKCkgPT4ge1xuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCBtb3VzZU1vdmVIYW5kbGVyKTtcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIG1vdXNlVXBIYW5kbGVyKTtcbiAgICAgICAgcmVzaXplci5jbGFzc0xpc3QucmVtb3ZlKCdyZXNpemluZycpO1xuICAgIH07XG5cbiAgICByZXNpemVyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIG1vdXNlRG93bkhhbmRsZXIpO1xufVxuXG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRQcmVmZXJlbmNlc0FuZEluaXQoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2FkUHJlZmVyZW5jZXMnIH0pO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgICAgICAgY29uc3QgcHJlZnMgPSByZXNwb25zZS5kYXRhIGFzIFByZWZlcmVuY2VzO1xuICAgICAgICAgICAgbG9jYWxDdXN0b21TdHJhdGVnaWVzID0gcHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXTtcbiAgICAgICAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMobG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TG9hZE9wdGlvbnMoKTtcbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TGlzdFRhYmxlKCk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBwcmVmZXJlbmNlc1wiLCBlKTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRDdXN0b21HZW5lcmEoKSB7XG4gICAgY29uc3QgbGlzdENvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjdXN0b20tZ2VuZXJhLWxpc3QnKTtcbiAgICBpZiAoIWxpc3RDb250YWluZXIpIHJldHVybjtcblxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9hZFByZWZlcmVuY2VzJyB9KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgIGNvbnN0IHByZWZzID0gcmVzcG9uc2UuZGF0YSBhcyBQcmVmZXJlbmNlcztcbiAgICAgICAgICAgIHJlbmRlckN1c3RvbUdlbmVyYUxpc3QocHJlZnMuY3VzdG9tR2VuZXJhIHx8IHt9KTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIGN1c3RvbSBnZW5lcmFcIiwgZSk7XG4gICAgfVxufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tIFNUUkFURUdZIEJVSUxERVIgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBnZXRCdWlsdEluU3RyYXRlZ3lDb25maWcoaWQ6IHN0cmluZyk6IEN1c3RvbVN0cmF0ZWd5IHwgbnVsbCB7XG4gICAgY29uc3QgYmFzZTogQ3VzdG9tU3RyYXRlZ3kgPSB7XG4gICAgICAgIGlkOiBpZCxcbiAgICAgICAgbGFiZWw6IFNUUkFURUdJRVMuZmluZChzID0+IHMuaWQgPT09IGlkKT8ubGFiZWwgfHwgaWQsXG4gICAgICAgIGZpbHRlcnM6IFtdLFxuICAgICAgICBncm91cGluZ1J1bGVzOiBbXSxcbiAgICAgICAgc29ydGluZ1J1bGVzOiBbXSxcbiAgICAgICAgZ3JvdXBTb3J0aW5nUnVsZXM6IFtdLFxuICAgICAgICBmYWxsYmFjazogJ01pc2MnLFxuICAgICAgICBzb3J0R3JvdXBzOiBmYWxzZSxcbiAgICAgICAgYXV0b1J1bjogZmFsc2VcbiAgICB9O1xuXG4gICAgc3dpdGNoIChpZCkge1xuICAgICAgICBjYXNlICdkb21haW4nOlxuICAgICAgICAgICAgYmFzZS5ncm91cGluZ1J1bGVzID0gW3sgc291cmNlOiAnZmllbGQnLCB2YWx1ZTogJ2RvbWFpbicsIHRyYW5zZm9ybTogJ3N0cmlwVGxkJywgY29sb3I6ICdyYW5kb20nIH1dO1xuICAgICAgICAgICAgYmFzZS5zb3J0aW5nUnVsZXMgPSBbeyBmaWVsZDogJ2RvbWFpbicsIG9yZGVyOiAnYXNjJyB9XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdkb21haW5fZnVsbCc6XG4gICAgICAgICAgICAgYmFzZS5ncm91cGluZ1J1bGVzID0gW3sgc291cmNlOiAnZmllbGQnLCB2YWx1ZTogJ2RvbWFpbicsIHRyYW5zZm9ybTogJ25vbmUnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICAgYmFzZS5zb3J0aW5nUnVsZXMgPSBbeyBmaWVsZDogJ2RvbWFpbicsIG9yZGVyOiAnYXNjJyB9XTtcbiAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndG9waWMnOlxuICAgICAgICAgICAgYmFzZS5ncm91cGluZ1J1bGVzID0gW3sgc291cmNlOiAnZmllbGQnLCB2YWx1ZTogJ2dlbnJlJywgY29sb3I6ICdyYW5kb20nIH1dO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NvbnRleHQnOlxuICAgICAgICAgICAgYmFzZS5ncm91cGluZ1J1bGVzID0gW3sgc291cmNlOiAnZmllbGQnLCB2YWx1ZTogJ2NvbnRleHQnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnbGluZWFnZSc6XG4gICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAncGFyZW50VGl0bGUnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAncGlubmVkJzpcbiAgICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAncGlubmVkJywgb3JkZXI6ICdkZXNjJyB9XTtcbiAgICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAncGlubmVkJywgY29sb3I6ICdyYW5kb20nIH1dO1xuICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdyZWNlbmN5JzpcbiAgICAgICAgICAgIGJhc2Uuc29ydGluZ1J1bGVzID0gW3sgZmllbGQ6ICdsYXN0QWNjZXNzZWQnLCBvcmRlcjogJ2Rlc2MnIH1dO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2FnZSc6XG4gICAgICAgICAgICAgYmFzZS5zb3J0aW5nUnVsZXMgPSBbeyBmaWVsZDogJ2xhc3RBY2Nlc3NlZCcsIG9yZGVyOiAnZGVzYycgfV07XG4gICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3VybCc6XG4gICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAndXJsJywgb3JkZXI6ICdhc2MnIH1dO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3RpdGxlJzpcbiAgICAgICAgICAgIGJhc2Uuc29ydGluZ1J1bGVzID0gW3sgZmllbGQ6ICd0aXRsZScsIG9yZGVyOiAnYXNjJyB9XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICduZXN0aW5nJzpcbiAgICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAncGFyZW50VGl0bGUnLCBvcmRlcjogJ2FzYycgfV07XG4gICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgcmV0dXJuIGJhc2U7XG59XG5cbmNvbnN0IEZJRUxEX09QVElPTlMgPSBgXG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInVybFwiPlVSTDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJ0aXRsZVwiPlRpdGxlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImRvbWFpblwiPkRvbWFpbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzdWJkb21haW5cIj5TdWJkb21haW48L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiaWRcIj5JRDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJpbmRleFwiPkluZGV4PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIndpbmRvd0lkXCI+V2luZG93IElEPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImdyb3VwSWRcIj5Hcm91cCBJRDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJhY3RpdmVcIj5BY3RpdmU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwic2VsZWN0ZWRcIj5TZWxlY3RlZDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJwaW5uZWRcIj5QaW5uZWQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwic3RhdHVzXCI+U3RhdHVzPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIm9wZW5lclRhYklkXCI+T3BlbmVyIElEPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInBhcmVudFRpdGxlXCI+UGFyZW50IFRpdGxlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImxhc3RBY2Nlc3NlZFwiPkxhc3QgQWNjZXNzZWQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZ2VucmVcIj5HZW5yZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0XCI+Q29udGV4dCBTdW1tYXJ5PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLnNpdGVOYW1lXCI+U2l0ZSBOYW1lPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLmNhbm9uaWNhbFVybFwiPkNhbm9uaWNhbCBVUkw8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEubm9ybWFsaXplZFVybFwiPk5vcm1hbGl6ZWQgVVJMPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLnBsYXRmb3JtXCI+UGxhdGZvcm08L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEub2JqZWN0VHlwZVwiPk9iamVjdCBUeXBlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLm9iamVjdElkXCI+T2JqZWN0IElEPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLnRpdGxlXCI+RXh0cmFjdGVkIFRpdGxlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLmRlc2NyaXB0aW9uXCI+RGVzY3JpcHRpb248L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuYXV0aG9yT3JDcmVhdG9yXCI+QXV0aG9yL0NyZWF0b3I8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEucHVibGlzaGVkQXRcIj5QdWJsaXNoZWQgQXQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEubW9kaWZpZWRBdFwiPk1vZGlmaWVkIEF0PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLmxhbmd1YWdlXCI+TGFuZ3VhZ2U8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuaXNBdWRpYmxlXCI+SXMgQXVkaWJsZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5pc011dGVkXCI+SXMgTXV0ZWQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuaGFzVW5zYXZlZENoYW5nZXNMaWtlbHlcIj5VbnNhdmVkIENoYW5nZXM8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuaXNBdXRoZW50aWNhdGVkTGlrZWx5XCI+QXV0aGVudGljYXRlZDwvb3B0aW9uPmA7XG5cbmNvbnN0IE9QRVJBVE9SX09QVElPTlMgPSBgXG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRhaW5zXCI+Y29udGFpbnM8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZG9lc05vdENvbnRhaW5cIj5kb2VzIG5vdCBjb250YWluPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIm1hdGNoZXNcIj5tYXRjaGVzIHJlZ2V4PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImVxdWFsc1wiPmVxdWFsczwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzdGFydHNXaXRoXCI+c3RhcnRzIHdpdGg8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZW5kc1dpdGhcIj5lbmRzIHdpdGg8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZXhpc3RzXCI+ZXhpc3RzPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImRvZXNOb3RFeGlzdFwiPmRvZXMgbm90IGV4aXN0PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImlzTnVsbFwiPmlzIG51bGw8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiaXNOb3ROdWxsXCI+aXMgbm90IG51bGw8L29wdGlvbj5gO1xuXG5mdW5jdGlvbiBpbml0U3RyYXRlZ3lCdWlsZGVyKCkge1xuICAgIGNvbnN0IGFkZEZpbHRlckdyb3VwQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FkZC1maWx0ZXItZ3JvdXAtYnRuJyk7XG4gICAgY29uc3QgYWRkR3JvdXBCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWRkLWdyb3VwLWJ0bicpO1xuICAgIGNvbnN0IGFkZFNvcnRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWRkLXNvcnQtYnRuJyk7XG4gICAgY29uc3QgbG9hZFNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdGVneS1sb2FkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50IHwgbnVsbDtcblxuICAgIC8vIE5ldzogR3JvdXAgU29ydGluZ1xuICAgIGNvbnN0IGFkZEdyb3VwU29ydEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhZGQtZ3JvdXAtc29ydC1idG4nKTtcbiAgICBjb25zdCBncm91cFNvcnRDaGVjayA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1zb3J0Z3JvdXBzLWNoZWNrJyk7XG5cbiAgICBjb25zdCBzYXZlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1aWxkZXItc2F2ZS1idG4nKTtcbiAgICBjb25zdCBydW5CdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1ydW4tYnRuJyk7XG4gICAgY29uc3QgcnVuTGl2ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidWlsZGVyLXJ1bi1saXZlLWJ0bicpO1xuICAgIGNvbnN0IGNsZWFyQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1aWxkZXItY2xlYXItYnRuJyk7XG5cbiAgICBjb25zdCBleHBvcnRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1leHBvcnQtYnRuJyk7XG4gICAgY29uc3QgaW1wb3J0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1aWxkZXItaW1wb3J0LWJ0bicpO1xuXG4gICAgaWYgKGV4cG9ydEJ0bikgZXhwb3J0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZXhwb3J0QnVpbGRlclN0cmF0ZWd5KTtcbiAgICBpZiAoaW1wb3J0QnRuKSBpbXBvcnRCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBpbXBvcnRCdWlsZGVyU3RyYXRlZ3kpO1xuXG4gICAgaWYgKGFkZEZpbHRlckdyb3VwQnRuKSBhZGRGaWx0ZXJHcm91cEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGFkZEZpbHRlckdyb3VwUm93KCkpO1xuICAgIGlmIChhZGRHcm91cEJ0bikgYWRkR3JvdXBCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBhZGRCdWlsZGVyUm93KCdncm91cCcpKTtcbiAgICBpZiAoYWRkU29ydEJ0bikgYWRkU29ydEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGFkZEJ1aWxkZXJSb3coJ3NvcnQnKSk7XG4gICAgaWYgKGFkZEdyb3VwU29ydEJ0bikgYWRkR3JvdXBTb3J0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gYWRkQnVpbGRlclJvdygnZ3JvdXBTb3J0JykpO1xuXG4gICAgaWYgKGdyb3VwU29ydENoZWNrKSB7XG4gICAgICAgIGdyb3VwU29ydENoZWNrLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjaGVja2VkID0gKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQ7XG4gICAgICAgICAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JvdXAtc29ydC1yb3dzLWNvbnRhaW5lcicpO1xuICAgICAgICAgICAgY29uc3QgYWRkQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FkZC1ncm91cC1zb3J0LWJ0bicpO1xuICAgICAgICAgICAgaWYgKGNvbnRhaW5lciAmJiBhZGRCdG4pIHtcbiAgICAgICAgICAgICAgICBjb250YWluZXIuc3R5bGUuZGlzcGxheSA9IGNoZWNrZWQgPyAnYmxvY2snIDogJ25vbmUnO1xuICAgICAgICAgICAgICAgIGFkZEJ0bi5zdHlsZS5kaXNwbGF5ID0gY2hlY2tlZCA/ICdibG9jaycgOiAnbm9uZSc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmIChzYXZlQnRuKSBzYXZlQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gc2F2ZUN1c3RvbVN0cmF0ZWd5RnJvbUJ1aWxkZXIodHJ1ZSkpO1xuICAgIGlmIChydW5CdG4pIHJ1bkJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHJ1bkJ1aWxkZXJTaW11bGF0aW9uKTtcbiAgICBpZiAocnVuTGl2ZUJ0bikgcnVuTGl2ZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHJ1bkJ1aWxkZXJMaXZlKTtcbiAgICBpZiAoY2xlYXJCdG4pIGNsZWFyQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY2xlYXJCdWlsZGVyKTtcblxuICAgIGlmIChsb2FkU2VsZWN0KSB7XG4gICAgICAgIGxvYWRTZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKCkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWRJZCA9IGxvYWRTZWxlY3QudmFsdWU7XG4gICAgICAgICAgICBpZiAoIXNlbGVjdGVkSWQpIHJldHVybjtcblxuICAgICAgICAgICAgbGV0IHN0cmF0ID0gbG9jYWxDdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzZWxlY3RlZElkKTtcbiAgICAgICAgICAgIGlmICghc3RyYXQpIHtcbiAgICAgICAgICAgICAgICBzdHJhdCA9IGdldEJ1aWx0SW5TdHJhdGVneUNvbmZpZyhzZWxlY3RlZElkKSB8fCB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdHJhdCkge1xuICAgICAgICAgICAgICAgIHBvcHVsYXRlQnVpbGRlckZyb21TdHJhdGVneShzdHJhdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIEluaXRpYWwgTGl2ZSBWaWV3XG4gICAgcmVuZGVyTGl2ZVZpZXcoKTtcbiAgICBjb25zdCByZWZyZXNoTGl2ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZWZyZXNoLWxpdmUtdmlldy1idG4nKTtcbiAgICBpZiAocmVmcmVzaExpdmVCdG4pIHJlZnJlc2hMaXZlQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgcmVuZGVyTGl2ZVZpZXcpO1xuXG4gICAgY29uc3QgbGl2ZUNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsaXZlLXZpZXctY29udGFpbmVyJyk7XG4gICAgaWYgKGxpdmVDb250YWluZXIpIHtcbiAgICAgICAgbGl2ZUNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSB0YXJnZXQuY2xvc2VzdCgnLnNlbGVjdGFibGUtaXRlbScpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICAgICAgaWYgKCFpdGVtKSByZXR1cm47XG5cbiAgICAgICAgICAgIGNvbnN0IHR5cGUgPSBpdGVtLmRhdGFzZXQudHlwZTtcbiAgICAgICAgICAgIGNvbnN0IGlkID0gTnVtYmVyKGl0ZW0uZGF0YXNldC5pZCk7XG4gICAgICAgICAgICBpZiAoIXR5cGUgfHwgaXNOYU4oaWQpKSByZXR1cm47XG5cbiAgICAgICAgICAgIGlmICh0eXBlID09PSAndGFiJykge1xuICAgICAgICAgICAgICAgIGlmIChzaW11bGF0ZWRTZWxlY3Rpb24uaGFzKGlkKSkgc2ltdWxhdGVkU2VsZWN0aW9uLmRlbGV0ZShpZCk7XG4gICAgICAgICAgICAgICAgZWxzZSBzaW11bGF0ZWRTZWxlY3Rpb24uYWRkKGlkKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ2dyb3VwJykge1xuICAgICAgICAgICAgICAgIC8vIFRvZ2dsZSBhbGwgdGFicyBpbiBncm91cFxuICAgICAgICAgICAgICAgIC8vIFdlIG5lZWQgdG8ga25vdyB3aGljaCB0YWJzIGFyZSBpbiB0aGUgZ3JvdXAuXG4gICAgICAgICAgICAgICAgLy8gV2UgY2FuIGZpbmQgdGhlbSBpbiBET00gb3IgcmVmZXRjaC4gRE9NIGlzIGVhc2llci5cbiAgICAgICAgICAgICAgICAvLyBPciBiZXR0ZXIsIGxvZ2ljIGluIHJlbmRlckxpdmVWaWV3IGhhbmRsZXMgcmVuZGVyaW5nLCBoZXJlIHdlIGhhbmRsZSBkYXRhLlxuICAgICAgICAgICAgICAgIC8vIExldCdzIHJlbHkgb24gRE9NIHN0cnVjdHVyZSBvciByZS1xdWVyeS5cbiAgICAgICAgICAgICAgICAvLyBSZS1xdWVyeWluZyBpcyByb2J1c3QuXG4gICAgICAgICAgICAgICAgY2hyb21lLnRhYnMucXVlcnkoe30pLnRoZW4odGFicyA9PiB7XG4gICAgICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBUYWJzID0gdGFicy5maWx0ZXIodCA9PiB0Lmdyb3VwSWQgPT09IGlkKTtcbiAgICAgICAgICAgICAgICAgICBjb25zdCBhbGxTZWxlY3RlZCA9IGdyb3VwVGFicy5ldmVyeSh0ID0+IHQuaWQgJiYgc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKSk7XG4gICAgICAgICAgICAgICAgICAgZ3JvdXBUYWJzLmZvckVhY2godCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgIGlmICh0LmlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYWxsU2VsZWN0ZWQpIHNpbXVsYXRlZFNlbGVjdGlvbi5kZWxldGUodC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlIHNpbXVsYXRlZFNlbGVjdGlvbi5hZGQodC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICByZW5kZXJMaXZlVmlldygpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybjsgLy8gYXN5bmMgdXBkYXRlXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICd3aW5kb3cnKSB7XG4gICAgICAgICAgICAgICAgY2hyb21lLnRhYnMucXVlcnkoe30pLnRoZW4odGFicyA9PiB7XG4gICAgICAgICAgICAgICAgICAgY29uc3Qgd2luVGFicyA9IHRhYnMuZmlsdGVyKHQgPT4gdC53aW5kb3dJZCA9PT0gaWQpO1xuICAgICAgICAgICAgICAgICAgIGNvbnN0IGFsbFNlbGVjdGVkID0gd2luVGFicy5ldmVyeSh0ID0+IHQuaWQgJiYgc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKSk7XG4gICAgICAgICAgICAgICAgICAgd2luVGFicy5mb3JFYWNoKHQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICBpZiAodC5pZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFsbFNlbGVjdGVkKSBzaW11bGF0ZWRTZWxlY3Rpb24uZGVsZXRlKHQuaWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBzaW11bGF0ZWRTZWxlY3Rpb24uYWRkKHQuaWQpO1xuICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgcmVuZGVyTGl2ZVZpZXcoKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm47IC8vIGFzeW5jIHVwZGF0ZVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZW5kZXJMaXZlVmlldygpO1xuICAgICAgICB9KTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFkZEZpbHRlckdyb3VwUm93KGNvbmRpdGlvbnM/OiBSdWxlQ29uZGl0aW9uW10pIHtcbiAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmlsdGVyLXJvd3MtY29udGFpbmVyJyk7XG4gICAgaWYgKCFjb250YWluZXIpIHJldHVybjtcblxuICAgIGNvbnN0IGdyb3VwRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgZ3JvdXBEaXYuY2xhc3NOYW1lID0gJ2ZpbHRlci1ncm91cC1yb3cnO1xuICAgIGdyb3VwRGl2LnN0eWxlLmJvcmRlciA9ICcxcHggc29saWQgI2UwZTBlMCc7XG4gICAgZ3JvdXBEaXYuc3R5bGUuYm9yZGVyUmFkaXVzID0gJzVweCc7XG4gICAgZ3JvdXBEaXYuc3R5bGUucGFkZGluZyA9ICcxMHB4JztcbiAgICBncm91cERpdi5zdHlsZS5tYXJnaW5Cb3R0b20gPSAnMTBweCc7XG4gICAgZ3JvdXBEaXYuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJyNmYWZhZmEnO1xuXG4gICAgZ3JvdXBEaXYuaW5uZXJIVE1MID0gYFxuICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuOyBhbGlnbi1pdGVtczogY2VudGVyOyBtYXJnaW4tYm90dG9tOiA1cHg7XCI+XG4gICAgICAgICAgICA8c3BhbiBzdHlsZT1cImZvbnQtd2VpZ2h0OiBib2xkOyBjb2xvcjogIzU1NTsgZm9udC1zaXplOiAwLjllbTtcIj5Hcm91cCAoQU5EKTwvc3Bhbj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJzbWFsbC1idG4gYnRuLWRlbC1ncm91cFwiIHN0eWxlPVwiYmFja2dyb3VuZDogI2ZmY2NjYzsgY29sb3I6IGRhcmtyZWQ7XCI+RGVsZXRlIEdyb3VwPC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwiY29uZGl0aW9ucy1jb250YWluZXJcIj48L2Rpdj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInNtYWxsLWJ0biBidG4tYWRkLWNvbmRpdGlvblwiIHN0eWxlPVwibWFyZ2luLXRvcDogNXB4O1wiPisgQWRkIENvbmRpdGlvbjwvYnV0dG9uPlxuICAgIGA7XG5cbiAgICBncm91cERpdi5xdWVyeVNlbGVjdG9yKCcuYnRuLWRlbC1ncm91cCcpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgZ3JvdXBEaXYucmVtb3ZlKCk7XG4gICAgICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbmRpdGlvbnNDb250YWluZXIgPSBncm91cERpdi5xdWVyeVNlbGVjdG9yKCcuY29uZGl0aW9ucy1jb250YWluZXInKSBhcyBIVE1MRWxlbWVudDtcbiAgICBjb25zdCBhZGRDb25kaXRpb25CdG4gPSBncm91cERpdi5xdWVyeVNlbGVjdG9yKCcuYnRuLWFkZC1jb25kaXRpb24nKTtcblxuICAgIGNvbnN0IGFkZENvbmRpdGlvbiA9IChkYXRhPzogUnVsZUNvbmRpdGlvbikgPT4ge1xuICAgICAgICBjb25zdCBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgZGl2LmNsYXNzTmFtZSA9ICdidWlsZGVyLXJvdyBjb25kaXRpb24tcm93JztcbiAgICAgICAgZGl2LnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG4gICAgICAgIGRpdi5zdHlsZS5nYXAgPSAnNXB4JztcbiAgICAgICAgZGl2LnN0eWxlLm1hcmdpbkJvdHRvbSA9ICc1cHgnO1xuICAgICAgICBkaXYuc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xuXG4gICAgICAgIGRpdi5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwiZmllbGQtc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgJHtGSUVMRF9PUFRJT05TfVxuICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cIm9wZXJhdG9yLWNvbnRhaW5lclwiPlxuICAgICAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJvcGVyYXRvci1zZWxlY3RcIj5cbiAgICAgICAgICAgICAgICAgICAgJHtPUEVSQVRPUl9PUFRJT05TfVxuICAgICAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJ2YWx1ZS1jb250YWluZXJcIj5cbiAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cInZhbHVlLWlucHV0XCIgcGxhY2Vob2xkZXI9XCJWYWx1ZVwiPlxuICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInNtYWxsLWJ0biBidG4tZGVsLWNvbmRpdGlvblwiIHN0eWxlPVwiYmFja2dyb3VuZDogbm9uZTsgYm9yZGVyOiBub25lOyBjb2xvcjogcmVkO1wiPiZ0aW1lczs8L2J1dHRvbj5cbiAgICAgICAgYDtcblxuICAgICAgICBjb25zdCBmaWVsZFNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IG9wZXJhdG9yQ29udGFpbmVyID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5vcGVyYXRvci1jb250YWluZXInKSBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgY29uc3QgdmFsdWVDb250YWluZXIgPSBkaXYucXVlcnlTZWxlY3RvcignLnZhbHVlLWNvbnRhaW5lcicpIGFzIEhUTUxFbGVtZW50O1xuXG4gICAgICAgIGNvbnN0IHVwZGF0ZVN0YXRlID0gKGluaXRpYWxPcD86IHN0cmluZywgaW5pdGlhbFZhbD86IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgY29uc3QgdmFsID0gZmllbGRTZWxlY3QudmFsdWU7XG4gICAgICAgICAgICAvLyBIYW5kbGUgYm9vbGVhbiBmaWVsZHNcbiAgICAgICAgICAgIGlmIChbJ3NlbGVjdGVkJywgJ3Bpbm5lZCddLmluY2x1ZGVzKHZhbCkpIHtcbiAgICAgICAgICAgICAgICBvcGVyYXRvckNvbnRhaW5lci5pbm5lckhUTUwgPSBgPHNlbGVjdCBjbGFzcz1cIm9wZXJhdG9yLXNlbGVjdFwiIGRpc2FibGVkIHN0eWxlPVwiYmFja2dyb3VuZDogI2VlZTsgY29sb3I6ICM1NTU7XCI+PG9wdGlvbiB2YWx1ZT1cImVxdWFsc1wiPmlzPC9vcHRpb24+PC9zZWxlY3Q+YDtcbiAgICAgICAgICAgICAgICB2YWx1ZUNvbnRhaW5lci5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJ2YWx1ZS1pbnB1dFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInRydWVcIj5UcnVlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZmFsc2VcIj5GYWxzZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgICAgICBgO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiBhbHJlYWR5IGluIHN0YW5kYXJkIG1vZGUgdG8gYXZvaWQgdW5uZWNlc3NhcnkgRE9NIHRocmFzaGluZ1xuICAgICAgICAgICAgICAgIGlmICghb3BlcmF0b3JDb250YWluZXIucXVlcnlTZWxlY3Rvcignc2VsZWN0Om5vdChbZGlzYWJsZWRdKScpKSB7XG4gICAgICAgICAgICAgICAgICAgIG9wZXJhdG9yQ29udGFpbmVyLmlubmVySFRNTCA9IGA8c2VsZWN0IGNsYXNzPVwib3BlcmF0b3Itc2VsZWN0XCI+JHtPUEVSQVRPUl9PUFRJT05TfTwvc2VsZWN0PmA7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlQ29udGFpbmVyLmlubmVySFRNTCA9IGA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cInZhbHVlLWlucHV0XCIgcGxhY2Vob2xkZXI9XCJWYWx1ZVwiPmA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBSZXN0b3JlIHZhbHVlcyBpZiBwcm92aWRlZCAoZXNwZWNpYWxseSB3aGVuIHN3aXRjaGluZyBiYWNrIG9yIGluaXRpYWxpemluZylcbiAgICAgICAgICAgIGlmIChpbml0aWFsT3AgfHwgaW5pdGlhbFZhbCkge1xuICAgICAgICAgICAgICAgICBjb25zdCBvcEVsID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5vcGVyYXRvci1zZWxlY3QnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgIGNvbnN0IHZhbEVsID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgICAgICAgaWYgKG9wRWwgJiYgaW5pdGlhbE9wKSBvcEVsLnZhbHVlID0gaW5pdGlhbE9wO1xuICAgICAgICAgICAgICAgICBpZiAodmFsRWwgJiYgaW5pdGlhbFZhbCkgdmFsRWwudmFsdWUgPSBpbml0aWFsVmFsO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBSZS1hdHRhY2ggbGlzdGVuZXJzIHRvIG5ldyBlbGVtZW50c1xuICAgICAgICAgICAgZGl2LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0LCBzZWxlY3QnKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgICAgICAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB1cGRhdGVCcmVhZGNydW1iKTtcbiAgICAgICAgICAgICAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKCdpbnB1dCcsIHVwZGF0ZUJyZWFkY3J1bWIpO1xuICAgICAgICAgICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHVwZGF0ZUJyZWFkY3J1bWIpO1xuICAgICAgICAgICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgdXBkYXRlQnJlYWRjcnVtYik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBmaWVsZFNlbGVjdC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoKSA9PiB7XG4gICAgICAgICAgICB1cGRhdGVTdGF0ZSgpO1xuICAgICAgICAgICAgdXBkYXRlQnJlYWRjcnVtYigpO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoZGF0YSkge1xuICAgICAgICAgICAgZmllbGRTZWxlY3QudmFsdWUgPSBkYXRhLmZpZWxkO1xuICAgICAgICAgICAgdXBkYXRlU3RhdGUoZGF0YS5vcGVyYXRvciwgZGF0YS52YWx1ZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB1cGRhdGVTdGF0ZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgZGl2LnF1ZXJ5U2VsZWN0b3IoJy5idG4tZGVsLWNvbmRpdGlvbicpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgIGRpdi5yZW1vdmUoKTtcbiAgICAgICAgICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uZGl0aW9uc0NvbnRhaW5lci5hcHBlbmRDaGlsZChkaXYpO1xuICAgIH07XG5cbiAgICBhZGRDb25kaXRpb25CdG4/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gYWRkQ29uZGl0aW9uKCkpO1xuXG4gICAgaWYgKGNvbmRpdGlvbnMgJiYgY29uZGl0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbmRpdGlvbnMuZm9yRWFjaChjID0+IGFkZENvbmRpdGlvbihjKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gQWRkIG9uZSBlbXB0eSBjb25kaXRpb24gYnkgZGVmYXVsdFxuICAgICAgICBhZGRDb25kaXRpb24oKTtcbiAgICB9XG5cbiAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JvdXBEaXYpO1xuICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbn1cblxuZnVuY3Rpb24gYWRkQnVpbGRlclJvdyh0eXBlOiAnZ3JvdXAnIHwgJ3NvcnQnIHwgJ2dyb3VwU29ydCcsIGRhdGE/OiBhbnkpIHtcbiAgICBsZXQgY29udGFpbmVySWQgPSAnJztcbiAgICBpZiAodHlwZSA9PT0gJ2dyb3VwJykgY29udGFpbmVySWQgPSAnZ3JvdXAtcm93cy1jb250YWluZXInO1xuICAgIGVsc2UgaWYgKHR5cGUgPT09ICdzb3J0JykgY29udGFpbmVySWQgPSAnc29ydC1yb3dzLWNvbnRhaW5lcic7XG4gICAgZWxzZSBpZiAodHlwZSA9PT0gJ2dyb3VwU29ydCcpIGNvbnRhaW5lcklkID0gJ2dyb3VwLXNvcnQtcm93cy1jb250YWluZXInO1xuXG4gICAgY29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY29udGFpbmVySWQpO1xuICAgIGlmICghY29udGFpbmVyKSByZXR1cm47XG5cbiAgICBjb25zdCBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBkaXYuY2xhc3NOYW1lID0gJ2J1aWxkZXItcm93JztcbiAgICBkaXYuZGF0YXNldC50eXBlID0gdHlwZTtcblxuICAgIGlmICh0eXBlID09PSAnZ3JvdXAnKSB7XG4gICAgICAgIGRpdi5zdHlsZS5mbGV4V3JhcCA9ICd3cmFwJztcbiAgICAgICAgZGl2LmlubmVySFRNTCA9IGBcbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwicm93LW51bWJlclwiPjwvc3Bhbj5cbiAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJzb3VyY2Utc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImZpZWxkXCI+RmllbGQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZml4ZWRcIj5GaXhlZCBWYWx1ZTwvb3B0aW9uPlxuICAgICAgICAgICAgPC9zZWxlY3Q+XG5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiaW5wdXQtY29udGFpbmVyXCI+XG4gICAgICAgICAgICAgICAgIDwhLS0gV2lsbCBiZSBwb3B1bGF0ZWQgYmFzZWQgb24gc291cmNlIHNlbGVjdGlvbiAtLT5cbiAgICAgICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cImZpZWxkLXNlbGVjdCB2YWx1ZS1pbnB1dC1maWVsZFwiPlxuICAgICAgICAgICAgICAgICAgICAke0ZJRUxEX09QVElPTlN9XG4gICAgICAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cInZhbHVlLWlucHV0LXRleHRcIiBwbGFjZWhvbGRlcj1cIkdyb3VwIE5hbWVcIiBzdHlsZT1cImRpc3BsYXk6bm9uZTtcIj5cbiAgICAgICAgICAgIDwvc3Bhbj5cblxuICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJtYXJnaW4tbGVmdDogMTBweDtcIj5UcmFuc2Zvcm06PC9zcGFuPlxuICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cInRyYW5zZm9ybS1zZWxlY3RcIj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibm9uZVwiPk5vbmU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwic3RyaXBUbGRcIj5TdHJpcCBUTEQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZG9tYWluXCI+R2V0IERvbWFpbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJob3N0bmFtZVwiPkdldCBIb3N0bmFtZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJsb3dlcmNhc2VcIj5Mb3dlcmNhc2U8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwidXBwZXJjYXNlXCI+VXBwZXJjYXNlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImZpcnN0Q2hhclwiPkZpcnN0IENoYXI8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwicmVnZXhcIj5SZWdleCBFeHRyYWN0aW9uPC9vcHRpb24+XG4gICAgICAgICAgICA8L3NlbGVjdD5cblxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJlZ2V4LWNvbnRhaW5lclwiIHN0eWxlPVwiZGlzcGxheTpub25lOyBmbGV4LWJhc2lzOiAxMDAlOyBtYXJnaW4tdG9wOiA4cHg7IHBhZGRpbmc6IDhweDsgYmFja2dyb3VuZDogI2Y4ZjlmYTsgYm9yZGVyOiAxcHggZGFzaGVkICNjZWQ0ZGE7IGJvcmRlci1yYWRpdXM6IDRweDtcIj5cbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZ2FwOiA4cHg7IG1hcmdpbi1ib3R0b206IDVweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJmb250LXdlaWdodDogNTAwOyBmb250LXNpemU6IDAuOWVtO1wiPlBhdHRlcm46PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cInRyYW5zZm9ybS1wYXR0ZXJuXCIgcGxhY2Vob2xkZXI9XCJlLmcuIF4oXFx3KyktKFxcZCspJFwiIHN0eWxlPVwiZmxleDoxO1wiPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiB0aXRsZT1cIkNhcHR1cmVzIGFsbCBncm91cHMgYW5kIGNvbmNhdGVuYXRlcyB0aGVtLiBJZiBubyBtYXRjaCwgcmVzdWx0IGlzIGVtcHR5LiBFeGFtcGxlOiAndXNlci0oXFxkKyknIGV4dHJhY3RzICcxMjMnIGZyb20gJ3VzZXItMTIzJy5cIiBzdHlsZT1cImN1cnNvcjogaGVscDsgY29sb3I6ICMwMDdiZmY7IGZvbnQtd2VpZ2h0OiBib2xkOyBiYWNrZ3JvdW5kOiAjZTdmMWZmOyB3aWR0aDogMThweDsgaGVpZ2h0OiAxOHB4OyBkaXNwbGF5OiBpbmxpbmUtZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsganVzdGlmeS1jb250ZW50OiBjZW50ZXI7IGJvcmRlci1yYWRpdXM6IDUwJTsgZm9udC1zaXplOiAxMnB4O1wiPj88L3NwYW4+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGdhcDogOHB4OyBhbGlnbi1pdGVtczogY2VudGVyOyBmb250LXNpemU6IDAuOWVtO1wiPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImZvbnQtd2VpZ2h0OiA1MDA7XCI+VGVzdDo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIGNsYXNzPVwicmVnZXgtdGVzdC1pbnB1dFwiIHBsYWNlaG9sZGVyPVwiVGVzdCBTdHJpbmdcIiBzdHlsZT1cImZsZXg6IDE7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuPiZyYXJyOzwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJyZWdleC10ZXN0LXJlc3VsdFwiIHN0eWxlPVwiZm9udC1mYW1pbHk6IG1vbm9zcGFjZTsgYmFja2dyb3VuZDogd2hpdGU7IHBhZGRpbmc6IDJweCA1cHg7IGJvcmRlcjogMXB4IHNvbGlkICNkZGQ7IGJvcmRlci1yYWRpdXM6IDNweDsgbWluLXdpZHRoOiA2MHB4O1wiPihwcmV2aWV3KTwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICA8c3BhbiBzdHlsZT1cIm1hcmdpbi1sZWZ0OiAxMHB4O1wiPldpbmRvdzo8L3NwYW4+XG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwid2luZG93LW1vZGUtc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImN1cnJlbnRcIj5DdXJyZW50PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbXBvdW5kXCI+Q29tcG91bmQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibmV3XCI+TmV3PC9vcHRpb24+XG4gICAgICAgICAgICA8L3NlbGVjdD5cblxuICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJtYXJnaW4tbGVmdDogMTBweDtcIj5Db2xvcjo8L3NwYW4+XG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwiY29sb3ItaW5wdXRcIj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZ3JleVwiPkdyZXk8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiYmx1ZVwiPkJsdWU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwicmVkXCI+UmVkPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInllbGxvd1wiPlllbGxvdzwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJncmVlblwiPkdyZWVuPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInBpbmtcIj5QaW5rPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInB1cnBsZVwiPlB1cnBsZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjeWFuXCI+Q3lhbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJvcmFuZ2VcIj5PcmFuZ2U8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibWF0Y2hcIj5NYXRjaCBWYWx1ZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJmaWVsZFwiPkNvbG9yIGJ5IEZpZWxkPC9vcHRpb24+XG4gICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJjb2xvci1maWVsZC1zZWxlY3RcIiBzdHlsZT1cImRpc3BsYXk6bm9uZTtcIj5cbiAgICAgICAgICAgICAgICAke0ZJRUxEX09QVElPTlN9XG4gICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgIDxsYWJlbD48aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgY2xhc3M9XCJyYW5kb20tY29sb3ItY2hlY2tcIiBjaGVja2VkPiBSYW5kb208L2xhYmVsPlxuXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93LWFjdGlvbnNcIj5cbiAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwic21hbGwtYnRuIGJ0bi1kZWxcIiBzdHlsZT1cImJhY2tncm91bmQ6ICNmZmNjY2M7IGNvbG9yOiBkYXJrcmVkO1wiPkRlbGV0ZTwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgIGA7XG5cbiAgICAgICAgLy8gQWRkIHNwZWNpZmljIGxpc3RlbmVycyBmb3IgR3JvdXAgcm93XG4gICAgICAgIGNvbnN0IHNvdXJjZVNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuc291cmNlLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICBjb25zdCBmaWVsZFNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQtZmllbGQnKSBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgY29uc3QgdGV4dElucHV0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC10ZXh0JykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IGNvbG9ySW5wdXQgPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLWlucHV0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IGNvbG9yRmllbGRTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLWZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICBjb25zdCByYW5kb21DaGVjayA9IGRpdi5xdWVyeVNlbGVjdG9yKCcucmFuZG9tLWNvbG9yLWNoZWNrJykgYXMgSFRNTElucHV0RWxlbWVudDtcblxuICAgICAgICAvLyBSZWdleCBMb2dpY1xuICAgICAgICBjb25zdCB0cmFuc2Zvcm1TZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLnRyYW5zZm9ybS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgY29uc3QgcmVnZXhDb250YWluZXIgPSBkaXYucXVlcnlTZWxlY3RvcignLnJlZ2V4LWNvbnRhaW5lcicpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICBjb25zdCBwYXR0ZXJuSW5wdXQgPSBkaXYucXVlcnlTZWxlY3RvcignLnRyYW5zZm9ybS1wYXR0ZXJuJykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgY29uc3QgdGVzdElucHV0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5yZWdleC10ZXN0LWlucHV0JykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgY29uc3QgdGVzdFJlc3VsdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcucmVnZXgtdGVzdC1yZXN1bHQnKSBhcyBIVE1MRWxlbWVudDtcblxuICAgICAgICBjb25zdCB0b2dnbGVUcmFuc2Zvcm0gPSAoKSA9PiB7XG4gICAgICAgICAgICBpZiAodHJhbnNmb3JtU2VsZWN0LnZhbHVlID09PSAncmVnZXgnKSB7XG4gICAgICAgICAgICAgICAgcmVnZXhDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlZ2V4Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG4gICAgICAgIH07XG4gICAgICAgIHRyYW5zZm9ybVNlbGVjdC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB0b2dnbGVUcmFuc2Zvcm0pO1xuXG4gICAgICAgIGNvbnN0IHVwZGF0ZVRlc3QgPSAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwYXQgPSBwYXR0ZXJuSW5wdXQudmFsdWU7XG4gICAgICAgICAgICBjb25zdCB0eHQgPSB0ZXN0SW5wdXQudmFsdWU7XG4gICAgICAgICAgICBpZiAoIXBhdCB8fCAhdHh0KSB7XG4gICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQudGV4dENvbnRlbnQgPSBcIihwcmV2aWV3KVwiO1xuICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnN0eWxlLmNvbG9yID0gXCIjNTU1XCI7XG4gICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHBhdCk7XG4gICAgICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSByZWdleC5leGVjKHR4dCk7XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgICBsZXQgZXh0cmFjdGVkID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbWF0Y2gubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICBleHRyYWN0ZWQgKz0gbWF0Y2hbaV0gfHwgXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQudGV4dENvbnRlbnQgPSBleHRyYWN0ZWQgfHwgXCIoZW1wdHkgZ3JvdXApXCI7XG4gICAgICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnN0eWxlLmNvbG9yID0gXCJncmVlblwiO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnRleHRDb250ZW50ID0gXCIobm8gbWF0Y2gpXCI7XG4gICAgICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnN0eWxlLmNvbG9yID0gXCJyZWRcIjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgdGVzdFJlc3VsdC50ZXh0Q29udGVudCA9IFwiKGludmFsaWQgcmVnZXgpXCI7XG4gICAgICAgICAgICAgICAgdGVzdFJlc3VsdC5zdHlsZS5jb2xvciA9IFwicmVkXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHBhdHRlcm5JbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsICgpID0+IHsgdXBkYXRlVGVzdCgpOyB1cGRhdGVCcmVhZGNydW1iKCk7IH0pO1xuICAgICAgICB0ZXN0SW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCB1cGRhdGVUZXN0KTtcblxuXG4gICAgICAgIC8vIFRvZ2dsZSBpbnB1dCB0eXBlXG4gICAgICAgIGNvbnN0IHRvZ2dsZUlucHV0ID0gKCkgPT4ge1xuICAgICAgICAgICAgaWYgKHNvdXJjZVNlbGVjdC52YWx1ZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgIGZpZWxkU2VsZWN0LnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWJsb2NrJztcbiAgICAgICAgICAgICAgICB0ZXh0SW5wdXQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZmllbGRTZWxlY3Quc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgICAgICB0ZXh0SW5wdXQuc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUtYmxvY2snO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdXBkYXRlQnJlYWRjcnVtYigpO1xuICAgICAgICB9O1xuICAgICAgICBzb3VyY2VTZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgdG9nZ2xlSW5wdXQpO1xuXG4gICAgICAgIC8vIFRvZ2dsZSBjb2xvciBpbnB1dFxuICAgICAgICBjb25zdCB0b2dnbGVDb2xvciA9ICgpID0+IHtcbiAgICAgICAgICAgIGlmIChyYW5kb21DaGVjay5jaGVja2VkKSB7XG4gICAgICAgICAgICAgICAgY29sb3JJbnB1dC5kaXNhYmxlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgY29sb3JJbnB1dC5zdHlsZS5vcGFjaXR5ID0gJzAuNSc7XG4gICAgICAgICAgICAgICAgY29sb3JGaWVsZFNlbGVjdC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb2xvcklucHV0LmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgY29sb3JJbnB1dC5zdHlsZS5vcGFjaXR5ID0gJzEnO1xuICAgICAgICAgICAgICAgIGlmIChjb2xvcklucHV0LnZhbHVlID09PSAnZmllbGQnKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yRmllbGRTZWxlY3Quc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUtYmxvY2snO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yRmllbGRTZWxlY3Quc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHJhbmRvbUNoZWNrLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHRvZ2dsZUNvbG9yKTtcbiAgICAgICAgY29sb3JJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB0b2dnbGVDb2xvcik7XG4gICAgICAgIHRvZ2dsZUNvbG9yKCk7IC8vIGluaXRcblxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3NvcnQnIHx8IHR5cGUgPT09ICdncm91cFNvcnQnKSB7XG4gICAgICAgIGRpdi5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwiZmllbGQtc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgJHtGSUVMRF9PUFRJT05TfVxuICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwib3JkZXItc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImFzY1wiPmEgdG8geiAoYXNjKTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJkZXNjXCI+eiB0byBhIChkZXNjKTwvb3B0aW9uPlxuICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93LWFjdGlvbnNcIj5cbiAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInNtYWxsLWJ0biBidG4tZGVsXCIgc3R5bGU9XCJiYWNrZ3JvdW5kOiAjZmZjY2NjOyBjb2xvcjogZGFya3JlZDtcIj5EZWxldGU8L2J1dHRvbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICBgO1xuICAgIH1cblxuICAgIC8vIFBvcHVsYXRlIGRhdGEgaWYgcHJvdmlkZWQgKGZvciBlZGl0aW5nKVxuICAgIGlmIChkYXRhKSB7XG4gICAgICAgIGlmICh0eXBlID09PSAnZ3JvdXAnKSB7XG4gICAgICAgICAgICBjb25zdCBzb3VyY2VTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLnNvdXJjZS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC1maWVsZCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgdGV4dElucHV0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC10ZXh0JykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IHRyYW5zZm9ybVNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcudHJhbnNmb3JtLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgY29sb3JJbnB1dCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuY29sb3ItaW5wdXQnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IGNvbG9yRmllbGRTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLWZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgcmFuZG9tQ2hlY2sgPSBkaXYucXVlcnlTZWxlY3RvcignLnJhbmRvbS1jb2xvci1jaGVjaycpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgICAgICBjb25zdCB3aW5kb3dNb2RlU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy53aW5kb3ctbW9kZS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcblxuICAgICAgICAgICAgaWYgKGRhdGEuc291cmNlKSBzb3VyY2VTZWxlY3QudmFsdWUgPSBkYXRhLnNvdXJjZTtcblxuICAgICAgICAgICAgLy8gVHJpZ2dlciB0b2dnbGUgdG8gc2hvdyBjb3JyZWN0IGlucHV0XG4gICAgICAgICAgICBzb3VyY2VTZWxlY3QuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScpKTtcblxuICAgICAgICAgICAgaWYgKGRhdGEuc291cmNlID09PSAnZmllbGQnKSB7XG4gICAgICAgICAgICAgICAgaWYgKGRhdGEudmFsdWUpIGZpZWxkU2VsZWN0LnZhbHVlID0gZGF0YS52YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKGRhdGEudmFsdWUpIHRleHRJbnB1dC52YWx1ZSA9IGRhdGEudmFsdWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChkYXRhLnRyYW5zZm9ybSkgdHJhbnNmb3JtU2VsZWN0LnZhbHVlID0gZGF0YS50cmFuc2Zvcm07XG4gICAgICAgICAgICBpZiAoZGF0YS50cmFuc2Zvcm1QYXR0ZXJuKSAoZGl2LnF1ZXJ5U2VsZWN0b3IoJy50cmFuc2Zvcm0tcGF0dGVybicpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gZGF0YS50cmFuc2Zvcm1QYXR0ZXJuO1xuXG4gICAgICAgICAgICAvLyBUcmlnZ2VyIHRvZ2dsZSBmb3IgcmVnZXggVUlcbiAgICAgICAgICAgIHRyYW5zZm9ybVNlbGVjdC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJykpO1xuXG4gICAgICAgICAgICBpZiAoZGF0YS53aW5kb3dNb2RlKSB3aW5kb3dNb2RlU2VsZWN0LnZhbHVlID0gZGF0YS53aW5kb3dNb2RlO1xuXG4gICAgICAgICAgICBpZiAoZGF0YS5jb2xvciAmJiBkYXRhLmNvbG9yICE9PSAncmFuZG9tJykge1xuICAgICAgICAgICAgICAgIHJhbmRvbUNoZWNrLmNoZWNrZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBjb2xvcklucHV0LnZhbHVlID0gZGF0YS5jb2xvcjtcbiAgICAgICAgICAgICAgICBpZiAoZGF0YS5jb2xvciA9PT0gJ2ZpZWxkJyAmJiBkYXRhLmNvbG9yRmllbGQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29sb3JGaWVsZFNlbGVjdC52YWx1ZSA9IGRhdGEuY29sb3JGaWVsZDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJhbmRvbUNoZWNrLmNoZWNrZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgIC8vIFRyaWdnZXIgdG9nZ2xlIGNvbG9yXG4gICAgICAgICAgICByYW5kb21DaGVjay5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJykpO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzb3J0JyB8fCB0eXBlID09PSAnZ3JvdXBTb3J0Jykge1xuICAgICAgICAgICAgIGlmIChkYXRhLmZpZWxkKSAoZGl2LnF1ZXJ5U2VsZWN0b3IoJy5maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgPSBkYXRhLmZpZWxkO1xuICAgICAgICAgICAgIGlmIChkYXRhLm9yZGVyKSAoZGl2LnF1ZXJ5U2VsZWN0b3IoJy5vcmRlci1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgPSBkYXRhLm9yZGVyO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gTGlzdGVuZXJzIChHZW5lcmFsKVxuICAgIGRpdi5xdWVyeVNlbGVjdG9yKCcuYnRuLWRlbCcpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgZGl2LnJlbW92ZSgpO1xuICAgICAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG4gICAgfSk7XG5cbiAgICAvLyBBTkQgLyBPUiBsaXN0ZW5lcnMgKFZpc3VhbCBtYWlubHksIG9yIGFwcGVuZGluZyBuZXcgcm93cylcbiAgICBkaXYucXVlcnlTZWxlY3RvcignLmJ0bi1hbmQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGFkZEJ1aWxkZXJSb3codHlwZSk7IC8vIEp1c3QgYWRkIGFub3RoZXIgcm93XG4gICAgfSk7XG5cbiAgICBkaXYucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQsIHNlbGVjdCcpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB1cGRhdGVCcmVhZGNydW1iKTtcbiAgICAgICAgZWwuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCB1cGRhdGVCcmVhZGNydW1iKTtcbiAgICB9KTtcblxuICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChkaXYpO1xuICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbn1cblxuZnVuY3Rpb24gY2xlYXJCdWlsZGVyKCkge1xuICAgIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtbmFtZScpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gJyc7XG4gICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1kZXNjJykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUgPSAnJztcblxuICAgIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtYXV0b3J1bicpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQgPSBmYWxzZTtcbiAgICAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LXNlcGFyYXRlLXdpbmRvdycpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQgPSBmYWxzZTtcblxuICAgIGNvbnN0IHNvcnRHcm91cHNDaGVjayA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtc29ydGdyb3Vwcy1jaGVjaycpIGFzIEhUTUxJbnB1dEVsZW1lbnQpO1xuICAgIGlmIChzb3J0R3JvdXBzQ2hlY2spIHtcbiAgICAgICAgc29ydEdyb3Vwc0NoZWNrLmNoZWNrZWQgPSBmYWxzZTtcbiAgICAgICAgLy8gVHJpZ2dlciBjaGFuZ2UgdG8gaGlkZSBjb250YWluZXJcbiAgICAgICAgc29ydEdyb3Vwc0NoZWNrLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnKSk7XG4gICAgfVxuXG4gICAgY29uc3QgbG9hZFNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdGVneS1sb2FkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgIGlmIChsb2FkU2VsZWN0KSBsb2FkU2VsZWN0LnZhbHVlID0gJyc7XG5cbiAgICBbJ2ZpbHRlci1yb3dzLWNvbnRhaW5lcicsICdncm91cC1yb3dzLWNvbnRhaW5lcicsICdzb3J0LXJvd3MtY29udGFpbmVyJywgJ2dyb3VwLXNvcnQtcm93cy1jb250YWluZXInXS5mb3JFYWNoKGlkID0+IHtcbiAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCk7XG4gICAgICAgIGlmIChlbCkgZWwuaW5uZXJIVE1MID0gJyc7XG4gICAgfSk7XG5cbiAgICBjb25zdCBidWlsZGVyUmVzdWx0cyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidWlsZGVyLXJlc3VsdHMnKTtcbiAgICBpZiAoYnVpbGRlclJlc3VsdHMpIGJ1aWxkZXJSZXN1bHRzLmlubmVySFRNTCA9ICcnO1xuXG4gICAgYWRkRmlsdGVyR3JvdXBSb3coKTsgLy8gUmVzZXQgd2l0aCBvbmUgZW1wdHkgZmlsdGVyIGdyb3VwXG4gICAgdXBkYXRlQnJlYWRjcnVtYigpO1xufVxuXG5mdW5jdGlvbiBleHBvcnRCdWlsZGVyU3RyYXRlZ3koKSB7XG4gICAgY29uc3Qgc3RyYXQgPSBnZXRCdWlsZGVyU3RyYXRlZ3koKTtcbiAgICBpZiAoIXN0cmF0KSB7XG4gICAgICAgIGFsZXJ0KFwiUGxlYXNlIGRlZmluZSBhIHN0cmF0ZWd5IHRvIGV4cG9ydCAoSUQgYW5kIExhYmVsIHJlcXVpcmVkKS5cIik7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbG9nSW5mbyhcIkV4cG9ydGluZyBzdHJhdGVneVwiLCB7IGlkOiBzdHJhdC5pZCB9KTtcbiAgICBjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkoc3RyYXQsIG51bGwsIDIpO1xuICAgIGNvbnN0IGNvbnRlbnQgPSBgXG4gICAgICAgIDxwPkNvcHkgdGhlIEpTT04gYmVsb3c6PC9wPlxuICAgICAgICA8dGV4dGFyZWEgc3R5bGU9XCJ3aWR0aDogMTAwJTsgaGVpZ2h0OiAzMDBweDsgZm9udC1mYW1pbHk6IG1vbm9zcGFjZTtcIj4ke2VzY2FwZUh0bWwoanNvbil9PC90ZXh0YXJlYT5cbiAgICBgO1xuICAgIHNob3dNb2RhbChcIkV4cG9ydCBTdHJhdGVneVwiLCBjb250ZW50KTtcbn1cblxuZnVuY3Rpb24gaW1wb3J0QnVpbGRlclN0cmF0ZWd5KCkge1xuICAgIGNvbnN0IGNvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBjb250ZW50LmlubmVySFRNTCA9IGBcbiAgICAgICAgPHA+UGFzdGUgU3RyYXRlZ3kgSlNPTiBiZWxvdzo8L3A+XG4gICAgICAgIDx0ZXh0YXJlYSBpZD1cImltcG9ydC1zdHJhdC1hcmVhXCIgc3R5bGU9XCJ3aWR0aDogMTAwJTsgaGVpZ2h0OiAyMDBweDsgZm9udC1mYW1pbHk6IG1vbm9zcGFjZTsgbWFyZ2luLWJvdHRvbTogMTBweDtcIj48L3RleHRhcmVhPlxuICAgICAgICA8YnV0dG9uIGlkPVwiaW1wb3J0LXN0cmF0LWNvbmZpcm1cIiBjbGFzcz1cInN1Y2Nlc3MtYnRuXCI+TG9hZDwvYnV0dG9uPlxuICAgIGA7XG5cbiAgICBjb25zdCBidG4gPSBjb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNpbXBvcnQtc3RyYXQtY29uZmlybScpO1xuICAgIGJ0bj8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHR4dCA9IChjb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNpbXBvcnQtc3RyYXQtYXJlYScpIGFzIEhUTUxUZXh0QXJlYUVsZW1lbnQpLnZhbHVlO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QganNvbiA9IEpTT04ucGFyc2UodHh0KTtcbiAgICAgICAgICAgIGlmICghanNvbi5pZCB8fCAhanNvbi5sYWJlbCkge1xuICAgICAgICAgICAgICAgIGFsZXJ0KFwiSW52YWxpZCBzdHJhdGVneTogSUQgYW5kIExhYmVsIGFyZSByZXF1aXJlZC5cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbG9nSW5mbyhcIkltcG9ydGluZyBzdHJhdGVneVwiLCB7IGlkOiBqc29uLmlkIH0pO1xuICAgICAgICAgICAgcG9wdWxhdGVCdWlsZGVyRnJvbVN0cmF0ZWd5KGpzb24pO1xuICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm1vZGFsLW92ZXJsYXknKT8ucmVtb3ZlKCk7XG4gICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgYWxlcnQoXCJJbnZhbGlkIEpTT046IFwiICsgZSk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHNob3dNb2RhbChcIkltcG9ydCBTdHJhdGVneVwiLCBjb250ZW50KTtcbn1cblxuZnVuY3Rpb24gZXhwb3J0QWxsU3RyYXRlZ2llcygpIHtcbiAgICBsb2dJbmZvKFwiRXhwb3J0aW5nIGFsbCBzdHJhdGVnaWVzXCIsIHsgY291bnQ6IGxvY2FsQ3VzdG9tU3RyYXRlZ2llcy5sZW5ndGggfSk7XG4gICAgY29uc3QganNvbiA9IEpTT04uc3RyaW5naWZ5KGxvY2FsQ3VzdG9tU3RyYXRlZ2llcywgbnVsbCwgMik7XG4gICAgY29uc3QgY29udGVudCA9IGBcbiAgICAgICAgPHA+Q29weSB0aGUgSlNPTiBiZWxvdyAoY29udGFpbnMgJHtsb2NhbEN1c3RvbVN0cmF0ZWdpZXMubGVuZ3RofSBzdHJhdGVnaWVzKTo8L3A+XG4gICAgICAgIDx0ZXh0YXJlYSBzdHlsZT1cIndpZHRoOiAxMDAlOyBoZWlnaHQ6IDMwMHB4OyBmb250LWZhbWlseTogbW9ub3NwYWNlO1wiPiR7ZXNjYXBlSHRtbChqc29uKX08L3RleHRhcmVhPlxuICAgIGA7XG4gICAgc2hvd01vZGFsKFwiRXhwb3J0IEFsbCBTdHJhdGVnaWVzXCIsIGNvbnRlbnQpO1xufVxuXG5mdW5jdGlvbiBpbXBvcnRBbGxTdHJhdGVnaWVzKCkge1xuICAgIGNvbnN0IGNvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBjb250ZW50LmlubmVySFRNTCA9IGBcbiAgICAgICAgPHA+UGFzdGUgU3RyYXRlZ3kgTGlzdCBKU09OIGJlbG93OjwvcD5cbiAgICAgICAgPHAgc3R5bGU9XCJmb250LXNpemU6IDAuOWVtOyBjb2xvcjogIzY2NjtcIj5Ob3RlOiBTdHJhdGVnaWVzIHdpdGggbWF0Y2hpbmcgSURzIHdpbGwgYmUgb3ZlcndyaXR0ZW4uPC9wPlxuICAgICAgICA8dGV4dGFyZWEgaWQ9XCJpbXBvcnQtYWxsLWFyZWFcIiBzdHlsZT1cIndpZHRoOiAxMDAlOyBoZWlnaHQ6IDIwMHB4OyBmb250LWZhbWlseTogbW9ub3NwYWNlOyBtYXJnaW4tYm90dG9tOiAxMHB4O1wiPjwvdGV4dGFyZWE+XG4gICAgICAgIDxidXR0b24gaWQ9XCJpbXBvcnQtYWxsLWNvbmZpcm1cIiBjbGFzcz1cInN1Y2Nlc3MtYnRuXCI+SW1wb3J0IEFsbDwvYnV0dG9uPlxuICAgIGA7XG5cbiAgICBjb25zdCBidG4gPSBjb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNpbXBvcnQtYWxsLWNvbmZpcm0nKTtcbiAgICBidG4/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgYXN5bmMgKCkgPT4ge1xuICAgICAgICBjb25zdCB0eHQgPSAoY29udGVudC5xdWVyeVNlbGVjdG9yKCcjaW1wb3J0LWFsbC1hcmVhJykgYXMgSFRNTFRleHRBcmVhRWxlbWVudCkudmFsdWU7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBqc29uID0gSlNPTi5wYXJzZSh0eHQpO1xuICAgICAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGpzb24pKSB7XG4gICAgICAgICAgICAgICAgYWxlcnQoXCJJbnZhbGlkIGZvcm1hdDogRXhwZWN0ZWQgYW4gYXJyYXkgb2Ygc3RyYXRlZ2llcy5cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBWYWxpZGF0ZSBpdGVtc1xuICAgICAgICAgICAgY29uc3QgaW52YWxpZCA9IGpzb24uZmluZChzID0+ICFzLmlkIHx8ICFzLmxhYmVsKTtcbiAgICAgICAgICAgIGlmIChpbnZhbGlkKSB7XG4gICAgICAgICAgICAgICAgYWxlcnQoXCJJbnZhbGlkIHN0cmF0ZWd5IGluIGxpc3Q6IG1pc3NpbmcgSUQgb3IgTGFiZWwuXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gTWVyZ2UgbG9naWMgKFVwc2VydClcbiAgICAgICAgICAgIGNvbnN0IHN0cmF0TWFwID0gbmV3IE1hcChsb2NhbEN1c3RvbVN0cmF0ZWdpZXMubWFwKHMgPT4gW3MuaWQsIHNdKSk7XG5cbiAgICAgICAgICAgIGxldCBjb3VudCA9IDA7XG4gICAgICAgICAgICBqc29uLmZvckVhY2goKHM6IEN1c3RvbVN0cmF0ZWd5KSA9PiB7XG4gICAgICAgICAgICAgICAgc3RyYXRNYXAuc2V0KHMuaWQsIHMpO1xuICAgICAgICAgICAgICAgIGNvdW50Kys7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgY29uc3QgbmV3U3RyYXRlZ2llcyA9IEFycmF5LmZyb20oc3RyYXRNYXAudmFsdWVzKCkpO1xuXG4gICAgICAgICAgICBsb2dJbmZvKFwiSW1wb3J0aW5nIGFsbCBzdHJhdGVnaWVzXCIsIHsgY291bnQ6IG5ld1N0cmF0ZWdpZXMubGVuZ3RoIH0pO1xuXG4gICAgICAgICAgICAvLyBTYXZlXG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3NhdmVQcmVmZXJlbmNlcycsXG4gICAgICAgICAgICAgICAgcGF5bG9hZDogeyBjdXN0b21TdHJhdGVnaWVzOiBuZXdTdHJhdGVnaWVzIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBVcGRhdGUgbG9jYWwgc3RhdGVcbiAgICAgICAgICAgIGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyA9IG5ld1N0cmF0ZWdpZXM7XG4gICAgICAgICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyk7XG5cbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TG9hZE9wdGlvbnMoKTtcbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TGlzdFRhYmxlKCk7XG4gICAgICAgICAgICByZW5kZXJBbGdvcml0aG1zVmlldygpO1xuXG4gICAgICAgICAgICBhbGVydChgSW1wb3J0ZWQgJHtjb3VudH0gc3RyYXRlZ2llcy5gKTtcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5tb2RhbC1vdmVybGF5Jyk/LnJlbW92ZSgpO1xuXG4gICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgYWxlcnQoXCJJbnZhbGlkIEpTT046IFwiICsgZSk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHNob3dNb2RhbChcIkltcG9ydCBBbGwgU3RyYXRlZ2llc1wiLCBjb250ZW50KTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlQnJlYWRjcnVtYigpIHtcbiAgICBjb25zdCBicmVhZGNydW1iID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0ZWd5LWJyZWFkY3J1bWInKTtcbiAgICBpZiAoIWJyZWFkY3J1bWIpIHJldHVybjtcblxuICAgIGxldCB0ZXh0ID0gJ0FsbCc7XG5cbiAgICAvLyBGaWx0ZXJzXG4gICAgY29uc3QgZmlsdGVycyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmaWx0ZXItcm93cy1jb250YWluZXInKT8ucXVlcnlTZWxlY3RvckFsbCgnLmJ1aWxkZXItcm93Jyk7XG4gICAgaWYgKGZpbHRlcnMgJiYgZmlsdGVycy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGZpbHRlcnMuZm9yRWFjaChyb3cgPT4ge1xuICAgICAgICAgICAgIGNvbnN0IGZpZWxkID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgIGNvbnN0IG9wID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcub3BlcmF0b3Itc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgIGNvbnN0IHZhbCA9IChyb3cucXVlcnlTZWxlY3RvcignLnZhbHVlLWlucHV0JykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgaWYgKHZhbCkgdGV4dCArPSBgID4gJHtmaWVsZH0gJHtvcH0gJHt2YWx9YDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gR3JvdXBzXG4gICAgY29uc3QgZ3JvdXBzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dyb3VwLXJvd3MtY29udGFpbmVyJyk/LnF1ZXJ5U2VsZWN0b3JBbGwoJy5idWlsZGVyLXJvdycpO1xuICAgIGlmIChncm91cHMgJiYgZ3JvdXBzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgZ3JvdXBzLmZvckVhY2gocm93ID0+IHtcbiAgICAgICAgICAgICBjb25zdCBzb3VyY2UgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5zb3VyY2Utc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgIGxldCB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgIGlmIChzb3VyY2UgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICAgdmFsID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQtZmllbGQnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgICAgIHRleHQgKz0gYCA+IEdyb3VwIGJ5IEZpZWxkOiAke3ZhbH1gO1xuICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgIHZhbCA9IChyb3cucXVlcnlTZWxlY3RvcignLnZhbHVlLWlucHV0LXRleHQnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICAgICAgdGV4dCArPSBgID4gR3JvdXAgYnkgTmFtZTogXCIke3ZhbH1cImA7XG4gICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBHcm91cCBTb3J0c1xuICAgIGNvbnN0IGdyb3VwU29ydHMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JvdXAtc29ydC1yb3dzLWNvbnRhaW5lcicpPy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKTtcbiAgICBpZiAoZ3JvdXBTb3J0cyAmJiBncm91cFNvcnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgZ3JvdXBTb3J0cy5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgICAgICBjb25zdCBmaWVsZCA9IChyb3cucXVlcnlTZWxlY3RvcignLmZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgIGNvbnN0IG9yZGVyID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcub3JkZXItc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgdGV4dCArPSBgID4gR3JvdXAgc29ydCBieSAke2ZpZWxkfSAoJHtvcmRlcn0pYDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gU29ydHNcbiAgICBjb25zdCBzb3J0cyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzb3J0LXJvd3MtY29udGFpbmVyJyk/LnF1ZXJ5U2VsZWN0b3JBbGwoJy5idWlsZGVyLXJvdycpO1xuICAgIGlmIChzb3J0cyAmJiBzb3J0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHNvcnRzLmZvckVhY2gocm93ID0+IHtcbiAgICAgICAgICAgICBjb25zdCBmaWVsZCA9IChyb3cucXVlcnlTZWxlY3RvcignLmZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICBjb25zdCBvcmRlciA9IChyb3cucXVlcnlTZWxlY3RvcignLm9yZGVyLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICB0ZXh0ICs9IGAgPiBTb3J0IGJ5ICR7ZmllbGR9ICgke29yZGVyfSlgO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBicmVhZGNydW1iLnRleHRDb250ZW50ID0gdGV4dDtcbn1cblxuZnVuY3Rpb24gZ2V0QnVpbGRlclN0cmF0ZWd5KGlnbm9yZVZhbGlkYXRpb246IGJvb2xlYW4gPSBmYWxzZSk6IEN1c3RvbVN0cmF0ZWd5IHwgbnVsbCB7XG4gICAgY29uc3QgaWRJbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1uYW1lJykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICBjb25zdCBsYWJlbElucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LWRlc2MnKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuXG4gICAgbGV0IGlkID0gaWRJbnB1dCA/IGlkSW5wdXQudmFsdWUudHJpbSgpIDogJyc7XG4gICAgbGV0IGxhYmVsID0gbGFiZWxJbnB1dCA/IGxhYmVsSW5wdXQudmFsdWUudHJpbSgpIDogJyc7XG4gICAgY29uc3QgZmFsbGJhY2sgPSAnTWlzYyc7IC8vIEZhbGxiYWNrIHJlbW92ZWQgZnJvbSBVSSwgZGVmYXVsdCB0byBNaXNjXG4gICAgY29uc3Qgc29ydEdyb3VwcyA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtc29ydGdyb3Vwcy1jaGVjaycpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQ7XG5cbiAgICBpZiAoIWlnbm9yZVZhbGlkYXRpb24gJiYgKCFpZCB8fCAhbGFiZWwpKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGlmIChpZ25vcmVWYWxpZGF0aW9uKSB7XG4gICAgICAgIGlmICghaWQpIGlkID0gJ3RlbXBfc2ltX2lkJztcbiAgICAgICAgaWYgKCFsYWJlbCkgbGFiZWwgPSAnU2ltdWxhdGlvbic7XG4gICAgfVxuXG4gICAgY29uc3QgZmlsdGVyR3JvdXBzOiBSdWxlQ29uZGl0aW9uW11bXSA9IFtdO1xuICAgIGNvbnN0IGZpbHRlckNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmaWx0ZXItcm93cy1jb250YWluZXInKTtcblxuICAgIC8vIFBhcnNlIGZpbHRlciBncm91cHNcbiAgICBpZiAoZmlsdGVyQ29udGFpbmVyKSB7XG4gICAgICAgIGNvbnN0IGdyb3VwUm93cyA9IGZpbHRlckNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcuZmlsdGVyLWdyb3VwLXJvdycpO1xuICAgICAgICBpZiAoZ3JvdXBSb3dzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGdyb3VwUm93cy5mb3JFYWNoKGdyb3VwUm93ID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjb25kaXRpb25zOiBSdWxlQ29uZGl0aW9uW10gPSBbXTtcbiAgICAgICAgICAgICAgICBncm91cFJvdy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKS5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpZWxkID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBvcGVyYXRvciA9IChyb3cucXVlcnlTZWxlY3RvcignLm9wZXJhdG9yLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZSBhcyBhbnk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgLy8gT25seSBhZGQgaWYgdmFsdWUgaXMgcHJlc2VudCBvciBvcGVyYXRvciBkb2Vzbid0IHJlcXVpcmUgaXRcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlIHx8IFsnZXhpc3RzJywgJ2RvZXNOb3RFeGlzdCcsICdpc051bGwnLCAnaXNOb3ROdWxsJ10uaW5jbHVkZXMob3BlcmF0b3IpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25kaXRpb25zLnB1c2goeyBmaWVsZCwgb3BlcmF0b3IsIHZhbHVlIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKGNvbmRpdGlvbnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJHcm91cHMucHVzaChjb25kaXRpb25zKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5IC8gc2ltcGxlIHN0cmF0ZWdpZXMsIHBvcHVsYXRlIGZpbHRlcnMgd2l0aCB0aGUgZmlyc3QgZ3JvdXBcbiAgICBjb25zdCBmaWx0ZXJzOiBSdWxlQ29uZGl0aW9uW10gPSBmaWx0ZXJHcm91cHMubGVuZ3RoID4gMCA/IGZpbHRlckdyb3Vwc1swXSA6IFtdO1xuXG4gICAgY29uc3QgZ3JvdXBpbmdSdWxlczogR3JvdXBpbmdSdWxlW10gPSBbXTtcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JvdXAtcm93cy1jb250YWluZXInKT8ucXVlcnlTZWxlY3RvckFsbCgnLmJ1aWxkZXItcm93JykuZm9yRWFjaChyb3cgPT4ge1xuICAgICAgICBjb25zdCBzb3VyY2UgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5zb3VyY2Utc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlIGFzIFwiZmllbGRcIiB8IFwiZml4ZWRcIjtcbiAgICAgICAgbGV0IHZhbHVlID0gXCJcIjtcbiAgICAgICAgaWYgKHNvdXJjZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgdmFsdWUgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC1maWVsZCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQtdGV4dCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdHJhbnNmb3JtID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudHJhbnNmb3JtLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZSBhcyBhbnk7XG4gICAgICAgIGNvbnN0IHRyYW5zZm9ybVBhdHRlcm4gPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy50cmFuc2Zvcm0tcGF0dGVybicpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICBjb25zdCB3aW5kb3dNb2RlID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcud2luZG93LW1vZGUtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlIGFzIGFueTtcblxuICAgICAgICBjb25zdCByYW5kb21DaGVjayA9IHJvdy5xdWVyeVNlbGVjdG9yKCcucmFuZG9tLWNvbG9yLWNoZWNrJykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JJbnB1dCA9IHJvdy5xdWVyeVNlbGVjdG9yKCcuY29sb3ItaW5wdXQnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JGaWVsZFNlbGVjdCA9IHJvdy5xdWVyeVNlbGVjdG9yKCcuY29sb3ItZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG5cbiAgICAgICAgbGV0IGNvbG9yID0gJ3JhbmRvbSc7XG4gICAgICAgIGxldCBjb2xvckZpZWxkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgICAgICAgaWYgKCFyYW5kb21DaGVjay5jaGVja2VkKSB7XG4gICAgICAgICAgICBjb2xvciA9IGNvbG9ySW5wdXQudmFsdWU7XG4gICAgICAgICAgICBpZiAoY29sb3IgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICBjb2xvckZpZWxkID0gY29sb3JGaWVsZFNlbGVjdC52YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgZ3JvdXBpbmdSdWxlcy5wdXNoKHsgc291cmNlLCB2YWx1ZSwgY29sb3IsIGNvbG9yRmllbGQsIHRyYW5zZm9ybSwgdHJhbnNmb3JtUGF0dGVybjogdHJhbnNmb3JtID09PSAncmVnZXgnID8gdHJhbnNmb3JtUGF0dGVybiA6IHVuZGVmaW5lZCwgd2luZG93TW9kZSB9KTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29uc3Qgc29ydGluZ1J1bGVzOiBTb3J0aW5nUnVsZVtdID0gW107XG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NvcnQtcm93cy1jb250YWluZXInKT8ucXVlcnlTZWxlY3RvckFsbCgnLmJ1aWxkZXItcm93JykuZm9yRWFjaChyb3cgPT4ge1xuICAgICAgICBjb25zdCBmaWVsZCA9IChyb3cucXVlcnlTZWxlY3RvcignLmZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgY29uc3Qgb3JkZXIgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5vcmRlci1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgYXMgYW55O1xuICAgICAgICBzb3J0aW5nUnVsZXMucHVzaCh7IGZpZWxkLCBvcmRlciB9KTtcbiAgICB9KTtcblxuICAgIGNvbnN0IGdyb3VwU29ydGluZ1J1bGVzOiBTb3J0aW5nUnVsZVtdID0gW107XG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dyb3VwLXNvcnQtcm93cy1jb250YWluZXInKT8ucXVlcnlTZWxlY3RvckFsbCgnLmJ1aWxkZXItcm93JykuZm9yRWFjaChyb3cgPT4ge1xuICAgICAgICBjb25zdCBmaWVsZCA9IChyb3cucXVlcnlTZWxlY3RvcignLmZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgY29uc3Qgb3JkZXIgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5vcmRlci1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgYXMgYW55O1xuICAgICAgICBncm91cFNvcnRpbmdSdWxlcy5wdXNoKHsgZmllbGQsIG9yZGVyIH0pO1xuICAgIH0pO1xuICAgIGNvbnN0IGFwcGxpZWRHcm91cFNvcnRpbmdSdWxlcyA9IHNvcnRHcm91cHMgPyBncm91cFNvcnRpbmdSdWxlcyA6IFtdO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgaWQsXG4gICAgICAgIGxhYmVsLFxuICAgICAgICBmaWx0ZXJzLFxuICAgICAgICBmaWx0ZXJHcm91cHMsXG4gICAgICAgIGdyb3VwaW5nUnVsZXMsXG4gICAgICAgIHNvcnRpbmdSdWxlcyxcbiAgICAgICAgZ3JvdXBTb3J0aW5nUnVsZXM6IGFwcGxpZWRHcm91cFNvcnRpbmdSdWxlcyxcbiAgICAgICAgZmFsbGJhY2ssXG4gICAgICAgIHNvcnRHcm91cHNcbiAgICB9O1xufVxuXG5mdW5jdGlvbiBydW5CdWlsZGVyU2ltdWxhdGlvbigpIHtcbiAgICAvLyBQYXNzIHRydWUgdG8gaWdub3JlIHZhbGlkYXRpb24gc28gd2UgY2FuIHNpbXVsYXRlIHdpdGhvdXQgSUQvTGFiZWxcbiAgICBjb25zdCBzdHJhdCA9IGdldEJ1aWxkZXJTdHJhdGVneSh0cnVlKTtcbiAgICBjb25zdCByZXN1bHRDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1yZXN1bHRzJyk7XG4gICAgY29uc3QgbmV3U3RhdGVQYW5lbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduZXctc3RhdGUtcGFuZWwnKTtcblxuICAgIGlmICghc3RyYXQpIHJldHVybjsgLy8gU2hvdWxkIG5vdCBoYXBwZW4gd2l0aCBpZ25vcmVWYWxpZGF0aW9uPXRydWVcblxuICAgIGxvZ0luZm8oXCJSdW5uaW5nIGJ1aWxkZXIgc2ltdWxhdGlvblwiLCB7IHN0cmF0ZWd5OiBzdHJhdC5pZCB9KTtcblxuICAgIC8vIEZvciBzaW11bGF0aW9uLCB3ZSBjYW4gbW9jayBhbiBJRC9MYWJlbCBpZiBtaXNzaW5nXG4gICAgY29uc3Qgc2ltU3RyYXQ6IEN1c3RvbVN0cmF0ZWd5ID0gc3RyYXQ7XG5cbiAgICBpZiAoIXJlc3VsdENvbnRhaW5lciB8fCAhbmV3U3RhdGVQYW5lbCkgcmV0dXJuO1xuXG4gICAgLy8gU2hvdyB0aGUgcGFuZWxcbiAgICBuZXdTdGF0ZVBhbmVsLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cbiAgICAvLyBVcGRhdGUgbG9jYWxDdXN0b21TdHJhdGVnaWVzIHRlbXBvcmFyaWx5IGZvciBTaW1cbiAgICBjb25zdCBvcmlnaW5hbFN0cmF0ZWdpZXMgPSBbLi4ubG9jYWxDdXN0b21TdHJhdGVnaWVzXTtcblxuICAgIHRyeSB7XG4gICAgICAgIC8vIFJlcGxhY2Ugb3IgYWRkXG4gICAgICAgIGNvbnN0IGV4aXN0aW5nSWR4ID0gbG9jYWxDdXN0b21TdHJhdGVnaWVzLmZpbmRJbmRleChzID0+IHMuaWQgPT09IHNpbVN0cmF0LmlkKTtcbiAgICAgICAgaWYgKGV4aXN0aW5nSWR4ICE9PSAtMSkge1xuICAgICAgICAgICAgbG9jYWxDdXN0b21TdHJhdGVnaWVzW2V4aXN0aW5nSWR4XSA9IHNpbVN0cmF0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbG9jYWxDdXN0b21TdHJhdGVnaWVzLnB1c2goc2ltU3RyYXQpO1xuICAgICAgICB9XG4gICAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMobG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcblxuICAgICAgICAvLyBSdW4gTG9naWNcbiAgICAgICAgbGV0IHRhYnMgPSBnZXRNYXBwZWRUYWJzKCk7XG5cbiAgICAgICAgaWYgKHRhYnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICByZXN1bHRDb250YWluZXIuaW5uZXJIVE1MID0gJzxwPk5vIHRhYnMgZm91bmQgdG8gc2ltdWxhdGUuPC9wPic7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBBcHBseSBTaW11bGF0ZWQgU2VsZWN0aW9uIE92ZXJyaWRlXG4gICAgICAgIGlmIChzaW11bGF0ZWRTZWxlY3Rpb24uc2l6ZSA+IDApIHtcbiAgICAgICAgICAgIHRhYnMgPSB0YWJzLm1hcCh0ID0+ICh7XG4gICAgICAgICAgICAgICAgLi4udCxcbiAgICAgICAgICAgICAgICBzZWxlY3RlZDogc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKVxuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU29ydCB1c2luZyB0aGlzIHN0cmF0ZWd5P1xuICAgICAgICAvLyBzb3J0VGFicyBleHBlY3RzIFNvcnRpbmdTdHJhdGVneVtdLlxuICAgICAgICAvLyBJZiB3ZSB1c2UgdGhpcyBzdHJhdGVneSBmb3Igc29ydGluZy4uLlxuICAgICAgICB0YWJzID0gc29ydFRhYnModGFicywgW3NpbVN0cmF0LmlkXSk7XG5cbiAgICAgICAgLy8gR3JvdXAgdXNpbmcgdGhpcyBzdHJhdGVneVxuICAgICAgICBjb25zdCBncm91cHMgPSBncm91cFRhYnModGFicywgW3NpbVN0cmF0LmlkXSk7XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgd2Ugc2hvdWxkIHNob3cgYSBmYWxsYmFjayByZXN1bHQgKGUuZy4gU29ydCBPbmx5KVxuICAgICAgICAvLyBJZiBubyBncm91cHMgd2VyZSBjcmVhdGVkLCBidXQgd2UgaGF2ZSB0YWJzLCBhbmQgdGhlIHN0cmF0ZWd5IGlzIG5vdCBhIGdyb3VwaW5nIHN0cmF0ZWd5LFxuICAgICAgICAvLyB3ZSBzaG93IHRoZSB0YWJzIGFzIGEgc2luZ2xlIGxpc3QuXG4gICAgICAgIGlmIChncm91cHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBjb25zdCBzdHJhdERlZiA9IGdldFN0cmF0ZWdpZXMobG9jYWxDdXN0b21TdHJhdGVnaWVzKS5maW5kKHMgPT4gcy5pZCA9PT0gc2ltU3RyYXQuaWQpO1xuICAgICAgICAgICAgaWYgKHN0cmF0RGVmICYmICFzdHJhdERlZi5pc0dyb3VwaW5nKSB7XG4gICAgICAgICAgICAgICAgZ3JvdXBzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBpZDogJ3NpbS1zb3J0ZWQnLFxuICAgICAgICAgICAgICAgICAgICB3aW5kb3dJZDogMCxcbiAgICAgICAgICAgICAgICAgICAgbGFiZWw6ICdTb3J0ZWQgUmVzdWx0cyAoTm8gR3JvdXBpbmcpJyxcbiAgICAgICAgICAgICAgICAgICAgY29sb3I6ICdncmV5JyxcbiAgICAgICAgICAgICAgICAgICAgdGFiczogdGFicyxcbiAgICAgICAgICAgICAgICAgICAgcmVhc29uOiAnU29ydCBPbmx5J1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVuZGVyIFJlc3VsdHNcbiAgICAgICAgaWYgKGdyb3Vwcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJlc3VsdENvbnRhaW5lci5pbm5lckhUTUwgPSAnPHA+Tm8gZ3JvdXBzIGNyZWF0ZWQuPC9wPic7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICByZXN1bHRDb250YWluZXIuaW5uZXJIVE1MID0gZ3JvdXBzLm1hcChncm91cCA9PiBgXG4gICAgPGRpdiBjbGFzcz1cImdyb3VwLXJlc3VsdFwiIHN0eWxlPVwibWFyZ2luLWJvdHRvbTogMTBweDsgYm9yZGVyOiAxcHggc29saWQgI2RkZDsgYm9yZGVyLXJhZGl1czogNHB4OyBvdmVyZmxvdzogaGlkZGVuO1wiPlxuICAgICAgPGRpdiBjbGFzcz1cImdyb3VwLWhlYWRlclwiIHN0eWxlPVwiYm9yZGVyLWxlZnQ6IDVweCBzb2xpZCAke2dyb3VwLmNvbG9yfTsgcGFkZGluZzogNXB4OyBiYWNrZ3JvdW5kOiAjZjhmOWZhOyBmb250LXNpemU6IDAuOWVtOyBmb250LXdlaWdodDogYm9sZDsgZGlzcGxheTogZmxleDsganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuO1wiPlxuICAgICAgICA8c3Bhbj4ke2VzY2FwZUh0bWwoZ3JvdXAubGFiZWwgfHwgJ1VuZ3JvdXBlZCcpfTwvc3Bhbj5cbiAgICAgICAgPHNwYW4gY2xhc3M9XCJncm91cC1tZXRhXCIgc3R5bGU9XCJmb250LXdlaWdodDogbm9ybWFsOyBmb250LXNpemU6IDAuOGVtOyBjb2xvcjogIzY2NjtcIj4ke2dyb3VwLnRhYnMubGVuZ3RofTwvc3Bhbj5cbiAgICAgIDwvZGl2PlxuICAgICAgPHVsIGNsYXNzPVwiZ3JvdXAtdGFic1wiIHN0eWxlPVwibGlzdC1zdHlsZTogbm9uZTsgbWFyZ2luOiAwOyBwYWRkaW5nOiAwO1wiPlxuICAgICAgICAke2dyb3VwLnRhYnMubWFwKHRhYiA9PiBgXG4gICAgICAgICAgPGxpIGNsYXNzPVwiZ3JvdXAtdGFiLWl0ZW1cIiBzdHlsZT1cInBhZGRpbmc6IDRweCA1cHg7IGJvcmRlci10b3A6IDFweCBzb2xpZCAjZWVlOyBkaXNwbGF5OiBmbGV4OyBnYXA6IDVweDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZm9udC1zaXplOiAwLjg1ZW07XCI+XG4gICAgICAgICAgICA8ZGl2IHN0eWxlPVwid2lkdGg6IDEycHg7IGhlaWdodDogMTJweDsgYmFja2dyb3VuZDogI2VlZTsgYm9yZGVyLXJhZGl1czogMnB4OyBmbGV4LXNocmluazogMDtcIj5cbiAgICAgICAgICAgICAgICAke3RhYi5mYXZJY29uVXJsID8gYDxpbWcgc3JjPVwiJHt0YWIuZmF2SWNvblVybH1cIiBzdHlsZT1cIndpZHRoOiAxMDAlOyBoZWlnaHQ6IDEwMCU7IG9iamVjdC1maXQ6IGNvdmVyO1wiIG9uZXJyb3I9XCJ0aGlzLnN0eWxlLmRpc3BsYXk9J25vbmUnXCI+YCA6ICcnfVxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cInRpdGxlLWNlbGxcIiB0aXRsZT1cIiR7ZXNjYXBlSHRtbCh0YWIudGl0bGUpfVwiIHN0eWxlPVwid2hpdGUtc3BhY2U6IG5vd3JhcDsgb3ZlcmZsb3c6IGhpZGRlbjsgdGV4dC1vdmVyZmxvdzogZWxsaXBzaXM7XCI+JHtlc2NhcGVIdG1sKHRhYi50aXRsZSl9PC9zcGFuPlxuICAgICAgICAgIDwvbGk+XG4gICAgICAgIGApLmpvaW4oJycpfVxuICAgICAgPC91bD5cbiAgICA8L2Rpdj5cbiAgYCkuam9pbignJyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiU2ltdWxhdGlvbiBmYWlsZWRcIiwgZSk7XG4gICAgICAgIHJlc3VsdENvbnRhaW5lci5pbm5lckhUTUwgPSBgPHAgc3R5bGU9XCJjb2xvcjogcmVkO1wiPlNpbXVsYXRpb24gZmFpbGVkOiAke2V9PC9wPmA7XG4gICAgICAgIGFsZXJ0KFwiU2ltdWxhdGlvbiBmYWlsZWQ6IFwiICsgZSk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgICAgLy8gUmVzdG9yZSBzdHJhdGVnaWVzXG4gICAgICAgIGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyA9IG9yaWdpbmFsU3RyYXRlZ2llcztcbiAgICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhsb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gc2F2ZUN1c3RvbVN0cmF0ZWd5RnJvbUJ1aWxkZXIoc2hvd1N1Y2Nlc3MgPSB0cnVlKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3Qgc3RyYXQgPSBnZXRCdWlsZGVyU3RyYXRlZ3koKTtcbiAgICBpZiAoIXN0cmF0KSB7XG4gICAgICAgIGFsZXJ0KFwiUGxlYXNlIGZpbGwgaW4gSUQgYW5kIExhYmVsLlwiKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gc2F2ZVN0cmF0ZWd5KHN0cmF0LCBzaG93U3VjY2Vzcyk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHNhdmVTdHJhdGVneShzdHJhdDogQ3VzdG9tU3RyYXRlZ3ksIHNob3dTdWNjZXNzOiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgdHJ5IHtcbiAgICAgICAgbG9nSW5mbyhcIlNhdmluZyBzdHJhdGVneVwiLCB7IGlkOiBzdHJhdC5pZCB9KTtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2FkUHJlZmVyZW5jZXMnIH0pO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgICAgICAgY29uc3QgcHJlZnMgPSByZXNwb25zZS5kYXRhIGFzIFByZWZlcmVuY2VzO1xuICAgICAgICAgICAgbGV0IGN1cnJlbnRTdHJhdGVnaWVzID0gcHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXTtcblxuICAgICAgICAgICAgLy8gRmluZCBleGlzdGluZyB0byBwcmVzZXJ2ZSBwcm9wcyAobGlrZSBhdXRvUnVuKVxuICAgICAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBjdXJyZW50U3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXQuaWQpO1xuICAgICAgICAgICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICAgICAgICAgICAgc3RyYXQuYXV0b1J1biA9IGV4aXN0aW5nLmF1dG9SdW47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFJlbW92ZSBleGlzdGluZyBpZiBzYW1lIElEXG4gICAgICAgICAgICBjdXJyZW50U3RyYXRlZ2llcyA9IGN1cnJlbnRTdHJhdGVnaWVzLmZpbHRlcihzID0+IHMuaWQgIT09IHN0cmF0LmlkKTtcbiAgICAgICAgICAgIGN1cnJlbnRTdHJhdGVnaWVzLnB1c2goc3RyYXQpO1xuXG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3NhdmVQcmVmZXJlbmNlcycsXG4gICAgICAgICAgICAgICAgcGF5bG9hZDogeyBjdXN0b21TdHJhdGVnaWVzOiBjdXJyZW50U3RyYXRlZ2llcyB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgbG9jYWxDdXN0b21TdHJhdGVnaWVzID0gY3VycmVudFN0cmF0ZWdpZXM7XG4gICAgICAgICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyk7XG5cbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TG9hZE9wdGlvbnMoKTtcbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TGlzdFRhYmxlKCk7XG4gICAgICAgICAgICByZW5kZXJBbGdvcml0aG1zVmlldygpO1xuICAgICAgICAgICAgaWYgKHNob3dTdWNjZXNzKSBhbGVydChcIlN0cmF0ZWd5IHNhdmVkIVwiKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gc2F2ZSBzdHJhdGVneVwiLCBlKTtcbiAgICAgICAgYWxlcnQoXCJFcnJvciBzYXZpbmcgc3RyYXRlZ3lcIik7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJ1bkJ1aWxkZXJMaXZlKCkge1xuICAgIGNvbnN0IHN0cmF0ID0gZ2V0QnVpbGRlclN0cmF0ZWd5KCk7XG4gICAgaWYgKCFzdHJhdCkge1xuICAgICAgICBhbGVydChcIlBsZWFzZSBmaWxsIGluIElEIGFuZCBMYWJlbCB0byBydW4gbGl2ZS5cIik7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsb2dJbmZvKFwiQXBwbHlpbmcgc3RyYXRlZ3kgbGl2ZVwiLCB7IGlkOiBzdHJhdC5pZCB9KTtcblxuICAgIC8vIFNhdmUgc2lsZW50bHkgZmlyc3QgdG8gZW5zdXJlIGJhY2tlbmQgaGFzIHRoZSBkZWZpbml0aW9uXG4gICAgY29uc3Qgc2F2ZWQgPSBhd2FpdCBzYXZlU3RyYXRlZ3koc3RyYXQsIGZhbHNlKTtcbiAgICBpZiAoIXNhdmVkKSByZXR1cm47XG5cbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgIHR5cGU6ICdhcHBseUdyb3VwaW5nJyxcbiAgICAgICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICAgICAgICBzb3J0aW5nOiBbc3RyYXQuaWRdXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vaykge1xuICAgICAgICAgICAgYWxlcnQoXCJBcHBsaWVkIHN1Y2Nlc3NmdWxseSFcIik7XG4gICAgICAgICAgICBsb2FkVGFicygpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYWxlcnQoXCJGYWlsZWQgdG8gYXBwbHk6IFwiICsgKHJlc3BvbnNlLmVycm9yIHx8ICdVbmtub3duIGVycm9yJykpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiQXBwbHkgZmFpbGVkXCIsIGUpO1xuICAgICAgICBhbGVydChcIkFwcGx5IGZhaWxlZDogXCIgKyBlKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHBvcHVsYXRlQnVpbGRlckZyb21TdHJhdGVneShzdHJhdDogQ3VzdG9tU3RyYXRlZ3kpIHtcbiAgICAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LW5hbWUnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSA9IHN0cmF0LmlkO1xuICAgIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtZGVzYycpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gc3RyYXQubGFiZWw7XG5cbiAgICBjb25zdCBzb3J0R3JvdXBzQ2hlY2sgPSAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LXNvcnRncm91cHMtY2hlY2snKSBhcyBIVE1MSW5wdXRFbGVtZW50KTtcbiAgICBjb25zdCBoYXNHcm91cFNvcnQgPSAhIShzdHJhdC5ncm91cFNvcnRpbmdSdWxlcyAmJiBzdHJhdC5ncm91cFNvcnRpbmdSdWxlcy5sZW5ndGggPiAwKSB8fCAhIXN0cmF0LnNvcnRHcm91cHM7XG4gICAgc29ydEdyb3Vwc0NoZWNrLmNoZWNrZWQgPSBoYXNHcm91cFNvcnQ7XG4gICAgc29ydEdyb3Vwc0NoZWNrLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnKSk7XG5cbiAgICBjb25zdCBhdXRvUnVuQ2hlY2sgPSAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LWF1dG9ydW4nKSBhcyBIVE1MSW5wdXRFbGVtZW50KTtcbiAgICBhdXRvUnVuQ2hlY2suY2hlY2tlZCA9ICEhc3RyYXQuYXV0b1J1bjtcblxuICAgIFsnZmlsdGVyLXJvd3MtY29udGFpbmVyJywgJ2dyb3VwLXJvd3MtY29udGFpbmVyJywgJ3NvcnQtcm93cy1jb250YWluZXInLCAnZ3JvdXAtc29ydC1yb3dzLWNvbnRhaW5lciddLmZvckVhY2goaWQgPT4ge1xuICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKTtcbiAgICAgICAgaWYgKGVsKSBlbC5pbm5lckhUTUwgPSAnJztcbiAgICB9KTtcblxuICAgIGlmIChzdHJhdC5maWx0ZXJHcm91cHMgJiYgc3RyYXQuZmlsdGVyR3JvdXBzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgc3RyYXQuZmlsdGVyR3JvdXBzLmZvckVhY2goZyA9PiBhZGRGaWx0ZXJHcm91cFJvdyhnKSk7XG4gICAgfSBlbHNlIGlmIChzdHJhdC5maWx0ZXJzICYmIHN0cmF0LmZpbHRlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICBhZGRGaWx0ZXJHcm91cFJvdyhzdHJhdC5maWx0ZXJzKTtcbiAgICB9XG5cbiAgICBzdHJhdC5ncm91cGluZ1J1bGVzPy5mb3JFYWNoKGcgPT4gYWRkQnVpbGRlclJvdygnZ3JvdXAnLCBnKSk7XG4gICAgc3RyYXQuc29ydGluZ1J1bGVzPy5mb3JFYWNoKHMgPT4gYWRkQnVpbGRlclJvdygnc29ydCcsIHMpKTtcbiAgICBzdHJhdC5ncm91cFNvcnRpbmdSdWxlcz8uZm9yRWFjaChncyA9PiBhZGRCdWlsZGVyUm93KCdncm91cFNvcnQnLCBncykpO1xuXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI3ZpZXctc3RyYXRlZ2llcycpPy5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnc21vb3RoJyB9KTtcbiAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlclN0cmF0ZWd5TG9hZE9wdGlvbnMoKSB7XG4gICAgY29uc3Qgc2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0ZWd5LWxvYWQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQgfCBudWxsO1xuICAgIGlmICghc2VsZWN0KSByZXR1cm47XG5cbiAgICBjb25zdCBjdXN0b21PcHRpb25zID0gbG9jYWxDdXN0b21TdHJhdGVnaWVzXG4gICAgICAgIC5zbGljZSgpXG4gICAgICAgIC5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpXG4gICAgICAgIC5tYXAoc3RyYXRlZ3kgPT4gYFxuICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIiR7ZXNjYXBlSHRtbChzdHJhdGVneS5pZCl9XCI+JHtlc2NhcGVIdG1sKHN0cmF0ZWd5LmxhYmVsKX0gKCR7ZXNjYXBlSHRtbChzdHJhdGVneS5pZCl9KTwvb3B0aW9uPlxuICAgICAgICBgKS5qb2luKCcnKTtcblxuICAgIGNvbnN0IGJ1aWx0SW5PcHRpb25zID0gU1RSQVRFR0lFU1xuICAgICAgICAuZmlsdGVyKHMgPT4gIWxvY2FsQ3VzdG9tU3RyYXRlZ2llcy5zb21lKGNzID0+IGNzLmlkID09PSBzLmlkKSlcbiAgICAgICAgLm1hcChzdHJhdGVneSA9PiBgXG4gICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiJHtlc2NhcGVIdG1sKHN0cmF0ZWd5LmlkIGFzIHN0cmluZyl9XCI+JHtlc2NhcGVIdG1sKHN0cmF0ZWd5LmxhYmVsKX0gKEJ1aWx0LWluKTwvb3B0aW9uPlxuICAgICAgICBgKS5qb2luKCcnKTtcblxuICAgIHNlbGVjdC5pbm5lckhUTUwgPSBgPG9wdGlvbiB2YWx1ZT1cIlwiPkxvYWQgc2F2ZWQgc3RyYXRlZ3kuLi48L29wdGlvbj5gICtcbiAgICAgICAgKGN1c3RvbU9wdGlvbnMgPyBgPG9wdGdyb3VwIGxhYmVsPVwiQ3VzdG9tIFN0cmF0ZWdpZXNcIj4ke2N1c3RvbU9wdGlvbnN9PC9vcHRncm91cD5gIDogJycpICtcbiAgICAgICAgKGJ1aWx0SW5PcHRpb25zID8gYDxvcHRncm91cCBsYWJlbD1cIkJ1aWx0LWluIFN0cmF0ZWdpZXNcIj4ke2J1aWx0SW5PcHRpb25zfTwvb3B0Z3JvdXA+YCA6ICcnKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyU3RyYXRlZ3lMaXN0VGFibGUoKSB7XG4gICAgY29uc3QgdGFibGVCb2R5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0ZWd5LXRhYmxlLWJvZHknKTtcbiAgICBpZiAoIXRhYmxlQm9keSkgcmV0dXJuO1xuXG4gICAgY29uc3QgY3VzdG9tSWRzID0gbmV3IFNldChsb2NhbEN1c3RvbVN0cmF0ZWdpZXMubWFwKHN0cmF0ZWd5ID0+IHN0cmF0ZWd5LmlkKSk7XG4gICAgY29uc3QgYnVpbHRJblJvd3MgPSBTVFJBVEVHSUVTLm1hcChzdHJhdGVneSA9PiAoe1xuICAgICAgICAuLi5zdHJhdGVneSxcbiAgICAgICAgc291cmNlTGFiZWw6ICdCdWlsdC1pbicsXG4gICAgICAgIGNvbmZpZ1N1bW1hcnk6ICdcdTIwMTQnLFxuICAgICAgICBhdXRvUnVuTGFiZWw6ICdcdTIwMTQnLFxuICAgICAgICBhY3Rpb25zOiAnJ1xuICAgIH0pKTtcblxuICAgIGNvbnN0IGN1c3RvbVJvd3MgPSBsb2NhbEN1c3RvbVN0cmF0ZWdpZXMubWFwKHN0cmF0ZWd5ID0+IHtcbiAgICAgICAgY29uc3Qgb3ZlcnJpZGVzQnVpbHRJbiA9IGN1c3RvbUlkcy5oYXMoc3RyYXRlZ3kuaWQpICYmIFNUUkFURUdJRVMuc29tZShidWlsdEluID0+IGJ1aWx0SW4uaWQgPT09IHN0cmF0ZWd5LmlkKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGlkOiBzdHJhdGVneS5pZCxcbiAgICAgICAgICAgIGxhYmVsOiBzdHJhdGVneS5sYWJlbCxcbiAgICAgICAgICAgIGlzR3JvdXBpbmc6IHRydWUsXG4gICAgICAgICAgICBpc1NvcnRpbmc6IHRydWUsXG4gICAgICAgICAgICBzb3VyY2VMYWJlbDogb3ZlcnJpZGVzQnVpbHRJbiA/ICdDdXN0b20gKG92ZXJyaWRlcyBidWlsdC1pbiknIDogJ0N1c3RvbScsXG4gICAgICAgICAgICBjb25maWdTdW1tYXJ5OiBgRmlsdGVyczogJHtzdHJhdGVneS5maWx0ZXJzPy5sZW5ndGggfHwgMH0sIEdyb3VwczogJHtzdHJhdGVneS5ncm91cGluZ1J1bGVzPy5sZW5ndGggfHwgMH0sIFNvcnRzOiAke3N0cmF0ZWd5LnNvcnRpbmdSdWxlcz8ubGVuZ3RoIHx8IDB9YCxcbiAgICAgICAgICAgIGF1dG9SdW5MYWJlbDogc3RyYXRlZ3kuYXV0b1J1biA/ICdZZXMnIDogJ05vJyxcbiAgICAgICAgICAgIGFjdGlvbnM6IGA8YnV0dG9uIGNsYXNzPVwiZGVsZXRlLXN0cmF0ZWd5LXJvd1wiIGRhdGEtaWQ9XCIke2VzY2FwZUh0bWwoc3RyYXRlZ3kuaWQpfVwiIHN0eWxlPVwiY29sb3I6IHJlZDtcIj5EZWxldGU8L2J1dHRvbj5gXG4gICAgICAgIH07XG4gICAgfSk7XG5cbiAgICBjb25zdCBhbGxSb3dzID0gWy4uLmJ1aWx0SW5Sb3dzLCAuLi5jdXN0b21Sb3dzXTtcblxuICAgIGlmIChhbGxSb3dzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICB0YWJsZUJvZHkuaW5uZXJIVE1MID0gJzx0cj48dGQgY29sc3Bhbj1cIjdcIiBzdHlsZT1cImNvbG9yOiAjODg4O1wiPk5vIHN0cmF0ZWdpZXMgZm91bmQuPC90ZD48L3RyPic7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0YWJsZUJvZHkuaW5uZXJIVE1MID0gYWxsUm93cy5tYXAocm93ID0+IHtcbiAgICAgICAgY29uc3QgY2FwYWJpbGl0aWVzID0gW3Jvdy5pc0dyb3VwaW5nID8gJ0dyb3VwaW5nJyA6IG51bGwsIHJvdy5pc1NvcnRpbmcgPyAnU29ydGluZycgOiBudWxsXS5maWx0ZXIoQm9vbGVhbikuam9pbignLCAnKTtcbiAgICAgICAgcmV0dXJuIGBcbiAgICAgICAgPHRyPlxuICAgICAgICAgICAgPHRkPiR7ZXNjYXBlSHRtbChyb3cubGFiZWwpfTwvdGQ+XG4gICAgICAgICAgICA8dGQ+JHtlc2NhcGVIdG1sKFN0cmluZyhyb3cuaWQpKX08L3RkPlxuICAgICAgICAgICAgPHRkPiR7ZXNjYXBlSHRtbChyb3cuc291cmNlTGFiZWwpfTwvdGQ+XG4gICAgICAgICAgICA8dGQ+JHtlc2NhcGVIdG1sKGNhcGFiaWxpdGllcyl9PC90ZD5cbiAgICAgICAgICAgIDx0ZD4ke2VzY2FwZUh0bWwocm93LmNvbmZpZ1N1bW1hcnkpfTwvdGQ+XG4gICAgICAgICAgICA8dGQ+JHtlc2NhcGVIdG1sKHJvdy5hdXRvUnVuTGFiZWwpfTwvdGQ+XG4gICAgICAgICAgICA8dGQ+JHtyb3cuYWN0aW9uc308L3RkPlxuICAgICAgICA8L3RyPlxuICAgICAgICBgO1xuICAgIH0pLmpvaW4oJycpO1xuXG4gICAgdGFibGVCb2R5LnF1ZXJ5U2VsZWN0b3JBbGwoJy5kZWxldGUtc3RyYXRlZ3ktcm93JykuZm9yRWFjaChidG4gPT4ge1xuICAgICAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgaWQgPSAoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQuaWQ7XG4gICAgICAgICAgICBpZiAoaWQgJiYgY29uZmlybShgRGVsZXRlIHN0cmF0ZWd5IFwiJHtpZH1cIj9gKSkge1xuICAgICAgICAgICAgICAgIGF3YWl0IGRlbGV0ZUN1c3RvbVN0cmF0ZWd5KGlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRlbGV0ZUN1c3RvbVN0cmF0ZWd5KGlkOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgICBsb2dJbmZvKFwiRGVsZXRpbmcgc3RyYXRlZ3lcIiwgeyBpZCB9KTtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2FkUHJlZmVyZW5jZXMnIH0pO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgICAgICAgY29uc3QgcHJlZnMgPSByZXNwb25zZS5kYXRhIGFzIFByZWZlcmVuY2VzO1xuICAgICAgICAgICAgY29uc3QgbmV3U3RyYXRlZ2llcyA9IChwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdKS5maWx0ZXIocyA9PiBzLmlkICE9PSBpZCk7XG5cbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnc2F2ZVByZWZlcmVuY2VzJyxcbiAgICAgICAgICAgICAgICBwYXlsb2FkOiB7IGN1c3RvbVN0cmF0ZWdpZXM6IG5ld1N0cmF0ZWdpZXMgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyA9IG5ld1N0cmF0ZWdpZXM7XG4gICAgICAgICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgICAgICAgICByZW5kZXJTdHJhdGVneUxvYWRPcHRpb25zKCk7XG4gICAgICAgICAgICByZW5kZXJTdHJhdGVneUxpc3RUYWJsZSgpO1xuICAgICAgICAgICAgcmVuZGVyQWxnb3JpdGhtc1ZpZXcoKTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBkZWxldGUgc3RyYXRlZ3lcIiwgZSk7XG4gICAgfVxufVxuXG4vLyAuLi4gR2VuZXJhIG1hbmFnZW1lbnQgLi4uIChrZXB0IGFzIGlzKVxuZnVuY3Rpb24gcmVuZGVyQ3VzdG9tR2VuZXJhTGlzdChjdXN0b21HZW5lcmE6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pIHtcbiAgICBjb25zdCBsaXN0Q29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2N1c3RvbS1nZW5lcmEtbGlzdCcpO1xuICAgIGlmICghbGlzdENvbnRhaW5lcikgcmV0dXJuO1xuXG4gICAgaWYgKE9iamVjdC5rZXlzKGN1c3RvbUdlbmVyYSkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIGxpc3RDb250YWluZXIuaW5uZXJIVE1MID0gJzxwIHN0eWxlPVwiY29sb3I6ICM4ODg7IGZvbnQtc3R5bGU6IGl0YWxpYztcIj5ObyBjdXN0b20gZW50cmllcy48L3A+JztcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxpc3RDb250YWluZXIuaW5uZXJIVE1MID0gT2JqZWN0LmVudHJpZXMoY3VzdG9tR2VuZXJhKS5tYXAoKFtkb21haW4sIGNhdGVnb3J5XSkgPT4gYFxuICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuOyBhbGlnbi1pdGVtczogY2VudGVyOyBwYWRkaW5nOiA1cHg7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAjZjBmMGYwO1wiPlxuICAgICAgICAgICAgPHNwYW4+PGI+JHtlc2NhcGVIdG1sKGRvbWFpbil9PC9iPjogJHtlc2NhcGVIdG1sKGNhdGVnb3J5KX08L3NwYW4+XG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZGVsZXRlLWdlbmVyYS1idG5cIiBkYXRhLWRvbWFpbj1cIiR7ZXNjYXBlSHRtbChkb21haW4pfVwiIHN0eWxlPVwiYmFja2dyb3VuZDogbm9uZTsgYm9yZGVyOiBub25lOyBjb2xvcjogcmVkOyBjdXJzb3I6IHBvaW50ZXI7XCI+JnRpbWVzOzwvYnV0dG9uPlxuICAgICAgICA8L2Rpdj5cbiAgICBgKS5qb2luKCcnKTtcblxuICAgIC8vIFJlLWF0dGFjaCBsaXN0ZW5lcnMgZm9yIGRlbGV0ZSBidXR0b25zXG4gICAgbGlzdENvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcuZGVsZXRlLWdlbmVyYS1idG4nKS5mb3JFYWNoKGJ0biA9PiB7XG4gICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBkb21haW4gPSAoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQuZG9tYWluO1xuICAgICAgICAgICAgaWYgKGRvbWFpbikge1xuICAgICAgICAgICAgICAgIGF3YWl0IGRlbGV0ZUN1c3RvbUdlbmVyYShkb21haW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gYWRkQ3VzdG9tR2VuZXJhKCkge1xuICAgIGNvbnN0IGRvbWFpbklucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25ldy1nZW5lcmEtZG9tYWluJykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICBjb25zdCBjYXRlZ29yeUlucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25ldy1nZW5lcmEtY2F0ZWdvcnknKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuXG4gICAgaWYgKCFkb21haW5JbnB1dCB8fCAhY2F0ZWdvcnlJbnB1dCkgcmV0dXJuO1xuXG4gICAgY29uc3QgZG9tYWluID0gZG9tYWluSW5wdXQudmFsdWUudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgY2F0ZWdvcnkgPSBjYXRlZ29yeUlucHV0LnZhbHVlLnRyaW0oKTtcblxuICAgIGlmICghZG9tYWluIHx8ICFjYXRlZ29yeSkge1xuICAgICAgICBhbGVydChcIlBsZWFzZSBlbnRlciBib3RoIGRvbWFpbiBhbmQgY2F0ZWdvcnkuXCIpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbG9nSW5mbyhcIkFkZGluZyBjdXN0b20gZ2VuZXJhXCIsIHsgZG9tYWluLCBjYXRlZ29yeSB9KTtcblxuICAgIHRyeSB7XG4gICAgICAgIC8vIEZldGNoIGN1cnJlbnQgdG8gbWVyZ2VcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2FkUHJlZmVyZW5jZXMnIH0pO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgICAgICAgY29uc3QgcHJlZnMgPSByZXNwb25zZS5kYXRhIGFzIFByZWZlcmVuY2VzO1xuICAgICAgICAgICAgY29uc3QgbmV3Q3VzdG9tR2VuZXJhID0geyAuLi4ocHJlZnMuY3VzdG9tR2VuZXJhIHx8IHt9KSwgW2RvbWFpbl06IGNhdGVnb3J5IH07XG5cbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnc2F2ZVByZWZlcmVuY2VzJyxcbiAgICAgICAgICAgICAgICBwYXlsb2FkOiB7IGN1c3RvbUdlbmVyYTogbmV3Q3VzdG9tR2VuZXJhIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBkb21haW5JbnB1dC52YWx1ZSA9ICcnO1xuICAgICAgICAgICAgY2F0ZWdvcnlJbnB1dC52YWx1ZSA9ICcnO1xuICAgICAgICAgICAgbG9hZEN1c3RvbUdlbmVyYSgpO1xuICAgICAgICAgICAgbG9hZFRhYnMoKTsgLy8gUmVmcmVzaCB0YWJzIHRvIGFwcGx5IG5ldyBjbGFzc2lmaWNhdGlvbiBpZiByZWxldmFudFxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGFkZCBjdXN0b20gZ2VuZXJhXCIsIGUpO1xuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZGVsZXRlQ3VzdG9tR2VuZXJhKGRvbWFpbjogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgbG9nSW5mbyhcIkRlbGV0aW5nIGN1c3RvbSBnZW5lcmFcIiwgeyBkb21haW4gfSk7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9hZFByZWZlcmVuY2VzJyB9KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgIGNvbnN0IHByZWZzID0gcmVzcG9uc2UuZGF0YSBhcyBQcmVmZXJlbmNlcztcbiAgICAgICAgICAgIGNvbnN0IG5ld0N1c3RvbUdlbmVyYSA9IHsgLi4uKHByZWZzLmN1c3RvbUdlbmVyYSB8fCB7fSkgfTtcbiAgICAgICAgICAgIGRlbGV0ZSBuZXdDdXN0b21HZW5lcmFbZG9tYWluXTtcblxuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIHBheWxvYWQ6IHsgY3VzdG9tR2VuZXJhOiBuZXdDdXN0b21HZW5lcmEgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGxvYWRDdXN0b21HZW5lcmEoKTtcbiAgICAgICAgICAgIGxvYWRUYWJzKCk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gZGVsZXRlIGN1c3RvbSBnZW5lcmFcIiwgZSk7XG4gICAgfVxufVxuXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChldmVudCkgPT4ge1xuICAgIGNvbnN0IHRhcmdldCA9IGV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgaWYgKHRhcmdldCAmJiB0YXJnZXQuaWQgPT09ICdhZGQtZ2VuZXJhLWJ0bicpIHtcbiAgICAgICAgYWRkQ3VzdG9tR2VuZXJhKCk7XG4gICAgfVxufSk7XG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRUYWJzKCkge1xuICBsb2dJbmZvKFwiTG9hZGluZyB0YWJzIGZvciBEZXZUb29sc1wiKTtcbiAgY29uc3QgdGFicyA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHt9KTtcbiAgY3VycmVudFRhYnMgPSB0YWJzO1xuXG4gIGNvbnN0IHRvdGFsVGFic0VsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3RvdGFsVGFicycpO1xuICBpZiAodG90YWxUYWJzRWwpIHtcbiAgICB0b3RhbFRhYnNFbC50ZXh0Q29udGVudCA9IHRhYnMubGVuZ3RoLnRvU3RyaW5nKCk7XG4gIH1cblxuICAvLyBDcmVhdGUgYSBtYXAgb2YgdGFiIElEIHRvIHRpdGxlIGZvciBwYXJlbnQgbG9va3VwXG4gIHRhYlRpdGxlcy5jbGVhcigpO1xuICB0YWJzLmZvckVhY2godGFiID0+IHtcbiAgICBpZiAodGFiLmlkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHRhYlRpdGxlcy5zZXQodGFiLmlkLCB0YWIudGl0bGUgfHwgJ1VudGl0bGVkJyk7XG4gICAgfVxuICB9KTtcblxuICAvLyBDb252ZXJ0IHRvIFRhYk1ldGFkYXRhIGZvciBjb250ZXh0IGFuYWx5c2lzXG4gIGNvbnN0IG1hcHBlZFRhYnM6IFRhYk1ldGFkYXRhW10gPSBnZXRNYXBwZWRUYWJzKCk7XG5cbiAgLy8gQW5hbHl6ZSBjb250ZXh0XG4gIHRyeSB7XG4gICAgICBjdXJyZW50Q29udGV4dE1hcCA9IGF3YWl0IGFuYWx5emVUYWJDb250ZXh0KG1hcHBlZFRhYnMpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBhbmFseXplIGNvbnRleHRcIiwgZXJyb3IpO1xuICAgICAgY3VycmVudENvbnRleHRNYXAuY2xlYXIoKTtcbiAgfVxuXG4gIHJlbmRlclRhYmxlKCk7XG59XG5cbmZ1bmN0aW9uIGdldE1hcHBlZFRhYnMoKTogVGFiTWV0YWRhdGFbXSB7XG4gIHJldHVybiBjdXJyZW50VGFic1xuICAgIC5tYXAodGFiID0+IHtcbiAgICAgICAgY29uc3QgbWV0YWRhdGEgPSBtYXBDaHJvbWVUYWIodGFiKTtcbiAgICAgICAgaWYgKCFtZXRhZGF0YSkgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgY29uc3QgY29udGV4dFJlc3VsdCA9IGN1cnJlbnRDb250ZXh0TWFwLmdldChtZXRhZGF0YS5pZCk7XG4gICAgICAgIGlmIChjb250ZXh0UmVzdWx0KSB7XG4gICAgICAgICAgICBtZXRhZGF0YS5jb250ZXh0ID0gY29udGV4dFJlc3VsdC5jb250ZXh0O1xuICAgICAgICAgICAgbWV0YWRhdGEuY29udGV4dERhdGEgPSBjb250ZXh0UmVzdWx0LmRhdGE7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1ldGFkYXRhO1xuICAgIH0pXG4gICAgLmZpbHRlcigodCk6IHQgaXMgVGFiTWV0YWRhdGEgPT4gdCAhPT0gbnVsbCk7XG59XG5cbmZ1bmN0aW9uIGhhbmRsZVNvcnQoa2V5OiBzdHJpbmcpIHtcbiAgaWYgKHNvcnRLZXkgPT09IGtleSkge1xuICAgIHNvcnREaXJlY3Rpb24gPSBzb3J0RGlyZWN0aW9uID09PSAnYXNjJyA/ICdkZXNjJyA6ICdhc2MnO1xuICB9IGVsc2Uge1xuICAgIHNvcnRLZXkgPSBrZXk7XG4gICAgc29ydERpcmVjdGlvbiA9ICdhc2MnO1xuICB9XG4gIHVwZGF0ZUhlYWRlclN0eWxlcygpO1xuICByZW5kZXJUYWJsZSgpO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVIZWFkZXJTdHlsZXMoKSB7XG4gIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ3RoLnNvcnRhYmxlJykuZm9yRWFjaCh0aCA9PiB7XG4gICAgdGguY2xhc3NMaXN0LnJlbW92ZSgnc29ydC1hc2MnLCAnc29ydC1kZXNjJyk7XG4gICAgaWYgKHRoLmdldEF0dHJpYnV0ZSgnZGF0YS1rZXknKSA9PT0gc29ydEtleSkge1xuICAgICAgdGguY2xhc3NMaXN0LmFkZChzb3J0RGlyZWN0aW9uID09PSAnYXNjJyA/ICdzb3J0LWFzYycgOiAnc29ydC1kZXNjJyk7XG4gICAgfVxuICB9KTtcbn1cblxuZnVuY3Rpb24gZ2V0U29ydFZhbHVlKHRhYjogY2hyb21lLnRhYnMuVGFiLCBrZXk6IHN0cmluZyk6IGFueSB7XG4gIHN3aXRjaCAoa2V5KSB7XG4gICAgY2FzZSAncGFyZW50VGl0bGUnOlxuICAgICAgcmV0dXJuIHRhYi5vcGVuZXJUYWJJZCA/ICh0YWJUaXRsZXMuZ2V0KHRhYi5vcGVuZXJUYWJJZCkgfHwgJycpIDogJyc7XG4gICAgY2FzZSAnZ2VucmUnOlxuICAgICAgcmV0dXJuICh0YWIuaWQgJiYgY3VycmVudENvbnRleHRNYXAuZ2V0KHRhYi5pZCk/LmRhdGE/LmdlbnJlKSB8fCAnJztcbiAgICBjYXNlICdjb250ZXh0JzpcbiAgICAgIHJldHVybiAodGFiLmlkICYmIGN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpPy5jb250ZXh0KSB8fCAnJztcbiAgICBjYXNlICdhY3RpdmUnOlxuICAgIGNhc2UgJ3Bpbm5lZCc6XG4gICAgICByZXR1cm4gKHRhYiBhcyBhbnkpW2tleV0gPyAxIDogMDtcbiAgICBjYXNlICdpZCc6XG4gICAgY2FzZSAnaW5kZXgnOlxuICAgIGNhc2UgJ3dpbmRvd0lkJzpcbiAgICBjYXNlICdncm91cElkJzpcbiAgICBjYXNlICdvcGVuZXJUYWJJZCc6XG4gICAgICByZXR1cm4gKHRhYiBhcyBhbnkpW2tleV0gfHwgLTE7XG4gICAgY2FzZSAnbGFzdEFjY2Vzc2VkJzpcbiAgICAgIHJldHVybiAodGFiIGFzIGFueSlba2V5XSB8fCAwO1xuICAgIGNhc2UgJ3RpdGxlJzpcbiAgICBjYXNlICd1cmwnOlxuICAgIGNhc2UgJ3N0YXR1cyc6XG4gICAgICByZXR1cm4gKCh0YWIgYXMgYW55KVtrZXldIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gKHRhYiBhcyBhbnkpW2tleV07XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVuZGVyVGFibGUoKSB7XG4gIGNvbnN0IHRib2R5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI3RhYnNUYWJsZSB0Ym9keScpO1xuICBpZiAoIXRib2R5KSByZXR1cm47XG5cbiAgLy8gMS4gRmlsdGVyXG4gIGxldCB0YWJzRGlzcGxheSA9IGN1cnJlbnRUYWJzLmZpbHRlcih0YWIgPT4ge1xuICAgICAgLy8gR2xvYmFsIFNlYXJjaFxuICAgICAgaWYgKGdsb2JhbFNlYXJjaFF1ZXJ5KSB7XG4gICAgICAgICAgY29uc3QgcSA9IGdsb2JhbFNlYXJjaFF1ZXJ5LnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgY29uc3Qgc2VhcmNoYWJsZVRleHQgPSBgJHt0YWIudGl0bGV9ICR7dGFiLnVybH0gJHt0YWIuaWR9YC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgIGlmICghc2VhcmNoYWJsZVRleHQuaW5jbHVkZXMocSkpIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgLy8gQ29sdW1uIEZpbHRlcnNcbiAgICAgIGZvciAoY29uc3QgW2tleSwgZmlsdGVyXSBvZiBPYmplY3QuZW50cmllcyhjb2x1bW5GaWx0ZXJzKSkge1xuICAgICAgICAgIGlmICghZmlsdGVyKSBjb250aW51ZTtcbiAgICAgICAgICBjb25zdCB2YWwgPSBTdHJpbmcoZ2V0U29ydFZhbHVlKHRhYiwga2V5KSkudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICBpZiAoIXZhbC5pbmNsdWRlcyhmaWx0ZXIudG9Mb3dlckNhc2UoKSkpIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRydWU7XG4gIH0pO1xuXG4gIC8vIDIuIFNvcnRcbiAgaWYgKHNvcnRLZXkpIHtcbiAgICB0YWJzRGlzcGxheS5zb3J0KChhLCBiKSA9PiB7XG4gICAgICBsZXQgdmFsQTogYW55ID0gZ2V0U29ydFZhbHVlKGEsIHNvcnRLZXkhKTtcbiAgICAgIGxldCB2YWxCOiBhbnkgPSBnZXRTb3J0VmFsdWUoYiwgc29ydEtleSEpO1xuXG4gICAgICBpZiAodmFsQSA8IHZhbEIpIHJldHVybiBzb3J0RGlyZWN0aW9uID09PSAnYXNjJyA/IC0xIDogMTtcbiAgICAgIGlmICh2YWxBID4gdmFsQikgcmV0dXJuIHNvcnREaXJlY3Rpb24gPT09ICdhc2MnID8gMSA6IC0xO1xuICAgICAgcmV0dXJuIDA7XG4gICAgfSk7XG4gIH1cblxuICB0Ym9keS5pbm5lckhUTUwgPSAnJzsgLy8gQ2xlYXIgZXhpc3Rpbmcgcm93c1xuXG4gIC8vIDMuIFJlbmRlclxuICBjb25zdCB2aXNpYmxlQ29scyA9IGNvbHVtbnMuZmlsdGVyKGMgPT4gYy52aXNpYmxlKTtcblxuICB0YWJzRGlzcGxheS5mb3JFYWNoKHRhYiA9PiB7XG4gICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndHInKTtcblxuICAgIHZpc2libGVDb2xzLmZvckVhY2goY29sID0+IHtcbiAgICAgICAgY29uc3QgdGQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0ZCcpO1xuICAgICAgICBpZiAoY29sLmtleSA9PT0gJ3RpdGxlJykgdGQuY2xhc3NMaXN0LmFkZCgndGl0bGUtY2VsbCcpO1xuICAgICAgICBpZiAoY29sLmtleSA9PT0gJ3VybCcpIHRkLmNsYXNzTGlzdC5hZGQoJ3VybC1jZWxsJyk7XG5cbiAgICAgICAgY29uc3QgdmFsID0gZ2V0Q2VsbFZhbHVlKHRhYiwgY29sLmtleSk7XG5cbiAgICAgICAgaWYgKHZhbCBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSB7XG4gICAgICAgICAgICB0ZC5hcHBlbmRDaGlsZCh2YWwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGQuaW5uZXJIVE1MID0gdmFsO1xuICAgICAgICAgICAgdGQudGl0bGUgPSBzdHJpcEh0bWwoU3RyaW5nKHZhbCkpO1xuICAgICAgICB9XG4gICAgICAgIHJvdy5hcHBlbmRDaGlsZCh0ZCk7XG4gICAgfSk7XG5cbiAgICB0Ym9keS5hcHBlbmRDaGlsZChyb3cpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gc3RyaXBIdG1sKGh0bWw6IHN0cmluZykge1xuICAgIGxldCB0bXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiRElWXCIpO1xuICAgIHRtcC5pbm5lckhUTUwgPSBodG1sO1xuICAgIHJldHVybiB0bXAudGV4dENvbnRlbnQgfHwgdG1wLmlubmVyVGV4dCB8fCBcIlwiO1xufVxuXG5cbmZ1bmN0aW9uIGdldENlbGxWYWx1ZSh0YWI6IGNocm9tZS50YWJzLlRhYiwga2V5OiBzdHJpbmcpOiBzdHJpbmcgfCBIVE1MRWxlbWVudCB7XG4gICAgY29uc3QgZXNjYXBlID0gZXNjYXBlSHRtbDtcblxuICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICAgIGNhc2UgJ2lkJzogcmV0dXJuIFN0cmluZyh0YWIuaWQgPz8gJ04vQScpO1xuICAgICAgICBjYXNlICdpbmRleCc6IHJldHVybiBTdHJpbmcodGFiLmluZGV4KTtcbiAgICAgICAgY2FzZSAnd2luZG93SWQnOiByZXR1cm4gU3RyaW5nKHRhYi53aW5kb3dJZCk7XG4gICAgICAgIGNhc2UgJ2dyb3VwSWQnOiByZXR1cm4gU3RyaW5nKHRhYi5ncm91cElkKTtcbiAgICAgICAgY2FzZSAndGl0bGUnOiByZXR1cm4gZXNjYXBlKHRhYi50aXRsZSB8fCAnJyk7XG4gICAgICAgIGNhc2UgJ3VybCc6IHJldHVybiBlc2NhcGUodGFiLnVybCB8fCAnJyk7XG4gICAgICAgIGNhc2UgJ3N0YXR1cyc6IHJldHVybiBlc2NhcGUodGFiLnN0YXR1cyB8fCAnJyk7XG4gICAgICAgIGNhc2UgJ2FjdGl2ZSc6IHJldHVybiB0YWIuYWN0aXZlID8gJ1llcycgOiAnTm8nO1xuICAgICAgICBjYXNlICdwaW5uZWQnOiByZXR1cm4gdGFiLnBpbm5lZCA/ICdZZXMnIDogJ05vJztcbiAgICAgICAgY2FzZSAnb3BlbmVyVGFiSWQnOiByZXR1cm4gU3RyaW5nKHRhYi5vcGVuZXJUYWJJZCA/PyAnLScpO1xuICAgICAgICBjYXNlICdwYXJlbnRUaXRsZSc6XG4gICAgICAgICAgICAgcmV0dXJuIGVzY2FwZSh0YWIub3BlbmVyVGFiSWQgPyAodGFiVGl0bGVzLmdldCh0YWIub3BlbmVyVGFiSWQpIHx8ICdVbmtub3duJykgOiAnLScpO1xuICAgICAgICBjYXNlICdnZW5yZSc6XG4gICAgICAgICAgICAgcmV0dXJuIGVzY2FwZSgodGFiLmlkICYmIGN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpPy5kYXRhPy5nZW5yZSkgfHwgJy0nKTtcbiAgICAgICAgY2FzZSAnY29udGV4dCc6IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRleHRSZXN1bHQgPSB0YWIuaWQgPyBjdXJyZW50Q29udGV4dE1hcC5nZXQodGFiLmlkKSA6IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGlmICghY29udGV4dFJlc3VsdCkgcmV0dXJuICdOL0EnO1xuXG4gICAgICAgICAgICBsZXQgY2VsbFN0eWxlID0gJyc7XG4gICAgICAgICAgICBsZXQgYWlDb250ZXh0ID0gJyc7XG5cbiAgICAgICAgICAgIGlmIChjb250ZXh0UmVzdWx0LnN0YXR1cyA9PT0gJ1JFU1RSSUNURUQnKSB7XG4gICAgICAgICAgICAgICAgYWlDb250ZXh0ID0gJ1VuZXh0cmFjdGFibGUgKHJlc3RyaWN0ZWQpJztcbiAgICAgICAgICAgICAgICBjZWxsU3R5bGUgPSAnY29sb3I6IGdyYXk7IGZvbnQtc3R5bGU6IGl0YWxpYzsnO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjb250ZXh0UmVzdWx0LmVycm9yKSB7XG4gICAgICAgICAgICAgICAgYWlDb250ZXh0ID0gYEVycm9yICgke2NvbnRleHRSZXN1bHQuZXJyb3J9KWA7XG4gICAgICAgICAgICAgICAgY2VsbFN0eWxlID0gJ2NvbG9yOiByZWQ7JztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY29udGV4dFJlc3VsdC5zb3VyY2UgPT09ICdFeHRyYWN0aW9uJykge1xuICAgICAgICAgICAgICAgIGFpQ29udGV4dCA9IGAke2NvbnRleHRSZXN1bHQuY29udGV4dH0gKEV4dHJhY3RlZClgO1xuICAgICAgICAgICAgICAgIGNlbGxTdHlsZSA9ICdjb2xvcjogZ3JlZW47IGZvbnQtd2VpZ2h0OiBib2xkOyc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICBhaUNvbnRleHQgPSBgJHtjb250ZXh0UmVzdWx0LmNvbnRleHR9YDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICBjb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcbiAgICAgICAgICAgIGNvbnRhaW5lci5zdHlsZS5mbGV4RGlyZWN0aW9uID0gJ2NvbHVtbic7XG4gICAgICAgICAgICBjb250YWluZXIuc3R5bGUuZ2FwID0gJzVweCc7XG5cbiAgICAgICAgICAgIGNvbnN0IHN1bW1hcnlEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIHN1bW1hcnlEaXYuc3R5bGUuY3NzVGV4dCA9IGNlbGxTdHlsZTtcbiAgICAgICAgICAgIHN1bW1hcnlEaXYudGV4dENvbnRlbnQgPSBhaUNvbnRleHQ7XG4gICAgICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoc3VtbWFyeURpdik7XG5cbiAgICAgICAgICAgIGlmIChjb250ZXh0UmVzdWx0LmRhdGEpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkZXRhaWxzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncHJlJyk7XG4gICAgICAgICAgICAgICAgZGV0YWlscy5zdHlsZS5jc3NUZXh0ID0gJ21heC1oZWlnaHQ6IDMwMHB4OyBvdmVyZmxvdzogYXV0bzsgZm9udC1zaXplOiAxMXB4OyB0ZXh0LWFsaWduOiBsZWZ0OyBiYWNrZ3JvdW5kOiAjZjVmNWY1OyBwYWRkaW5nOiA1cHg7IGJvcmRlcjogMXB4IHNvbGlkICNkZGQ7IG1hcmdpbjogMDsgd2hpdGUtc3BhY2U6IHByZS13cmFwOyBmb250LWZhbWlseTogbW9ub3NwYWNlOyc7XG4gICAgICAgICAgICAgICAgZGV0YWlscy50ZXh0Q29udGVudCA9IEpTT04uc3RyaW5naWZ5KGNvbnRleHRSZXN1bHQuZGF0YSwgbnVsbCwgMik7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGRldGFpbHMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gY29udGFpbmVyO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgJ2xhc3RBY2Nlc3NlZCc6XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGUoKHRhYiBhcyBhbnkpLmxhc3RBY2Nlc3NlZCB8fCAwKS50b0xvY2FsZVN0cmluZygpO1xuICAgICAgICBjYXNlICdhY3Rpb25zJzoge1xuICAgICAgICAgICAgY29uc3Qgd3JhcHBlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgd3JhcHBlci5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImdvdG8tdGFiLWJ0blwiIGRhdGEtdGFiLWlkPVwiJHt0YWIuaWR9XCIgZGF0YS13aW5kb3ctaWQ9XCIke3RhYi53aW5kb3dJZH1cIj5HbzwvYnV0dG9uPlxuICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJjbG9zZS10YWItYnRuXCIgZGF0YS10YWItaWQ9XCIke3RhYi5pZH1cIiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6ICNkYzM1NDU7IG1hcmdpbi1sZWZ0OiAycHg7XCI+WDwvYnV0dG9uPlxuICAgICAgICAgICAgYDtcbiAgICAgICAgICAgIHJldHVybiB3cmFwcGVyO1xuICAgICAgICB9XG4gICAgICAgIGRlZmF1bHQ6IHJldHVybiAnJztcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHJlbmRlckFsZ29yaXRobXNWaWV3KCkge1xuICAvLyBVc2UgdXBkYXRlZCBzdHJhdGVnaWVzIGxpc3QgaW5jbHVkaW5nIGN1c3RvbSBvbmVzXG4gIHJlbmRlclN0cmF0ZWd5Q29uZmlnKCk7XG5cbiAgY29uc3QgZ3JvdXBpbmdSZWYgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JvdXBpbmctcmVmJyk7XG4gIGNvbnN0IHNvcnRpbmdSZWYgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc29ydGluZy1yZWYnKTtcblxuICBpZiAoZ3JvdXBpbmdSZWYpIHtcbiAgICAgIC8vIFJlLXJlbmRlciBiZWNhdXNlIHN0cmF0ZWd5IGxpc3QgbWlnaHQgY2hhbmdlXG4gICAgICBjb25zdCBhbGxTdHJhdGVnaWVzOiBTdHJhdGVneURlZmluaXRpb25bXSA9IGdldFN0cmF0ZWdpZXMobG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcbiAgICAgIGNvbnN0IGdyb3VwaW5ncyA9IGFsbFN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gcy5pc0dyb3VwaW5nKTtcblxuICAgICAgZ3JvdXBpbmdSZWYuaW5uZXJIVE1MID0gZ3JvdXBpbmdzLm1hcChnID0+IHtcbiAgICAgICAgIGNvbnN0IGlzQ3VzdG9tID0gbG9jYWxDdXN0b21TdHJhdGVnaWVzLnNvbWUocyA9PiBzLmlkID09PSBnLmlkKTtcbiAgICAgICAgIGxldCBkZXNjID0gXCJCdWlsdC1pbiBzdHJhdGVneVwiO1xuICAgICAgICAgaWYgKGlzQ3VzdG9tKSBkZXNjID0gXCJDdXN0b20gc3RyYXRlZ3kgZGVmaW5lZCBieSBydWxlcy5cIjtcbiAgICAgICAgIGVsc2UgaWYgKGcuaWQgPT09ICdkb21haW4nKSBkZXNjID0gJ0dyb3VwcyB0YWJzIGJ5IHRoZWlyIGRvbWFpbiBuYW1lLic7XG4gICAgICAgICBlbHNlIGlmIChnLmlkID09PSAndG9waWMnKSBkZXNjID0gJ0dyb3VwcyBiYXNlZCBvbiBrZXl3b3JkcyBpbiB0aGUgdGl0bGUuJztcblxuICAgICAgICAgcmV0dXJuIGBcbiAgICAgICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktaXRlbVwiPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInN0cmF0ZWd5LW5hbWVcIj4ke2cubGFiZWx9ICgke2cuaWR9KSAke2lzQ3VzdG9tID8gJzxzcGFuIHN0eWxlPVwiY29sb3I6IGJsdWU7IGZvbnQtc2l6ZTogMC44ZW07XCI+Q3VzdG9tPC9zcGFuPicgOiAnJ308L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1kZXNjXCI+JHtkZXNjfTwvZGl2PlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInN0cmF0ZWd5LXZpZXctYnRuXCIgZGF0YS10eXBlPVwiZ3JvdXBpbmdcIiBkYXRhLW5hbWU9XCIke2cuaWR9XCI+VmlldyBMb2dpYzwvYnV0dG9uPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICBgO1xuICAgICAgfSkuam9pbignJyk7XG4gIH1cblxuICBpZiAoc29ydGluZ1JlZikge1xuICAgIC8vIFJlLXJlbmRlciBzb3J0aW5nIHN0cmF0ZWdpZXMgdG9vXG4gICAgY29uc3QgYWxsU3RyYXRlZ2llczogU3RyYXRlZ3lEZWZpbml0aW9uW10gPSBnZXRTdHJhdGVnaWVzKGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgY29uc3Qgc29ydGluZ3MgPSBhbGxTdHJhdGVnaWVzLmZpbHRlcihzID0+IHMuaXNTb3J0aW5nKTtcblxuICAgIHNvcnRpbmdSZWYuaW5uZXJIVE1MID0gc29ydGluZ3MubWFwKHMgPT4ge1xuICAgICAgICBsZXQgZGVzYyA9IFwiQnVpbHQtaW4gc29ydGluZ1wiO1xuICAgICAgICBpZiAocy5pZCA9PT0gJ3JlY2VuY3knKSBkZXNjID0gJ1NvcnRzIGJ5IGxhc3QgYWNjZXNzZWQgdGltZSAobW9zdCByZWNlbnQgZmlyc3QpLic7XG4gICAgICAgIGVsc2UgaWYgKHMuaWQgPT09ICduZXN0aW5nJykgZGVzYyA9ICdTb3J0cyBiYXNlZCBvbiBoaWVyYXJjaHkgKHJvb3RzIHZzIGNoaWxkcmVuKS4nO1xuICAgICAgICBlbHNlIGlmIChzLmlkID09PSAncGlubmVkJykgZGVzYyA9ICdLZWVwcyBwaW5uZWQgdGFicyBhdCB0aGUgYmVnaW5uaW5nIG9mIHRoZSBsaXN0Lic7XG5cbiAgICAgICAgcmV0dXJuIGBcbiAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1pdGVtXCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1uYW1lXCI+JHtzLmxhYmVsfTwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktZGVzY1wiPiR7ZGVzY308L2Rpdj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInN0cmF0ZWd5LXZpZXctYnRuXCIgZGF0YS10eXBlPVwic29ydGluZ1wiIGRhdGEtbmFtZT1cIiR7cy5pZH1cIj5WaWV3IExvZ2ljPC9idXR0b24+XG4gICAgICA8L2Rpdj5cbiAgICBgO1xuICAgIH0pLmpvaW4oJycpO1xuICB9XG5cbiAgY29uc3QgcmVnaXN0cnlSZWYgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncmVnaXN0cnktcmVmJyk7XG4gIGlmIChyZWdpc3RyeVJlZiAmJiByZWdpc3RyeVJlZi5jaGlsZHJlbi5sZW5ndGggPT09IDApIHtcbiAgICAgIHJlZ2lzdHJ5UmVmLmlubmVySFRNTCA9IGBcbiAgICAgICAgPGRpdiBjbGFzcz1cInN0cmF0ZWd5LWl0ZW1cIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1uYW1lXCI+R2VuZXJhIFJlZ2lzdHJ5PC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktZGVzY1wiPlN0YXRpYyBsb29rdXAgdGFibGUgZm9yIGRvbWFpbiBjbGFzc2lmaWNhdGlvbiAoYXBwcm94ICR7T2JqZWN0LmtleXMoR0VORVJBX1JFR0lTVFJZKS5sZW5ndGh9IGVudHJpZXMpLjwvZGl2PlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInN0cmF0ZWd5LXZpZXctYnRuXCIgZGF0YS10eXBlPVwicmVnaXN0cnlcIiBkYXRhLW5hbWU9XCJnZW5lcmFcIj5WaWV3IFRhYmxlPC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuICAgICAgYDtcbiAgfVxufVxuXG5mdW5jdGlvbiByZW5kZXJTdHJhdGVneUNvbmZpZygpIHtcbiAgY29uc3QgZ3JvdXBpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1ncm91cGluZy1saXN0Jyk7XG4gIGNvbnN0IHNvcnRpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1zb3J0aW5nLWxpc3QnKTtcblxuICAvLyBVc2UgZHluYW1pYyBzdHJhdGVneSBsaXN0XG4gIGNvbnN0IHN0cmF0ZWdpZXM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0gZ2V0U3RyYXRlZ2llcyhsb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuXG4gIGlmIChncm91cGluZ0xpc3QpIHtcbiAgICAgIGNvbnN0IGdyb3VwaW5nU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gcy5pc0dyb3VwaW5nKTtcbiAgICAgIC8vIFdlIHNob3VsZCBwcmVzZXJ2ZSBjaGVja2VkIHN0YXRlIGlmIHJlLXJlbmRlcmluZywgYnV0IGZvciBub3cganVzdCBkZWZhdWx0aW5nIGlzIG9rYXkgb3IgcmVhZGluZyBjdXJyZW50IERPTVxuICAgICAgLy8gU2ltcGxpZmljYXRpb246IGp1c3QgcmUtcmVuZGVyLlxuICAgICAgcmVuZGVyU3RyYXRlZ3lMaXN0KGdyb3VwaW5nTGlzdCwgZ3JvdXBpbmdTdHJhdGVnaWVzLCBbJ2RvbWFpbicsICd0b3BpYyddKTtcbiAgfVxuXG4gIGlmIChzb3J0aW5nTGlzdCkge1xuICAgICAgY29uc3Qgc29ydGluZ1N0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IHMuaXNTb3J0aW5nKTtcbiAgICAgIHJlbmRlclN0cmF0ZWd5TGlzdChzb3J0aW5nTGlzdCwgc29ydGluZ1N0cmF0ZWdpZXMsIFsncGlubmVkJywgJ3JlY2VuY3knXSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVuZGVyU3RyYXRlZ3lMaXN0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHN0cmF0ZWdpZXM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdLCBkZWZhdWx0RW5hYmxlZDogc3RyaW5nW10pIHtcbiAgICBjb250YWluZXIuaW5uZXJIVE1MID0gJyc7XG5cbiAgICAvLyBTb3J0IGVuYWJsZWQgYnkgdGhlaXIgaW5kZXggaW4gZGVmYXVsdEVuYWJsZWRcbiAgICBjb25zdCBlbmFibGVkID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiBkZWZhdWx0RW5hYmxlZC5pbmNsdWRlcyhzLmlkIGFzIHN0cmluZykpO1xuICAgIC8vIFNhZmUgaW5kZXhvZiBjaGVjayBzaW5jZSBpZHMgYXJlIHN0cmluZ3MgaW4gZGVmYXVsdEVuYWJsZWRcbiAgICBlbmFibGVkLnNvcnQoKGEsIGIpID0+IGRlZmF1bHRFbmFibGVkLmluZGV4T2YoYS5pZCBhcyBzdHJpbmcpIC0gZGVmYXVsdEVuYWJsZWQuaW5kZXhPZihiLmlkIGFzIHN0cmluZykpO1xuXG4gICAgY29uc3QgZGlzYWJsZWQgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+ICFkZWZhdWx0RW5hYmxlZC5pbmNsdWRlcyhzLmlkIGFzIHN0cmluZykpO1xuXG4gICAgLy8gSW5pdGlhbCByZW5kZXIgb3JkZXI6IEVuYWJsZWQgKG9yZGVyZWQpIHRoZW4gRGlzYWJsZWRcbiAgICBjb25zdCBvcmRlcmVkID0gWy4uLmVuYWJsZWQsIC4uLmRpc2FibGVkXTtcblxuICAgIG9yZGVyZWQuZm9yRWFjaChzdHJhdGVneSA9PiB7XG4gICAgICAgIGNvbnN0IGlzQ2hlY2tlZCA9IGRlZmF1bHRFbmFibGVkLmluY2x1ZGVzKHN0cmF0ZWd5LmlkKTtcbiAgICAgICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIHJvdy5jbGFzc05hbWUgPSBgc3RyYXRlZ3ktcm93ICR7aXNDaGVja2VkID8gJycgOiAnZGlzYWJsZWQnfWA7XG4gICAgICAgIHJvdy5kYXRhc2V0LmlkID0gc3RyYXRlZ3kuaWQ7XG4gICAgICAgIHJvdy5kcmFnZ2FibGUgPSB0cnVlO1xuXG4gICAgICAgIHJvdy5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZHJhZy1oYW5kbGVcIj5cdTI2MzA8L2Rpdj5cbiAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiAke2lzQ2hlY2tlZCA/ICdjaGVja2VkJyA6ICcnfT5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwic3RyYXRlZ3ktbGFiZWxcIj4ke3N0cmF0ZWd5LmxhYmVsfTwvc3Bhbj5cbiAgICAgICAgYDtcblxuICAgICAgICAvLyBBZGQgbGlzdGVuZXJzXG4gICAgICAgIGNvbnN0IGNoZWNrYm94ID0gcm93LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJjaGVja2JveFwiXScpO1xuICAgICAgICBjaGVja2JveD8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKGUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNoZWNrZWQgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZDtcbiAgICAgICAgICAgIHJvdy5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsICFjaGVja2VkKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgYWRkRG5ETGlzdGVuZXJzKHJvdywgY29udGFpbmVyKTtcblxuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQocm93KTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gYWRkRG5ETGlzdGVuZXJzKHJvdzogSFRNTEVsZW1lbnQsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgcm93LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdzdGFydCcsIChlKSA9PiB7XG4gICAgcm93LmNsYXNzTGlzdC5hZGQoJ2RyYWdnaW5nJyk7XG4gICAgaWYgKGUuZGF0YVRyYW5zZmVyKSB7XG4gICAgICAgIGUuZGF0YVRyYW5zZmVyLmVmZmVjdEFsbG93ZWQgPSAnbW92ZSc7XG4gICAgICAgIC8vIFNldCBhIHRyYW5zcGFyZW50IGltYWdlIG9yIHNpbWlsYXIgaWYgZGVzaXJlZCwgYnV0IGRlZmF1bHQgaXMgdXN1YWxseSBmaW5lXG4gICAgfVxuICB9KTtcblxuICByb3cuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ2VuZCcsICgpID0+IHtcbiAgICByb3cuY2xhc3NMaXN0LnJlbW92ZSgnZHJhZ2dpbmcnKTtcbiAgfSk7XG5cbiAgLy8gVGhlIGNvbnRhaW5lciBoYW5kbGVzIHRoZSBkcm9wIHpvbmUgbG9naWMgdmlhIGRyYWdvdmVyXG4gIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdkcmFnb3ZlcicsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IGFmdGVyRWxlbWVudCA9IGdldERyYWdBZnRlckVsZW1lbnQoY29udGFpbmVyLCBlLmNsaWVudFkpO1xuICAgIGNvbnN0IGRyYWdnYWJsZSA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuZHJhZ2dpbmcnKTtcbiAgICBpZiAoZHJhZ2dhYmxlKSB7XG4gICAgICBpZiAoYWZ0ZXJFbGVtZW50ID09IG51bGwpIHtcbiAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGRyYWdnYWJsZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb250YWluZXIuaW5zZXJ0QmVmb3JlKGRyYWdnYWJsZSwgYWZ0ZXJFbGVtZW50KTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBnZXREcmFnQWZ0ZXJFbGVtZW50KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHk6IG51bWJlcikge1xuICBjb25zdCBkcmFnZ2FibGVFbGVtZW50cyA9IEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5zdHJhdGVneS1yb3c6bm90KC5kcmFnZ2luZyknKSk7XG5cbiAgcmV0dXJuIGRyYWdnYWJsZUVsZW1lbnRzLnJlZHVjZSgoY2xvc2VzdCwgY2hpbGQpID0+IHtcbiAgICBjb25zdCBib3ggPSBjaGlsZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBjb25zdCBvZmZzZXQgPSB5IC0gYm94LnRvcCAtIGJveC5oZWlnaHQgLyAyO1xuICAgIGlmIChvZmZzZXQgPCAwICYmIG9mZnNldCA+IGNsb3Nlc3Qub2Zmc2V0KSB7XG4gICAgICByZXR1cm4geyBvZmZzZXQ6IG9mZnNldCwgZWxlbWVudDogY2hpbGQgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGNsb3Nlc3Q7XG4gICAgfVxuICB9LCB7IG9mZnNldDogTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZLCBlbGVtZW50OiBudWxsIGFzIEVsZW1lbnQgfCBudWxsIH0pLmVsZW1lbnQ7XG59XG5cbmZ1bmN0aW9uIHNob3dNb2RhbCh0aXRsZTogc3RyaW5nLCBjb250ZW50OiBIVE1MRWxlbWVudCB8IHN0cmluZykge1xuICAgIGNvbnN0IG1vZGFsT3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIG1vZGFsT3ZlcmxheS5jbGFzc05hbWUgPSAnbW9kYWwtb3ZlcmxheSc7XG4gICAgbW9kYWxPdmVybGF5LmlubmVySFRNTCA9IGBcbiAgICAgICAgPGRpdiBjbGFzcz1cIm1vZGFsXCI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwibW9kYWwtaGVhZGVyXCI+XG4gICAgICAgICAgICAgICAgPGgzPiR7ZXNjYXBlSHRtbCh0aXRsZSl9PC9oMz5cbiAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwibW9kYWwtY2xvc2VcIj4mdGltZXM7PC9idXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1jb250ZW50XCI+PC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgIGA7XG5cbiAgICBjb25zdCBjb250ZW50Q29udGFpbmVyID0gbW9kYWxPdmVybGF5LnF1ZXJ5U2VsZWN0b3IoJy5tb2RhbC1jb250ZW50JykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgaWYgKHR5cGVvZiBjb250ZW50ID09PSAnc3RyaW5nJykge1xuICAgICAgICBjb250ZW50Q29udGFpbmVyLmlubmVySFRNTCA9IGNvbnRlbnQ7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZChjb250ZW50KTtcbiAgICB9XG5cbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG1vZGFsT3ZlcmxheSk7XG5cbiAgICBjb25zdCBjbG9zZUJ0biA9IG1vZGFsT3ZlcmxheS5xdWVyeVNlbGVjdG9yKCcubW9kYWwtY2xvc2UnKTtcbiAgICBjbG9zZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQobW9kYWxPdmVybGF5KTtcbiAgICB9KTtcblxuICAgIG1vZGFsT3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgIGlmIChlLnRhcmdldCA9PT0gbW9kYWxPdmVybGF5KSB7XG4gICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZChtb2RhbE92ZXJsYXkpO1xuICAgICAgICB9XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIHNob3dTdHJhdGVneURldGFpbHModHlwZTogc3RyaW5nLCBuYW1lOiBzdHJpbmcpIHtcbiAgICBsZXQgY29udGVudCA9IFwiXCI7XG4gICAgbGV0IHRpdGxlID0gYCR7bmFtZX0gKCR7dHlwZX0pYDtcblxuICAgIGlmICh0eXBlID09PSAnZ3JvdXBpbmcnKSB7XG4gICAgICAgIGlmIChuYW1lID09PSAnZG9tYWluJykge1xuICAgICAgICAgICAgY29udGVudCA9IGBcbjxoMz5Mb2dpYzogRG9tYWluIEV4dHJhY3Rpb248L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoZG9tYWluRnJvbVVybC50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG48aDM+TG9naWM6IEdyb3VwaW5nIEtleTwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChncm91cGluZ0tleS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG4gICAgICAgICAgICBgO1xuICAgICAgICB9IGVsc2UgaWYgKG5hbWUgPT09ICd0b3BpYycpIHtcbiAgICAgICAgICAgIGNvbnRlbnQgPSBgXG48aDM+TG9naWM6IFNlbWFudGljIEJ1Y2tldGluZzwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChzZW1hbnRpY0J1Y2tldC50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG48aDM+TG9naWM6IEdyb3VwaW5nIEtleTwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChncm91cGluZ0tleS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG4gICAgICAgICAgICBgO1xuICAgICAgICB9IGVsc2UgaWYgKG5hbWUgPT09ICdsaW5lYWdlJykge1xuICAgICAgICAgICAgY29udGVudCA9IGBcbjxoMz5Mb2dpYzogTmF2aWdhdGlvbiBLZXk8L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwobmF2aWdhdGlvbktleS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG48aDM+TG9naWM6IEdyb3VwaW5nIEtleTwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChncm91cGluZ0tleS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG4gICAgICAgICAgICBgO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIGN1c3RvbSBzdHJhdGVneSBkZXRhaWxzXG4gICAgICAgICAgICBjb25zdCBjdXN0b20gPSBsb2NhbEN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IG5hbWUpO1xuICAgICAgICAgICAgaWYgKGN1c3RvbSkge1xuICAgICAgICAgICAgICAgIGNvbnRlbnQgPSBgXG48aDM+Q3VzdG9tIFN0cmF0ZWd5OiAke2VzY2FwZUh0bWwoY3VzdG9tLmxhYmVsKX08L2gzPlxuPHA+PGI+Q29uZmlndXJhdGlvbjo8L2I+PC9wPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoSlNPTi5zdHJpbmdpZnkoY3VzdG9tLCBudWxsLCAyKSl9PC9jb2RlPjwvcHJlPlxuPGgzPkxvZ2ljOiBHcm91cGluZyBLZXk8L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoZ3JvdXBpbmdLZXkudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPlxuICAgICAgICAgICAgICAgIGA7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnRlbnQgPSBgXG48aDM+TG9naWM6IEdyb3VwaW5nIEtleTwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChncm91cGluZ0tleS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG4gICAgICAgICAgICAgICAgYDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3NvcnRpbmcnKSB7XG4gICAgICAgIGNvbnRlbnQgPSBgXG48aDM+TG9naWM6IENvbXBhcmlzb24gRnVuY3Rpb248L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoY29tcGFyZUJ5LnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5cbiAgICAgICAgYDtcblxuICAgICAgICBpZiAobmFtZSA9PT0gJ3JlY2VuY3knKSB7XG4gICAgICAgICAgICAgY29udGVudCArPSBgPGgzPkxvZ2ljOiBSZWNlbmN5IFNjb3JlPC9oMz48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChyZWNlbmN5U2NvcmUudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPmA7XG4gICAgICAgIH0gZWxzZSBpZiAobmFtZSA9PT0gJ25lc3RpbmcnKSB7XG4gICAgICAgICAgICAgY29udGVudCArPSBgPGgzPkxvZ2ljOiBIaWVyYXJjaHkgU2NvcmU8L2gzPjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKGhpZXJhcmNoeVNjb3JlLnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5gO1xuICAgICAgICB9IGVsc2UgaWYgKG5hbWUgPT09ICdwaW5uZWQnKSB7XG4gICAgICAgICAgICAgY29udGVudCArPSBgPGgzPkxvZ2ljOiBQaW5uZWQgU2NvcmU8L2gzPjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKHBpbm5lZFNjb3JlLnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5gO1xuICAgICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAncmVnaXN0cnknICYmIG5hbWUgPT09ICdnZW5lcmEnKSB7XG4gICAgICAgIGNvbnN0IGpzb24gPSBKU09OLnN0cmluZ2lmeShHRU5FUkFfUkVHSVNUUlksIG51bGwsIDIpO1xuICAgICAgICBjb250ZW50ID0gYFxuPGgzPkdlbmVyYSBSZWdpc3RyeSBEYXRhPC9oMz5cbjxwPk1hcHBpbmcgb2YgZG9tYWluIG5hbWVzIHRvIGNhdGVnb3JpZXMuPC9wPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoanNvbil9PC9jb2RlPjwvcHJlPlxuICAgICAgICBgO1xuICAgIH1cblxuICAgIHNob3dNb2RhbCh0aXRsZSwgY29udGVudCk7XG59XG5cbmZ1bmN0aW9uIGdldEVuYWJsZWRTdHJhdGVnaWVzRnJvbVVJKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBTb3J0aW5nU3RyYXRlZ3lbXSB7XG4gICAgcmV0dXJuIEFycmF5LmZyb20oY29udGFpbmVyLmNoaWxkcmVuKVxuICAgICAgICAuZmlsdGVyKHJvdyA9PiAocm93LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJjaGVja2JveFwiXScpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQpXG4gICAgICAgIC5tYXAocm93ID0+IChyb3cgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQuaWQgYXMgU29ydGluZ1N0cmF0ZWd5KTtcbn1cblxuZnVuY3Rpb24gcnVuU2ltdWxhdGlvbigpIHtcbiAgY29uc3QgZ3JvdXBpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1ncm91cGluZy1saXN0Jyk7XG4gIGNvbnN0IHNvcnRpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1zb3J0aW5nLWxpc3QnKTtcbiAgY29uc3QgcmVzdWx0Q29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbVJlc3VsdHMnKTtcblxuICBpZiAoIWdyb3VwaW5nTGlzdCB8fCAhc29ydGluZ0xpc3QgfHwgIXJlc3VsdENvbnRhaW5lcikgcmV0dXJuO1xuXG4gIGNvbnN0IGdyb3VwaW5nU3RyYXRzID0gZ2V0RW5hYmxlZFN0cmF0ZWdpZXNGcm9tVUkoZ3JvdXBpbmdMaXN0KTtcbiAgY29uc3Qgc29ydGluZ1N0cmF0cyA9IGdldEVuYWJsZWRTdHJhdGVnaWVzRnJvbVVJKHNvcnRpbmdMaXN0KTtcblxuICAvLyBQcmVwYXJlIGRhdGFcbiAgbGV0IHRhYnMgPSBnZXRNYXBwZWRUYWJzKCk7XG5cbiAgLy8gMS4gU29ydFxuICBpZiAoc29ydGluZ1N0cmF0cy5sZW5ndGggPiAwKSB7XG4gICAgdGFicyA9IHNvcnRUYWJzKHRhYnMsIHNvcnRpbmdTdHJhdHMpO1xuICB9XG5cbiAgLy8gMi4gR3JvdXBcbiAgY29uc3QgZ3JvdXBzID0gZ3JvdXBUYWJzKHRhYnMsIGdyb3VwaW5nU3RyYXRzKTtcblxuICAvLyAzLiBSZW5kZXJcbiAgaWYgKGdyb3Vwcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJlc3VsdENvbnRhaW5lci5pbm5lckhUTUwgPSAnPHA+Tm8gZ3JvdXBzIGNyZWF0ZWQgKGFyZSB0aGVyZSBhbnkgdGFicz8pLjwvcD4nO1xuICAgICAgcmV0dXJuO1xuICB9XG5cbiAgcmVzdWx0Q29udGFpbmVyLmlubmVySFRNTCA9IGdyb3Vwcy5tYXAoZ3JvdXAgPT4gYFxuICAgIDxkaXYgY2xhc3M9XCJncm91cC1yZXN1bHRcIj5cbiAgICAgIDxkaXYgY2xhc3M9XCJncm91cC1oZWFkZXJcIiBzdHlsZT1cImJvcmRlci1sZWZ0OiA1cHggc29saWQgJHtncm91cC5jb2xvcn1cIj5cbiAgICAgICAgPHNwYW4+JHtlc2NhcGVIdG1sKGdyb3VwLmxhYmVsIHx8ICdVbmdyb3VwZWQnKX08L3NwYW4+XG4gICAgICAgIDxzcGFuIGNsYXNzPVwiZ3JvdXAtbWV0YVwiPiR7Z3JvdXAudGFicy5sZW5ndGh9IHRhYnMgJmJ1bGw7IFJlYXNvbjogJHtlc2NhcGVIdG1sKGdyb3VwLnJlYXNvbil9PC9zcGFuPlxuICAgICAgPC9kaXY+XG4gICAgICA8dWwgY2xhc3M9XCJncm91cC10YWJzXCI+XG4gICAgICAgICR7Z3JvdXAudGFicy5tYXAodGFiID0+IGBcbiAgICAgICAgICA8bGkgY2xhc3M9XCJncm91cC10YWItaXRlbVwiPlxuICAgICAgICAgICAgJHt0YWIuZmF2SWNvblVybCA/IGA8aW1nIHNyYz1cIiR7dGFiLmZhdkljb25Vcmx9XCIgY2xhc3M9XCJ0YWItaWNvblwiIG9uZXJyb3I9XCJ0aGlzLnN0eWxlLmRpc3BsYXk9J25vbmUnXCI+YCA6ICc8ZGl2IGNsYXNzPVwidGFiLWljb25cIj48L2Rpdj4nfVxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJ0aXRsZS1jZWxsXCIgdGl0bGU9XCIke2VzY2FwZUh0bWwodGFiLnRpdGxlKX1cIj4ke2VzY2FwZUh0bWwodGFiLnRpdGxlKX08L3NwYW4+XG4gICAgICAgICAgICA8c3BhbiBzdHlsZT1cImNvbG9yOiAjOTk5OyBmb250LXNpemU6IDAuOGVtOyBtYXJnaW4tbGVmdDogYXV0bztcIj4ke2VzY2FwZUh0bWwobmV3IFVSTCh0YWIudXJsKS5ob3N0bmFtZSl9PC9zcGFuPlxuICAgICAgICAgIDwvbGk+XG4gICAgICAgIGApLmpvaW4oJycpfVxuICAgICAgPC91bD5cbiAgICA8L2Rpdj5cbiAgYCkuam9pbignJyk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGFwcGx5VG9Ccm93c2VyKCkge1xuICAgIGNvbnN0IGdyb3VwaW5nTGlzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaW0tZ3JvdXBpbmctbGlzdCcpO1xuICAgIGNvbnN0IHNvcnRpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1zb3J0aW5nLWxpc3QnKTtcblxuICAgIGlmICghZ3JvdXBpbmdMaXN0IHx8ICFzb3J0aW5nTGlzdCkgcmV0dXJuO1xuXG4gICAgY29uc3QgZ3JvdXBpbmdTdHJhdHMgPSBnZXRFbmFibGVkU3RyYXRlZ2llc0Zyb21VSShncm91cGluZ0xpc3QpO1xuICAgIGNvbnN0IHNvcnRpbmdTdHJhdHMgPSBnZXRFbmFibGVkU3RyYXRlZ2llc0Zyb21VSShzb3J0aW5nTGlzdCk7XG5cbiAgICAvLyBDb21iaW5lIHN0cmF0ZWdpZXMuXG4gICAgLy8gV2UgcHJpb3JpdGl6ZSBncm91cGluZyBzdHJhdGVnaWVzIGZpcnN0LCB0aGVuIHNvcnRpbmcgc3RyYXRlZ2llcyxcbiAgICAvLyBhcyB0aGUgYmFja2VuZCBmaWx0ZXJzIHRoZW0gd2hlbiBwZXJmb3JtaW5nIGFjdGlvbnMuXG4gICAgY29uc3QgYWxsU3RyYXRlZ2llcyA9IFsuLi5ncm91cGluZ1N0cmF0cywgLi4uc29ydGluZ1N0cmF0c107XG5cbiAgICB0cnkge1xuICAgICAgICAvLyAxLiBTYXZlIFByZWZlcmVuY2VzXG4gICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgcGF5bG9hZDogeyBzb3J0aW5nOiBhbGxTdHJhdGVnaWVzIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gMi4gVHJpZ2dlciBBcHBseSBHcm91cGluZyAod2hpY2ggdXNlcyB0aGUgbmV3IHByZWZlcmVuY2VzKVxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgIHR5cGU6ICdhcHBseUdyb3VwaW5nJyxcbiAgICAgICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICAgICAgICBzb3J0aW5nOiBhbGxTdHJhdGVnaWVzIC8vIFBhc3MgZXhwbGljaXRseSB0byBlbnN1cmUgaW1tZWRpYXRlIGVmZmVjdFxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2spIHtcbiAgICAgICAgICAgIGFsZXJ0KFwiQXBwbGllZCBzdWNjZXNzZnVsbHkhXCIpO1xuICAgICAgICAgICAgbG9hZFRhYnMoKTsgLy8gUmVmcmVzaCBkYXRhXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhbGVydChcIkZhaWxlZCB0byBhcHBseTogXCIgKyAocmVzcG9uc2UuZXJyb3IgfHwgJ1Vua25vd24gZXJyb3InKSk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJBcHBseSBmYWlsZWRcIiwgZSk7XG4gICAgICAgIGFsZXJ0KFwiQXBwbHkgZmFpbGVkOiBcIiArIGUpO1xuICAgIH1cbn1cblxuXG5mdW5jdGlvbiBlc2NhcGVIdG1sKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGlmICghdGV4dCkgcmV0dXJuICcnO1xuICByZXR1cm4gdGV4dFxuICAgIC5yZXBsYWNlKC8mL2csICcmYW1wOycpXG4gICAgLnJlcGxhY2UoLzwvZywgJyZsdDsnKVxuICAgIC5yZXBsYWNlKC8+L2csICcmZ3Q7JylcbiAgICAucmVwbGFjZSgvXCIvZywgJyZxdW90OycpXG4gICAgLnJlcGxhY2UoLycvZywgJyYjMDM5OycpO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZW5kZXJMaXZlVmlldygpIHtcbiAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbGl2ZS12aWV3LWNvbnRhaW5lcicpO1xuICAgIGlmICghY29udGFpbmVyKSByZXR1cm47XG5cbiAgICB0cnkge1xuICAgICAgICBjb25zdCB0YWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICAgICAgICBjb25zdCBncm91cHMgPSBhd2FpdCBjaHJvbWUudGFiR3JvdXBzLnF1ZXJ5KHt9KTtcbiAgICAgICAgY29uc3QgZ3JvdXBNYXAgPSBuZXcgTWFwKGdyb3Vwcy5tYXAoZyA9PiBbZy5pZCwgZ10pKTtcblxuICAgICAgICBjb25zdCB3aW5kb3dzID0gbmV3IFNldCh0YWJzLm1hcCh0ID0+IHQud2luZG93SWQpKTtcbiAgICAgICAgY29uc3Qgd2luZG93SWRzID0gQXJyYXkuZnJvbSh3aW5kb3dzKS5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG5cbiAgICAgICAgbGV0IGh0bWwgPSAnPGRpdiBzdHlsZT1cImZvbnQtc2l6ZTogMC45ZW07IGNvbG9yOiAjNjY2OyBtYXJnaW4tYm90dG9tOiAxMHB4O1wiPlNlbGVjdCBpdGVtcyBiZWxvdyB0byBzaW11bGF0ZSBzcGVjaWZpYyBzZWxlY3Rpb24gc3RhdGVzLjwvZGl2Pic7XG5cbiAgICAgICAgZm9yIChjb25zdCB3aW5JZCBvZiB3aW5kb3dJZHMpIHtcbiAgICAgICAgICAgIGNvbnN0IHdpblRhYnMgPSB0YWJzLmZpbHRlcih0ID0+IHQud2luZG93SWQgPT09IHdpbklkKTtcbiAgICAgICAgICAgIGNvbnN0IHdpblNlbGVjdGVkID0gd2luVGFicy5ldmVyeSh0ID0+IHQuaWQgJiYgc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKSk7XG5cbiAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJzZWxlY3RhYmxlLWl0ZW0gJHt3aW5TZWxlY3RlZCA/ICdzZWxlY3RlZCcgOiAnJ31cIiBkYXRhLXR5cGU9XCJ3aW5kb3dcIiBkYXRhLWlkPVwiJHt3aW5JZH1cIiBzdHlsZT1cIm1hcmdpbi1ib3R0b206IDE1cHg7IGJvcmRlci1yYWRpdXM6IDRweDsgcGFkZGluZzogNXB4O1wiPmA7XG4gICAgICAgICAgICBodG1sICs9IGA8ZGl2IHN0eWxlPVwiZm9udC13ZWlnaHQ6IGJvbGQ7XCI+V2luZG93ICR7d2luSWR9PC9kaXY+YDtcblxuICAgICAgICAgICAgLy8gT3JnYW5pemUgYnkgZ3JvdXBcbiAgICAgICAgICAgIGNvbnN0IHdpbkdyb3VwcyA9IG5ldyBNYXA8bnVtYmVyLCBjaHJvbWUudGFicy5UYWJbXT4oKTtcbiAgICAgICAgICAgIGNvbnN0IHVuZ3JvdXBlZDogY2hyb21lLnRhYnMuVGFiW10gPSBbXTtcblxuICAgICAgICAgICAgd2luVGFicy5mb3JFYWNoKHQgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh0Lmdyb3VwSWQgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghd2luR3JvdXBzLmhhcyh0Lmdyb3VwSWQpKSB3aW5Hcm91cHMuc2V0KHQuZ3JvdXBJZCwgW10pO1xuICAgICAgICAgICAgICAgICAgICB3aW5Hcm91cHMuZ2V0KHQuZ3JvdXBJZCkhLnB1c2godCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdW5ncm91cGVkLnB1c2godCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFJlbmRlciBVbmdyb3VwZWRcbiAgICAgICAgICAgIGlmICh1bmdyb3VwZWQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICBodG1sICs9IGA8ZGl2IHN0eWxlPVwibWFyZ2luLWxlZnQ6IDEwcHg7IG1hcmdpbi10b3A6IDVweDtcIj5gO1xuICAgICAgICAgICAgICAgICBodG1sICs9IGA8ZGl2IHN0eWxlPVwiZm9udC1zaXplOiAwLjllbTsgY29sb3I6ICM1NTU7XCI+VW5ncm91cGVkICgke3VuZ3JvdXBlZC5sZW5ndGh9KTwvZGl2PmA7XG4gICAgICAgICAgICAgICAgIHVuZ3JvdXBlZC5mb3JFYWNoKHQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNTZWxlY3RlZCA9IHQuaWQgJiYgc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJzZWxlY3RhYmxlLWl0ZW0gJHtpc1NlbGVjdGVkID8gJ3NlbGVjdGVkJyA6ICcnfVwiIGRhdGEtdHlwZT1cInRhYlwiIGRhdGEtaWQ9XCIke3QuaWR9XCIgc3R5bGU9XCJtYXJnaW4tbGVmdDogMTBweDsgcGFkZGluZzogMnB4IDVweDsgYm9yZGVyLXJhZGl1czogM3B4OyBjdXJzb3I6IHBvaW50ZXI7IGNvbG9yOiAjMzMzOyB3aGl0ZS1zcGFjZTogbm93cmFwOyBvdmVyZmxvdzogaGlkZGVuOyB0ZXh0LW92ZXJmbG93OiBlbGxpcHNpcztcIj4tICR7ZXNjYXBlSHRtbCh0LnRpdGxlIHx8ICdVbnRpdGxlZCcpfTwvZGl2PmA7XG4gICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICBodG1sICs9IGA8L2Rpdj5gO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBSZW5kZXIgR3JvdXBzXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtncm91cElkLCBnVGFic10gb2Ygd2luR3JvdXBzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBJbmZvID0gZ3JvdXBNYXAuZ2V0KGdyb3VwSWQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbG9yID0gZ3JvdXBJbmZvPy5jb2xvciB8fCAnZ3JleSc7XG4gICAgICAgICAgICAgICAgY29uc3QgdGl0bGUgPSBncm91cEluZm8/LnRpdGxlIHx8ICdVbnRpdGxlZCBHcm91cCc7XG4gICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBTZWxlY3RlZCA9IGdUYWJzLmV2ZXJ5KHQgPT4gdC5pZCAmJiBzaW11bGF0ZWRTZWxlY3Rpb24uaGFzKHQuaWQpKTtcblxuICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJzZWxlY3RhYmxlLWl0ZW0gJHtncm91cFNlbGVjdGVkID8gJ3NlbGVjdGVkJyA6ICcnfVwiIGRhdGEtdHlwZT1cImdyb3VwXCIgZGF0YS1pZD1cIiR7Z3JvdXBJZH1cIiBzdHlsZT1cIm1hcmdpbi1sZWZ0OiAxMHB4OyBtYXJnaW4tdG9wOiA1cHg7IGJvcmRlci1sZWZ0OiAzcHggc29saWQgJHtjb2xvcn07IHBhZGRpbmctbGVmdDogNXB4OyBwYWRkaW5nOiA1cHg7IGJvcmRlci1yYWRpdXM6IDNweDtcIj5gO1xuICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgc3R5bGU9XCJmb250LXdlaWdodDogYm9sZDsgZm9udC1zaXplOiAwLjllbTtcIj4ke2VzY2FwZUh0bWwodGl0bGUpfSAoJHtnVGFicy5sZW5ndGh9KTwvZGl2PmA7XG4gICAgICAgICAgICAgICAgZ1RhYnMuZm9yRWFjaCh0ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzU2VsZWN0ZWQgPSB0LmlkICYmIHNpbXVsYXRlZFNlbGVjdGlvbi5oYXModC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwic2VsZWN0YWJsZS1pdGVtICR7aXNTZWxlY3RlZCA/ICdzZWxlY3RlZCcgOiAnJ31cIiBkYXRhLXR5cGU9XCJ0YWJcIiBkYXRhLWlkPVwiJHt0LmlkfVwiIHN0eWxlPVwibWFyZ2luLWxlZnQ6IDEwcHg7IHBhZGRpbmc6IDJweCA1cHg7IGJvcmRlci1yYWRpdXM6IDNweDsgY3Vyc29yOiBwb2ludGVyOyBjb2xvcjogIzMzMzsgd2hpdGUtc3BhY2U6IG5vd3JhcDsgb3ZlcmZsb3c6IGhpZGRlbjsgdGV4dC1vdmVyZmxvdzogZWxsaXBzaXM7XCI+LSAke2VzY2FwZUh0bWwodC50aXRsZSB8fCAnVW50aXRsZWQnKX08L2Rpdj5gO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGh0bWwgKz0gYDwvZGl2PmA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGh0bWwgKz0gYDwvZGl2PmA7XG4gICAgICAgIH1cblxuICAgICAgICBjb250YWluZXIuaW5uZXJIVE1MID0gaHRtbDtcblxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29udGFpbmVyLmlubmVySFRNTCA9IGA8cCBzdHlsZT1cImNvbG9yOnJlZFwiPkVycm9yIGxvYWRpbmcgbGl2ZSB2aWV3OiAke2V9PC9wPmA7XG4gICAgfVxufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tIExPRyBWSUVXRVIgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5sZXQgY3VycmVudExvZ3M6IExvZ0VudHJ5W10gPSBbXTtcblxuYXN5bmMgZnVuY3Rpb24gbG9hZExvZ3MoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdnZXRMb2dzJyB9KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgIGN1cnJlbnRMb2dzID0gcmVzcG9uc2UuZGF0YTtcbiAgICAgICAgICAgIHJlbmRlckxvZ3MoKTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIGxvZ3NcIiwgZSk7XG4gICAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBjbGVhclJlbW90ZUxvZ3MoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnY2xlYXJMb2dzJyB9KTtcbiAgICAgICAgbG9hZExvZ3MoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gY2xlYXIgbG9nc1wiLCBlKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHJlbmRlckxvZ3MoKSB7XG4gICAgY29uc3QgdGJvZHkgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9ncy10YWJsZS1ib2R5Jyk7XG4gICAgY29uc3QgbGV2ZWxGaWx0ZXIgPSAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvZy1sZXZlbC1maWx0ZXInKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgY29uc3Qgc2VhcmNoVGV4dCA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9nLXNlYXJjaCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlLnRvTG93ZXJDYXNlKCk7XG5cbiAgICBpZiAoIXRib2R5KSByZXR1cm47XG5cbiAgICB0Ym9keS5pbm5lckhUTUwgPSAnJztcblxuICAgIGNvbnN0IGZpbHRlcmVkID0gY3VycmVudExvZ3MuZmlsdGVyKGVudHJ5ID0+IHtcbiAgICAgICAgaWYgKGxldmVsRmlsdGVyICE9PSAnYWxsJyAmJiBlbnRyeS5sZXZlbCAhPT0gbGV2ZWxGaWx0ZXIpIHJldHVybiBmYWxzZTtcbiAgICAgICAgaWYgKHNlYXJjaFRleHQpIHtcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSBgJHtlbnRyeS5tZXNzYWdlfSAke0pTT04uc3RyaW5naWZ5KGVudHJ5LmNvbnRleHQgfHwge30pfWAudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIGlmICghdGV4dC5pbmNsdWRlcyhzZWFyY2hUZXh0KSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH0pO1xuXG4gICAgaWYgKGZpbHRlcmVkLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICB0Ym9keS5pbm5lckhUTUwgPSAnPHRyPjx0ZCBjb2xzcGFuPVwiNFwiIHN0eWxlPVwicGFkZGluZzogMTBweDsgdGV4dC1hbGlnbjogY2VudGVyOyBjb2xvcjogIzg4ODtcIj5ObyBsb2dzIGZvdW5kLjwvdGQ+PC90cj4nO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZmlsdGVyZWQuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICAgIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RyJyk7XG5cbiAgICAgICAgLy8gQ29sb3IgY29kZSBsZXZlbFxuICAgICAgICBsZXQgY29sb3IgPSAnIzMzMyc7XG4gICAgICAgIGlmIChlbnRyeS5sZXZlbCA9PT0gJ2Vycm9yJyB8fCBlbnRyeS5sZXZlbCA9PT0gJ2NyaXRpY2FsJykgY29sb3IgPSAncmVkJztcbiAgICAgICAgZWxzZSBpZiAoZW50cnkubGV2ZWwgPT09ICd3YXJuJykgY29sb3IgPSAnb3JhbmdlJztcbiAgICAgICAgZWxzZSBpZiAoZW50cnkubGV2ZWwgPT09ICdkZWJ1ZycpIGNvbG9yID0gJ2JsdWUnO1xuXG4gICAgICAgIHJvdy5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICA8dGQgc3R5bGU9XCJwYWRkaW5nOiA4cHg7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAjZWVlOyB3aGl0ZS1zcGFjZTogbm93cmFwO1wiPiR7bmV3IERhdGUoZW50cnkudGltZXN0YW1wKS50b0xvY2FsZVRpbWVTdHJpbmcoKX0gKCR7ZW50cnkudGltZXN0YW1wfSk8L3RkPlxuICAgICAgICAgICAgPHRkIHN0eWxlPVwicGFkZGluZzogOHB4OyBib3JkZXItYm90dG9tOiAxcHggc29saWQgI2VlZTsgY29sb3I6ICR7Y29sb3J9OyBmb250LXdlaWdodDogYm9sZDtcIj4ke2VudHJ5LmxldmVsLnRvVXBwZXJDYXNlKCl9PC90ZD5cbiAgICAgICAgICAgIDx0ZCBzdHlsZT1cInBhZGRpbmc6IDhweDsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICNlZWU7XCI+JHtlc2NhcGVIdG1sKGVudHJ5Lm1lc3NhZ2UpfTwvdGQ+XG4gICAgICAgICAgICA8dGQgc3R5bGU9XCJwYWRkaW5nOiA4cHg7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAjZWVlO1wiPlxuICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cIm1heC1oZWlnaHQ6IDEwMHB4OyBvdmVyZmxvdy15OiBhdXRvO1wiPlxuICAgICAgICAgICAgICAgICAgJHtlbnRyeS5jb250ZXh0ID8gYDxwcmUgc3R5bGU9XCJtYXJnaW46IDA7XCI+JHtlc2NhcGVIdG1sKEpTT04uc3RyaW5naWZ5KGVudHJ5LmNvbnRleHQsIG51bGwsIDIpKX08L3ByZT5gIDogJy0nfVxuICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L3RkPlxuICAgICAgICBgO1xuICAgICAgICB0Ym9keS5hcHBlbmRDaGlsZChyb3cpO1xuICAgIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBsb2FkR2xvYmFsTG9nTGV2ZWwoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2FkUHJlZmVyZW5jZXMnIH0pO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgICAgICAgY29uc3QgcHJlZnMgPSByZXNwb25zZS5kYXRhIGFzIFByZWZlcmVuY2VzO1xuICAgICAgICAgICAgY29uc3Qgc2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dsb2JhbC1sb2ctbGV2ZWwnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgIGlmIChzZWxlY3QpIHtcbiAgICAgICAgICAgICAgICBzZWxlY3QudmFsdWUgPSBwcmVmcy5sb2dMZXZlbCB8fCAnaW5mbyc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBwcmVmcyBmb3IgbG9nc1wiLCBlKTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHVwZGF0ZUdsb2JhbExvZ0xldmVsKCkge1xuICAgIGNvbnN0IHNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnbG9iYWwtbG9nLWxldmVsJykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgaWYgKCFzZWxlY3QpIHJldHVybjtcbiAgICBjb25zdCBsZXZlbCA9IHNlbGVjdC52YWx1ZSBhcyBMb2dMZXZlbDtcblxuICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgcGF5bG9hZDogeyBsb2dMZXZlbDogbGV2ZWwgfVxuICAgICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gc2F2ZSBsb2cgbGV2ZWxcIiwgZSk7XG4gICAgfVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUVBLElBQU0sU0FBUztBQUVmLElBQU0saUJBQTJDO0FBQUEsRUFDL0MsT0FBTztBQUFBLEVBQ1AsTUFBTTtBQUFBLEVBQ04sTUFBTTtBQUFBLEVBQ04sT0FBTztBQUFBLEVBQ1AsVUFBVTtBQUNaO0FBRUEsSUFBSSxlQUF5QjtBQUM3QixJQUFJLE9BQW1CLENBQUM7QUFDeEIsSUFBTSxXQUFXO0FBQ2pCLElBQU0sY0FBYztBQUdwQixJQUFNLGtCQUFrQixPQUFPLFNBQVMsZUFDaEIsT0FBUSxLQUFhLDZCQUE2QixlQUNsRCxnQkFBaUIsS0FBYTtBQUN0RCxJQUFJLFdBQVc7QUFDZixJQUFJLGNBQWM7QUFDbEIsSUFBSSxZQUFrRDtBQUV0RCxJQUFNLFNBQVMsTUFBTTtBQUNqQixNQUFJLENBQUMsbUJBQW1CLENBQUMsUUFBUSxTQUFTLFdBQVcsVUFBVTtBQUMzRCxrQkFBYztBQUNkO0FBQUEsRUFDSjtBQUVBLGFBQVc7QUFDWCxnQkFBYztBQUVkLFNBQU8sUUFBUSxRQUFRLElBQUksRUFBRSxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUMsRUFBRSxLQUFLLE1BQU07QUFDM0QsZUFBVztBQUNYLFFBQUksYUFBYTtBQUNiLHdCQUFrQjtBQUFBLElBQ3RCO0FBQUEsRUFDSixDQUFDLEVBQUUsTUFBTSxTQUFPO0FBQ1osWUFBUSxNQUFNLHVCQUF1QixHQUFHO0FBQ3hDLGVBQVc7QUFBQSxFQUNmLENBQUM7QUFDTDtBQUVBLElBQU0sb0JBQW9C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LEtBQUssSUFBSSxTQUFTLFVBQVUsRUFBRyxXQUFVO0FBQUEsV0FDN0YsSUFBSSxTQUFTLFFBQVEsS0FBSyxJQUFJLFNBQVMsT0FBTyxLQUFLLElBQUksU0FBUyxRQUFRLEtBQUssSUFBSSxTQUFTLEtBQUssS0FBSyxJQUFJLFNBQVMsVUFBVSxFQUFHLFdBQVU7QUFBQSxXQUN4SSxJQUFJLFNBQVMsWUFBWSxLQUFLLElBQUksU0FBUyxVQUFVLEtBQUssSUFBSSxTQUFTLFNBQVMsRUFBRyxXQUFVO0FBQUEsV0FDN0YsSUFBSSxTQUFTLFlBQVksS0FBSyxJQUFJLFNBQVMsU0FBUyxLQUFLLElBQUksU0FBUyxVQUFVLEtBQUssSUFBSSxTQUFTLFlBQVksRUFBRyxXQUFVO0FBRXBJLFNBQU8sRUFBRSxTQUFTLFFBQVEsWUFBWTtBQUN4Qzs7O0FDbElPLElBQU0sYUFBbUM7QUFBQSxFQUM1QyxFQUFFLElBQUksVUFBVSxPQUFPLFVBQVUsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUM1RixFQUFFLElBQUksZUFBZSxPQUFPLGVBQWUsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUN0RyxFQUFFLElBQUksU0FBUyxPQUFPLFNBQVMsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUMxRixFQUFFLElBQUksV0FBVyxPQUFPLFdBQVcsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUM5RixFQUFFLElBQUksV0FBVyxPQUFPLFdBQVcsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUM5RixFQUFFLElBQUksVUFBVSxPQUFPLFVBQVUsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUM1RixFQUFFLElBQUksV0FBVyxPQUFPLFdBQVcsWUFB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QWEsUUFBTztBQUNqRSxRQUFJLFlBQVk7QUFDWixZQUFNLE9BQU8sR0FBRyxNQUFNLE9BQU8sSUFBSSxLQUFLLFVBQVUsTUFBTSxXQUFXLENBQUMsQ0FBQyxDQUFDLEdBQUcsWUFBWTtBQUNuRixVQUFJLENBQUMsS0FBSyxTQUFTLFVBQVUsRUFBRyxRQUFPO0FBQUEsSUFDM0M7QUFDQSxXQUFPO0FBQUEsRUFDWCxDQUFDO0FBRUQsTUFBSSxTQUFTLFdBQVcsR0FBRztBQUN2QixVQUFNLFlBQVk7QUFDbEI7QUFBQSxFQUNKO0FBRUEsV0FBUyxRQUFRLFdBQVM7QUFDdEIsVUFBTSxNQUFNLFNBQVMsY0FBYyxJQUFJO0FBR3ZDLFFBQUksUUFBUTtBQUNaLFFBQUksTUFBTSxVQUFVLFdBQVcsTUFBTSxVQUFVLFdBQVksU0FBUTtBQUFBLGFBQzFELE1BQU0sVUFBVSxPQUFRLFNBQVE7QUFBQSxhQUNoQyxNQUFNLFVBQVUsUUFBUyxTQUFRO0FBRTFDLFFBQUksWUFBWTtBQUFBLDRGQUNvRSxJQUFJLEtBQUssTUFBTSxTQUFTLEVBQUUsbUJBQW1CLENBQUMsS0FBSyxNQUFNLFNBQVM7QUFBQSw2RUFDakYsS0FBSyx5QkFBeUIsTUFBTSxNQUFNLFlBQVksQ0FBQztBQUFBLHVFQUM3RCxXQUFXLE1BQU0sT0FBTyxDQUFDO0FBQUE7QUFBQTtBQUFBLG9CQUc1RSxNQUFNLFVBQVUsMkJBQTJCLFdBQVcsS0FBSyxVQUFVLE1BQU0sU0FBUyxNQUFNLENBQUMsQ0FBQyxDQUFDLFdBQVcsR0FBRztBQUFBO0FBQUE7QUFBQTtBQUl2SCxVQUFNLFlBQVksR0FBRztBQUFBLEVBQ3pCLENBQUM7QUFDTDtBQUVBLGVBQWUscUJBQXFCO0FBQ2hDLE1BQUk7QUFDQSxVQUFNLFdBQVcsTUFBTSxPQUFPLFFBQVEsWUFBWSxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFDN0UsUUFBSSxZQUFZLFNBQVMsTUFBTSxTQUFTLE1BQU07QUFDMUMsWUFBTSxRQUFRLFNBQVM7QUFDdkIsWUFBTSxTQUFTLFNBQVMsZUFBZSxrQkFBa0I7QUFDekQsVUFBSSxRQUFRO0FBQ1IsZUFBTyxRQUFRLE1BQU0sWUFBWTtBQUFBLE1BQ3JDO0FBQUEsSUFDSjtBQUFBLEVBQ0osU0FBUyxHQUFHO0FBQ1IsWUFBUSxNQUFNLGlDQUFpQyxDQUFDO0FBQUEsRUFDcEQ7QUFDSjtBQUVBLGVBQWUsdUJBQXVCO0FBQ2xDLFFBQU0sU0FBUyxTQUFTLGVBQWUsa0JBQWtCO0FBQ3pELE1BQUksQ0FBQyxPQUFRO0FBQ2IsUUFBTSxRQUFRLE9BQU87QUFFckIsTUFBSTtBQUNBLFVBQU0sT0FBTyxRQUFRLFlBQVk7QUFBQSxNQUM3QixNQUFNO0FBQUEsTUFDTixTQUFTLEVBQUUsVUFBVSxNQUFNO0FBQUEsSUFDL0IsQ0FBQztBQUFBLEVBQ0wsU0FBUyxHQUFHO0FBQ1IsWUFBUSxNQUFNLDRCQUE0QixDQUFDO0FBQUEsRUFDL0M7QUFDSjsiLAogICJuYW1lcyI6IFsicGFydHMiLCAiY3VzdG9tU3RyYXRlZ2llcyIsICJtYXRjaCIsICJncm91cFRhYnMiXQp9Cg==
