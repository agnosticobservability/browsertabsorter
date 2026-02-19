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
function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

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
    case "siteName":
      return tab.id && currentContextMap.get(tab.id)?.data?.siteName || "";
    case "platform":
      return tab.id && currentContextMap.get(tab.id)?.data?.platform || "";
    case "objectType":
      return tab.id && currentContextMap.get(tab.id)?.data?.objectType || "";
    case "extractedTitle":
      return tab.id && currentContextMap.get(tab.id)?.data?.title || "";
    case "authorOrCreator":
      return tab.id && currentContextMap.get(tab.id)?.data?.authorOrCreator || "";
    case "publishedAt":
      return tab.id && currentContextMap.get(tab.id)?.data?.publishedAt || "";
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC9sb2dnZXIudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZXh0cmFjdGlvbi9sb2dpYy50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9leHRyYWN0aW9uL2dlbmVyYVJlZ2lzdHJ5LnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3N0b3JhZ2UudHMiLCAiLi4vLi4vc3JjL3NoYXJlZC91dGlscy50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9wcmVmZXJlbmNlcy50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9leHRyYWN0aW9uL2luZGV4LnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2NhdGVnb3J5UnVsZXMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvY29udGV4dEFuYWx5c2lzLnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9ncm91cGluZ1N0cmF0ZWdpZXMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvc29ydGluZ1N0cmF0ZWdpZXMudHMiLCAiLi4vLi4vc3JjL3VpL2NvbW1vbi50cyIsICIuLi8uLi9zcmMvdWkvZGV2dG9vbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IExvZ0VudHJ5LCBMb2dMZXZlbCwgUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5jb25zdCBQUkVGSVggPSBcIltUYWJTb3J0ZXJdXCI7XG5cbmNvbnN0IExFVkVMX1BSSU9SSVRZOiBSZWNvcmQ8TG9nTGV2ZWwsIG51bWJlcj4gPSB7XG4gIGRlYnVnOiAwLFxuICBpbmZvOiAxLFxuICB3YXJuOiAyLFxuICBlcnJvcjogMyxcbiAgY3JpdGljYWw6IDRcbn07XG5cbmxldCBjdXJyZW50TGV2ZWw6IExvZ0xldmVsID0gXCJpbmZvXCI7XG5sZXQgbG9nczogTG9nRW50cnlbXSA9IFtdO1xuY29uc3QgTUFYX0xPR1MgPSAxMDAwO1xuY29uc3QgU1RPUkFHRV9LRVkgPSBcInNlc3Npb25Mb2dzXCI7XG5cbi8vIFNhZmUgY29udGV4dCBjaGVja1xuY29uc3QgaXNTZXJ2aWNlV29ya2VyID0gdHlwZW9mIHNlbGYgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlb2YgKHNlbGYgYXMgYW55KS5TZXJ2aWNlV29ya2VyR2xvYmFsU2NvcGUgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmIGluc3RhbmNlb2YgKHNlbGYgYXMgYW55KS5TZXJ2aWNlV29ya2VyR2xvYmFsU2NvcGU7XG5sZXQgaXNTYXZpbmcgPSBmYWxzZTtcbmxldCBwZW5kaW5nU2F2ZSA9IGZhbHNlO1xubGV0IHNhdmVUaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcblxuY29uc3QgZG9TYXZlID0gKCkgPT4ge1xuICAgIGlmICghaXNTZXJ2aWNlV29ya2VyIHx8ICFjaHJvbWU/LnN0b3JhZ2U/LnNlc3Npb24gfHwgaXNTYXZpbmcpIHtcbiAgICAgICAgcGVuZGluZ1NhdmUgPSB0cnVlO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaXNTYXZpbmcgPSB0cnVlO1xuICAgIHBlbmRpbmdTYXZlID0gZmFsc2U7XG5cbiAgICBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uLnNldCh7IFtTVE9SQUdFX0tFWV06IGxvZ3MgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGlzU2F2aW5nID0gZmFsc2U7XG4gICAgICAgIGlmIChwZW5kaW5nU2F2ZSkge1xuICAgICAgICAgICAgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbiAgICAgICAgfVxuICAgIH0pLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gc2F2ZSBsb2dzXCIsIGVycik7XG4gICAgICAgIGlzU2F2aW5nID0gZmFsc2U7XG4gICAgfSk7XG59O1xuXG5jb25zdCBzYXZlTG9nc1RvU3RvcmFnZSA9ICgpID0+IHtcbiAgICBpZiAoc2F2ZVRpbWVyKSBjbGVhclRpbWVvdXQoc2F2ZVRpbWVyKTtcbiAgICBzYXZlVGltZXIgPSBzZXRUaW1lb3V0KGRvU2F2ZSwgMTAwMCk7XG59O1xuXG5sZXQgcmVzb2x2ZUxvZ2dlclJlYWR5OiAoKSA9PiB2b2lkO1xuZXhwb3J0IGNvbnN0IGxvZ2dlclJlYWR5ID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG4gICAgcmVzb2x2ZUxvZ2dlclJlYWR5ID0gcmVzb2x2ZTtcbn0pO1xuXG5leHBvcnQgY29uc3QgaW5pdExvZ2dlciA9IGFzeW5jICgpID0+IHtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyICYmIGNocm9tZT8uc3RvcmFnZT8uc2Vzc2lvbikge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2hyb21lLnN0b3JhZ2Uuc2Vzc2lvbi5nZXQoU1RPUkFHRV9LRVkpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdFtTVE9SQUdFX0tFWV0gJiYgQXJyYXkuaXNBcnJheShyZXN1bHRbU1RPUkFHRV9LRVldKSkge1xuICAgICAgICAgICAgICAgIGxvZ3MgPSByZXN1bHRbU1RPUkFHRV9LRVldO1xuICAgICAgICAgICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSBsb2dzID0gbG9ncy5zbGljZSgwLCBNQVhfTE9HUyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gcmVzdG9yZSBsb2dzXCIsIGUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChyZXNvbHZlTG9nZ2VyUmVhZHkpIHJlc29sdmVMb2dnZXJSZWFkeSgpO1xufTtcblxuZXhwb3J0IGNvbnN0IHNldExvZ2dlclByZWZlcmVuY2VzID0gKHByZWZzOiBQcmVmZXJlbmNlcykgPT4ge1xuICBpZiAocHJlZnMubG9nTGV2ZWwpIHtcbiAgICBjdXJyZW50TGV2ZWwgPSBwcmVmcy5sb2dMZXZlbDtcbiAgfSBlbHNlIGlmIChwcmVmcy5kZWJ1Zykge1xuICAgIGN1cnJlbnRMZXZlbCA9IFwiZGVidWdcIjtcbiAgfSBlbHNlIHtcbiAgICBjdXJyZW50TGV2ZWwgPSBcImluZm9cIjtcbiAgfVxufTtcblxuY29uc3Qgc2hvdWxkTG9nID0gKGxldmVsOiBMb2dMZXZlbCk6IGJvb2xlYW4gPT4ge1xuICByZXR1cm4gTEVWRUxfUFJJT1JJVFlbbGV2ZWxdID49IExFVkVMX1BSSU9SSVRZW2N1cnJlbnRMZXZlbF07XG59O1xuXG5jb25zdCBmb3JtYXRNZXNzYWdlID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIHJldHVybiBjb250ZXh0ID8gYCR7bWVzc2FnZX0gOjogJHtKU09OLnN0cmluZ2lmeShjb250ZXh0KX1gIDogbWVzc2FnZTtcbn07XG5cbmNvbnN0IGFkZExvZyA9IChsZXZlbDogTG9nTGV2ZWwsIG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGlmIChzaG91bGRMb2cobGV2ZWwpKSB7XG4gICAgICBjb25zdCBlbnRyeTogTG9nRW50cnkgPSB7XG4gICAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgICAgICAgIGxldmVsLFxuICAgICAgICAgIG1lc3NhZ2UsXG4gICAgICAgICAgY29udGV4dFxuICAgICAgfTtcblxuICAgICAgaWYgKGlzU2VydmljZVdvcmtlcikge1xuICAgICAgICAgIGxvZ3MudW5zaGlmdChlbnRyeSk7XG4gICAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIHtcbiAgICAgICAgICAgICAgbG9ncy5wb3AoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gSW4gb3RoZXIgY29udGV4dHMsIHNlbmQgdG8gU1dcbiAgICAgICAgICBpZiAoY2hyb21lPy5ydW50aW1lPy5zZW5kTWVzc2FnZSkge1xuICAgICAgICAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvZ0VudHJ5JywgcGF5bG9hZDogZW50cnkgfSkuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgICAgICAgICAvLyBJZ25vcmUgaWYgbWVzc2FnZSBmYWlscyAoZS5nLiBjb250ZXh0IGludmFsaWRhdGVkKVxuICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgIH1cbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGFkZExvZ0VudHJ5ID0gKGVudHJ5OiBMb2dFbnRyeSkgPT4ge1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIpIHtcbiAgICAgICAgbG9ncy51bnNoaWZ0KGVudHJ5KTtcbiAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIHtcbiAgICAgICAgICAgIGxvZ3MucG9wKCk7XG4gICAgICAgIH1cbiAgICAgICAgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbiAgICB9XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0TG9ncyA9ICgpID0+IFsuLi5sb2dzXTtcbmV4cG9ydCBjb25zdCBjbGVhckxvZ3MgPSAoKSA9PiB7XG4gICAgbG9ncy5sZW5ndGggPSAwO1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIpIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG59O1xuXG5leHBvcnQgY29uc3QgbG9nRGVidWcgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiZGVidWdcIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJkZWJ1Z1wiKSkge1xuICAgIGNvbnNvbGUuZGVidWcoYCR7UFJFRklYfSBbREVCVUddICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0luZm8gPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiaW5mb1wiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcImluZm9cIikpIHtcbiAgICBjb25zb2xlLmluZm8oYCR7UFJFRklYfSBbSU5GT10gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nV2FybiA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJ3YXJuXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwid2FyblwiKSkge1xuICAgIGNvbnNvbGUud2FybihgJHtQUkVGSVh9IFtXQVJOXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dFcnJvciA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJlcnJvclwiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcImVycm9yXCIpKSB7XG4gICAgY29uc29sZS5lcnJvcihgJHtQUkVGSVh9IFtFUlJPUl0gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nQ3JpdGljYWwgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiY3JpdGljYWxcIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJjcml0aWNhbFwiKSkge1xuICAgIC8vIENyaXRpY2FsIGxvZ3MgdXNlIGVycm9yIGNvbnNvbGUgYnV0IHdpdGggZGlzdGluY3QgcHJlZml4IGFuZCBtYXliZSBzdHlsaW5nIGlmIHN1cHBvcnRlZFxuICAgIGNvbnNvbGUuZXJyb3IoYCR7UFJFRklYfSBbQ1JJVElDQUxdIFx1RDgzRFx1REVBOCAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG4iLCAiLy8gbG9naWMudHNcbi8vIFB1cmUgZnVuY3Rpb25zIGZvciBleHRyYWN0aW9uIGxvZ2ljXG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVVcmwodXJsU3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuICB0cnkge1xuICAgIGNvbnN0IHVybCA9IG5ldyBVUkwodXJsU3RyKTtcbiAgICBjb25zdCBwYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHVybC5zZWFyY2gpO1xuICAgIGNvbnN0IGtleXM6IHN0cmluZ1tdID0gW107XG4gICAgcGFyYW1zLmZvckVhY2goKF8sIGtleSkgPT4ga2V5cy5wdXNoKGtleSkpO1xuICAgIGNvbnN0IGhvc3RuYW1lID0gdXJsLmhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCAnJyk7XG5cbiAgICBjb25zdCBUUkFDS0lORyA9IFsvXnV0bV8vLCAvXmZiY2xpZCQvLCAvXmdjbGlkJC8sIC9eX2dhJC8sIC9ecmVmJC8sIC9eeWNsaWQkLywgL15faHMvXTtcbiAgICBjb25zdCBpc1lvdXR1YmUgPSBob3N0bmFtZS5lbmRzV2l0aCgneW91dHViZS5jb20nKSB8fCBob3N0bmFtZS5lbmRzV2l0aCgneW91dHUuYmUnKTtcbiAgICBjb25zdCBpc0dvb2dsZSA9IGhvc3RuYW1lLmVuZHNXaXRoKCdnb29nbGUuY29tJyk7XG5cbiAgICBjb25zdCBrZWVwOiBzdHJpbmdbXSA9IFtdO1xuICAgIGlmIChpc1lvdXR1YmUpIGtlZXAucHVzaCgndicsICdsaXN0JywgJ3QnLCAnYycsICdjaGFubmVsJywgJ3BsYXlsaXN0Jyk7XG4gICAgaWYgKGlzR29vZ2xlKSBrZWVwLnB1c2goJ3EnLCAnaWQnLCAnc291cmNlaWQnKTtcblxuICAgIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICAgIGlmIChUUkFDS0lORy5zb21lKHIgPT4gci50ZXN0KGtleSkpKSB7XG4gICAgICAgICBwYXJhbXMuZGVsZXRlKGtleSk7XG4gICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICgoaXNZb3V0dWJlIHx8IGlzR29vZ2xlKSAmJiAha2VlcC5pbmNsdWRlcyhrZXkpKSB7XG4gICAgICAgICBwYXJhbXMuZGVsZXRlKGtleSk7XG4gICAgICB9XG4gICAgfVxuICAgIHVybC5zZWFyY2ggPSBwYXJhbXMudG9TdHJpbmcoKTtcbiAgICByZXR1cm4gdXJsLnRvU3RyaW5nKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gdXJsU3RyO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVlvdVR1YmVVcmwodXJsU3RyOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHVybFN0cik7XG4gICAgICAgIGNvbnN0IHYgPSB1cmwuc2VhcmNoUGFyYW1zLmdldCgndicpO1xuICAgICAgICBjb25zdCBpc1Nob3J0cyA9IHVybC5wYXRobmFtZS5pbmNsdWRlcygnL3Nob3J0cy8nKTtcbiAgICAgICAgbGV0IHZpZGVvSWQgPVxuICAgICAgICAgIHYgfHxcbiAgICAgICAgICAoaXNTaG9ydHMgPyB1cmwucGF0aG5hbWUuc3BsaXQoJy9zaG9ydHMvJylbMV0gOiBudWxsKSB8fFxuICAgICAgICAgICh1cmwuaG9zdG5hbWUgPT09ICd5b3V0dS5iZScgPyB1cmwucGF0aG5hbWUucmVwbGFjZSgnLycsICcnKSA6IG51bGwpO1xuXG4gICAgICAgIGNvbnN0IHBsYXlsaXN0SWQgPSB1cmwuc2VhcmNoUGFyYW1zLmdldCgnbGlzdCcpO1xuICAgICAgICBjb25zdCBwbGF5bGlzdEluZGV4ID0gcGFyc2VJbnQodXJsLnNlYXJjaFBhcmFtcy5nZXQoJ2luZGV4JykgfHwgJzAnLCAxMCk7XG5cbiAgICAgICAgcmV0dXJuIHsgdmlkZW9JZCwgaXNTaG9ydHMsIHBsYXlsaXN0SWQsIHBsYXlsaXN0SW5kZXggfTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHJldHVybiB7IHZpZGVvSWQ6IG51bGwsIGlzU2hvcnRzOiBmYWxzZSwgcGxheWxpc3RJZDogbnVsbCwgcGxheWxpc3RJbmRleDogbnVsbCB9O1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZXh0cmFjdEF1dGhvcihlbnRpdHk6IGFueSk6IHN0cmluZyB8IG51bGwge1xuICAgIGlmICghZW50aXR5IHx8ICFlbnRpdHkuYXV0aG9yKSByZXR1cm4gbnVsbDtcbiAgICBpZiAodHlwZW9mIGVudGl0eS5hdXRob3IgPT09ICdzdHJpbmcnKSByZXR1cm4gZW50aXR5LmF1dGhvcjtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShlbnRpdHkuYXV0aG9yKSkgcmV0dXJuIGVudGl0eS5hdXRob3JbMF0/Lm5hbWUgfHwgbnVsbDtcbiAgICBpZiAodHlwZW9mIGVudGl0eS5hdXRob3IgPT09ICdvYmplY3QnKSByZXR1cm4gZW50aXR5LmF1dGhvci5uYW1lIHx8IG51bGw7XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RLZXl3b3JkcyhlbnRpdHk6IGFueSk6IHN0cmluZ1tdIHtcbiAgICBpZiAoIWVudGl0eSB8fCAhZW50aXR5LmtleXdvcmRzKSByZXR1cm4gW107XG4gICAgaWYgKHR5cGVvZiBlbnRpdHkua2V5d29yZHMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiBlbnRpdHkua2V5d29yZHMuc3BsaXQoJywnKS5tYXAoKHM6IHN0cmluZykgPT4gcy50cmltKCkpO1xuICAgIH1cbiAgICBpZiAoQXJyYXkuaXNBcnJheShlbnRpdHkua2V5d29yZHMpKSByZXR1cm4gZW50aXR5LmtleXdvcmRzO1xuICAgIHJldHVybiBbXTtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdEJyZWFkY3J1bWJzKGpzb25MZDogYW55W10pOiBzdHJpbmdbXSB7XG4gICAgY29uc3QgYnJlYWRjcnVtYkxkID0ganNvbkxkLmZpbmQoaSA9PiBpICYmIGlbJ0B0eXBlJ10gPT09ICdCcmVhZGNydW1iTGlzdCcpO1xuICAgIGlmICghYnJlYWRjcnVtYkxkIHx8ICFBcnJheS5pc0FycmF5KGJyZWFkY3J1bWJMZC5pdGVtTGlzdEVsZW1lbnQpKSByZXR1cm4gW107XG5cbiAgICBjb25zdCBsaXN0ID0gYnJlYWRjcnVtYkxkLml0ZW1MaXN0RWxlbWVudC5zb3J0KChhOiBhbnksIGI6IGFueSkgPT4gKGEucG9zaXRpb24gfHwgMCkgLSAoYi5wb3NpdGlvbiB8fCAwKSk7XG4gICAgY29uc3QgYnJlYWRjcnVtYnM6IHN0cmluZ1tdID0gW107XG4gICAgbGlzdC5mb3JFYWNoKChpdGVtOiBhbnkpID0+IHtcbiAgICAgICAgaWYgKGl0ZW0ubmFtZSkgYnJlYWRjcnVtYnMucHVzaChpdGVtLm5hbWUpO1xuICAgICAgICBlbHNlIGlmIChpdGVtLml0ZW0gJiYgaXRlbS5pdGVtLm5hbWUpIGJyZWFkY3J1bWJzLnB1c2goaXRlbS5pdGVtLm5hbWUpO1xuICAgIH0pO1xuICAgIHJldHVybiBicmVhZGNydW1icztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RKc29uTGRGaWVsZHMoanNvbkxkOiBhbnlbXSkge1xuICAgIC8vIEZpbmQgbWFpbiBlbnRpdHlcbiAgICAvLyBBZGRlZCBzYWZldHkgY2hlY2s6IGkgJiYgaVsnQHR5cGUnXVxuICAgIGNvbnN0IG1haW5FbnRpdHkgPSBqc29uTGQuZmluZChpID0+IGkgJiYgKGlbJ0B0eXBlJ10gPT09ICdBcnRpY2xlJyB8fCBpWydAdHlwZSddID09PSAnVmlkZW9PYmplY3QnIHx8IGlbJ0B0eXBlJ10gPT09ICdOZXdzQXJ0aWNsZScpKSB8fCBqc29uTGRbMF07XG5cbiAgICBsZXQgYXV0aG9yOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgcHVibGlzaGVkQXQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIGxldCBtb2RpZmllZEF0OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgdGFnczogc3RyaW5nW10gPSBbXTtcblxuICAgIGlmIChtYWluRW50aXR5KSB7XG4gICAgICAgIGF1dGhvciA9IGV4dHJhY3RBdXRob3IobWFpbkVudGl0eSk7XG4gICAgICAgIHB1Ymxpc2hlZEF0ID0gbWFpbkVudGl0eS5kYXRlUHVibGlzaGVkIHx8IG51bGw7XG4gICAgICAgIG1vZGlmaWVkQXQgPSBtYWluRW50aXR5LmRhdGVNb2RpZmllZCB8fCBudWxsO1xuICAgICAgICB0YWdzID0gZXh0cmFjdEtleXdvcmRzKG1haW5FbnRpdHkpO1xuICAgIH1cblxuICAgIGNvbnN0IGJyZWFkY3J1bWJzID0gZXh0cmFjdEJyZWFkY3J1bWJzKGpzb25MZCk7XG5cbiAgICByZXR1cm4geyBhdXRob3IsIHB1Ymxpc2hlZEF0LCBtb2RpZmllZEF0LCB0YWdzLCBicmVhZGNydW1icyB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdFlvdVR1YmVDaGFubmVsRnJvbUh0bWwoaHRtbDogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG4gIC8vIDEuIFRyeSBKU09OLUxEXG4gIC8vIExvb2sgZm9yIDxzY3JpcHQgdHlwZT1cImFwcGxpY2F0aW9uL2xkK2pzb25cIj4uLi48L3NjcmlwdD5cbiAgLy8gV2UgbmVlZCB0byBsb29wIGJlY2F1c2UgdGhlcmUgbWlnaHQgYmUgbXVsdGlwbGUgc2NyaXB0c1xuICBjb25zdCBzY3JpcHRSZWdleCA9IC88c2NyaXB0XFxzK3R5cGU9W1wiJ11hcHBsaWNhdGlvblxcL2xkXFwranNvbltcIiddW14+XSo+KFtcXHNcXFNdKj8pPFxcL3NjcmlwdD4vZ2k7XG4gIGxldCBtYXRjaDtcbiAgd2hpbGUgKChtYXRjaCA9IHNjcmlwdFJlZ2V4LmV4ZWMoaHRtbCkpICE9PSBudWxsKSB7XG4gICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGpzb24gPSBKU09OLnBhcnNlKG1hdGNoWzFdKTtcbiAgICAgICAgICBjb25zdCBhcnJheSA9IEFycmF5LmlzQXJyYXkoanNvbikgPyBqc29uIDogW2pzb25dO1xuICAgICAgICAgIGNvbnN0IGZpZWxkcyA9IGV4dHJhY3RKc29uTGRGaWVsZHMoYXJyYXkpO1xuICAgICAgICAgIGlmIChmaWVsZHMuYXV0aG9yKSByZXR1cm4gZmllbGRzLmF1dGhvcjtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAvLyBpZ25vcmUgcGFyc2UgZXJyb3JzXG4gICAgICB9XG4gIH1cblxuICAvLyAyLiBUcnkgPGxpbmsgaXRlbXByb3A9XCJuYW1lXCIgY29udGVudD1cIi4uLlwiPiAoWW91VHViZSBvZnRlbiBwdXRzIGNoYW5uZWwgbmFtZSBoZXJlIGluIHNvbWUgY29udGV4dHMpXG4gIC8vIE9yIDxtZXRhIGl0ZW1wcm9wPVwiY2hhbm5lbElkXCIgY29udGVudD1cIi4uLlwiPiAtPiBidXQgdGhhdCdzIElELlxuICAvLyA8bGluayBpdGVtcHJvcD1cIm5hbWVcIiBjb250ZW50PVwiQ2hhbm5lbCBOYW1lXCI+XG4gIC8vIDxzcGFuIGl0ZW1wcm9wPVwiYXV0aG9yXCIgaXRlbXNjb3BlIGl0ZW10eXBlPVwiaHR0cDovL3NjaGVtYS5vcmcvUGVyc29uXCI+PGxpbmsgaXRlbXByb3A9XCJuYW1lXCIgY29udGVudD1cIkNoYW5uZWwgTmFtZVwiPjwvc3Bhbj5cbiAgY29uc3QgbGlua05hbWVSZWdleCA9IC88bGlua1xccytpdGVtcHJvcD1bXCInXW5hbWVbXCInXVxccytjb250ZW50PVtcIiddKFteXCInXSspW1wiJ11cXHMqXFwvPz4vaTtcbiAgY29uc3QgbGlua01hdGNoID0gbGlua05hbWVSZWdleC5leGVjKGh0bWwpO1xuICBpZiAobGlua01hdGNoICYmIGxpbmtNYXRjaFsxXSkgcmV0dXJuIGRlY29kZUh0bWxFbnRpdGllcyhsaW5rTWF0Y2hbMV0pO1xuXG4gIC8vIDMuIFRyeSBtZXRhIGF1dGhvclxuICBjb25zdCBtZXRhQXV0aG9yUmVnZXggPSAvPG1ldGFcXHMrbmFtZT1bXCInXWF1dGhvcltcIiddXFxzK2NvbnRlbnQ9W1wiJ10oW15cIiddKylbXCInXVxccypcXC8/Pi9pO1xuICBjb25zdCBtZXRhTWF0Y2ggPSBtZXRhQXV0aG9yUmVnZXguZXhlYyhodG1sKTtcbiAgaWYgKG1ldGFNYXRjaCAmJiBtZXRhTWF0Y2hbMV0pIHtcbiAgICAgIC8vIFlvdVR1YmUgbWV0YSBhdXRob3IgaXMgb2Z0ZW4gXCJDaGFubmVsIE5hbWVcIlxuICAgICAgcmV0dXJuIGRlY29kZUh0bWxFbnRpdGllcyhtZXRhTWF0Y2hbMV0pO1xuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0WW91VHViZUdlbnJlRnJvbUh0bWwoaHRtbDogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG4gIC8vIDEuIFRyeSA8bWV0YSBpdGVtcHJvcD1cImdlbnJlXCIgY29udGVudD1cIi4uLlwiPlxuICBjb25zdCBtZXRhR2VucmVSZWdleCA9IC88bWV0YVxccytpdGVtcHJvcD1bXCInXWdlbnJlW1wiJ11cXHMrY29udGVudD1bXCInXShbXlwiJ10rKVtcIiddXFxzKlxcLz8+L2k7XG4gIGNvbnN0IG1ldGFNYXRjaCA9IG1ldGFHZW5yZVJlZ2V4LmV4ZWMoaHRtbCk7XG4gIGlmIChtZXRhTWF0Y2ggJiYgbWV0YU1hdGNoWzFdKSB7XG4gICAgICByZXR1cm4gZGVjb2RlSHRtbEVudGl0aWVzKG1ldGFNYXRjaFsxXSk7XG4gIH1cblxuICAvLyAyLiBUcnkgSlNPTiBcImNhdGVnb3J5XCIgaW4gc2NyaXB0c1xuICAvLyBcImNhdGVnb3J5XCI6XCJHYW1pbmdcIlxuICBjb25zdCBjYXRlZ29yeVJlZ2V4ID0gL1wiY2F0ZWdvcnlcIlxccyo6XFxzKlwiKFteXCJdKylcIi87XG4gIGNvbnN0IGNhdE1hdGNoID0gY2F0ZWdvcnlSZWdleC5leGVjKGh0bWwpO1xuICBpZiAoY2F0TWF0Y2ggJiYgY2F0TWF0Y2hbMV0pIHtcbiAgICAgIHJldHVybiBkZWNvZGVIdG1sRW50aXRpZXMoY2F0TWF0Y2hbMV0pO1xuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGRlY29kZUh0bWxFbnRpdGllcyh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBpZiAoIXRleHQpIHJldHVybiB0ZXh0O1xuXG4gIGNvbnN0IGVudGl0aWVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICcmYW1wOyc6ICcmJyxcbiAgICAnJmx0Oyc6ICc8JyxcbiAgICAnJmd0Oyc6ICc+JyxcbiAgICAnJnF1b3Q7JzogJ1wiJyxcbiAgICAnJiMzOTsnOiBcIidcIixcbiAgICAnJmFwb3M7JzogXCInXCIsXG4gICAgJyZuYnNwOyc6ICcgJ1xuICB9O1xuXG4gIHJldHVybiB0ZXh0LnJlcGxhY2UoLyYoW2EtejAtOV0rfCNbMC05XXsxLDZ9fCN4WzAtOWEtZkEtRl17MSw2fSk7L2lnLCAobWF0Y2gpID0+IHtcbiAgICAgIGNvbnN0IGxvd2VyID0gbWF0Y2gudG9Mb3dlckNhc2UoKTtcbiAgICAgIGlmIChlbnRpdGllc1tsb3dlcl0pIHJldHVybiBlbnRpdGllc1tsb3dlcl07XG4gICAgICBpZiAoZW50aXRpZXNbbWF0Y2hdKSByZXR1cm4gZW50aXRpZXNbbWF0Y2hdO1xuXG4gICAgICBpZiAobG93ZXIuc3RhcnRzV2l0aCgnJiN4JykpIHtcbiAgICAgICAgICB0cnkgeyByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJzZUludChsb3dlci5zbGljZSgzLCAtMSksIDE2KSk7IH0gY2F0Y2ggeyByZXR1cm4gbWF0Y2g7IH1cbiAgICAgIH1cbiAgICAgIGlmIChsb3dlci5zdGFydHNXaXRoKCcmIycpKSB7XG4gICAgICAgICAgdHJ5IHsgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUocGFyc2VJbnQobG93ZXIuc2xpY2UoMiwgLTEpLCAxMCkpOyB9IGNhdGNoIHsgcmV0dXJuIG1hdGNoOyB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbWF0Y2g7XG4gIH0pO1xufVxuIiwgIlxuZXhwb3J0IGNvbnN0IEdFTkVSQV9SRUdJU1RSWTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgLy8gU2VhcmNoXG4gICdnb29nbGUuY29tJzogJ1NlYXJjaCcsXG4gICdiaW5nLmNvbSc6ICdTZWFyY2gnLFxuICAnZHVja2R1Y2tnby5jb20nOiAnU2VhcmNoJyxcbiAgJ3lhaG9vLmNvbSc6ICdTZWFyY2gnLFxuICAnYmFpZHUuY29tJzogJ1NlYXJjaCcsXG4gICd5YW5kZXguY29tJzogJ1NlYXJjaCcsXG4gICdrYWdpLmNvbSc6ICdTZWFyY2gnLFxuICAnZWNvc2lhLm9yZyc6ICdTZWFyY2gnLFxuXG4gIC8vIFNvY2lhbFxuICAnZmFjZWJvb2suY29tJzogJ1NvY2lhbCcsXG4gICd0d2l0dGVyLmNvbSc6ICdTb2NpYWwnLFxuICAneC5jb20nOiAnU29jaWFsJyxcbiAgJ2luc3RhZ3JhbS5jb20nOiAnU29jaWFsJyxcbiAgJ2xpbmtlZGluLmNvbSc6ICdTb2NpYWwnLFxuICAncmVkZGl0LmNvbSc6ICdTb2NpYWwnLFxuICAndGlrdG9rLmNvbSc6ICdTb2NpYWwnLFxuICAncGludGVyZXN0LmNvbSc6ICdTb2NpYWwnLFxuICAnc25hcGNoYXQuY29tJzogJ1NvY2lhbCcsXG4gICd0dW1ibHIuY29tJzogJ1NvY2lhbCcsXG4gICd0aHJlYWRzLm5ldCc6ICdTb2NpYWwnLFxuICAnYmx1ZXNreS5hcHAnOiAnU29jaWFsJyxcbiAgJ21hc3RvZG9uLnNvY2lhbCc6ICdTb2NpYWwnLFxuXG4gIC8vIFZpZGVvXG4gICd5b3V0dWJlLmNvbSc6ICdWaWRlbycsXG4gICd5b3V0dS5iZSc6ICdWaWRlbycsXG4gICd2aW1lby5jb20nOiAnVmlkZW8nLFxuICAndHdpdGNoLnR2JzogJ1ZpZGVvJyxcbiAgJ25ldGZsaXguY29tJzogJ1ZpZGVvJyxcbiAgJ2h1bHUuY29tJzogJ1ZpZGVvJyxcbiAgJ2Rpc25leXBsdXMuY29tJzogJ1ZpZGVvJyxcbiAgJ2RhaWx5bW90aW9uLmNvbSc6ICdWaWRlbycsXG4gICdwcmltZXZpZGVvLmNvbSc6ICdWaWRlbycsXG4gICdoYm9tYXguY29tJzogJ1ZpZGVvJyxcbiAgJ21heC5jb20nOiAnVmlkZW8nLFxuICAncGVhY29ja3R2LmNvbSc6ICdWaWRlbycsXG5cbiAgLy8gRGV2ZWxvcG1lbnRcbiAgJ2dpdGh1Yi5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnZ2l0bGFiLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdzdGFja292ZXJmbG93LmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICducG1qcy5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAncHlwaS5vcmcnOiAnRGV2ZWxvcG1lbnQnLFxuICAnZGV2ZWxvcGVyLm1vemlsbGEub3JnJzogJ0RldmVsb3BtZW50JyxcbiAgJ3czc2Nob29scy5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnZ2Vla3Nmb3JnZWVrcy5vcmcnOiAnRGV2ZWxvcG1lbnQnLFxuICAnamlyYS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnYXRsYXNzaWFuLm5ldCc6ICdEZXZlbG9wbWVudCcsIC8vIG9mdGVuIGppcmFcbiAgJ2JpdGJ1Y2tldC5vcmcnOiAnRGV2ZWxvcG1lbnQnLFxuICAnZGV2LnRvJzogJ0RldmVsb3BtZW50JyxcbiAgJ2hhc2hub2RlLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdtZWRpdW0uY29tJzogJ0RldmVsb3BtZW50JywgLy8gR2VuZXJhbCBidXQgb2Z0ZW4gZGV2XG4gICd2ZXJjZWwuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ25ldGxpZnkuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2hlcm9rdS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnYXdzLmFtYXpvbi5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnY29uc29sZS5hd3MuYW1hem9uLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdjbG91ZC5nb29nbGUuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2F6dXJlLm1pY3Jvc29mdC5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAncG9ydGFsLmF6dXJlLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdkb2NrZXIuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2t1YmVybmV0ZXMuaW8nOiAnRGV2ZWxvcG1lbnQnLFxuXG4gIC8vIE5ld3NcbiAgJ2Nubi5jb20nOiAnTmV3cycsXG4gICdiYmMuY29tJzogJ05ld3MnLFxuICAnbnl0aW1lcy5jb20nOiAnTmV3cycsXG4gICd3YXNoaW5ndG9ucG9zdC5jb20nOiAnTmV3cycsXG4gICd0aGVndWFyZGlhbi5jb20nOiAnTmV3cycsXG4gICdmb3JiZXMuY29tJzogJ05ld3MnLFxuICAnYmxvb21iZXJnLmNvbSc6ICdOZXdzJyxcbiAgJ3JldXRlcnMuY29tJzogJ05ld3MnLFxuICAnd3NqLmNvbSc6ICdOZXdzJyxcbiAgJ2NuYmMuY29tJzogJ05ld3MnLFxuICAnaHVmZnBvc3QuY29tJzogJ05ld3MnLFxuICAnbmV3cy5nb29nbGUuY29tJzogJ05ld3MnLFxuICAnZm94bmV3cy5jb20nOiAnTmV3cycsXG4gICduYmNuZXdzLmNvbSc6ICdOZXdzJyxcbiAgJ2FiY25ld3MuZ28uY29tJzogJ05ld3MnLFxuICAndXNhdG9kYXkuY29tJzogJ05ld3MnLFxuXG4gIC8vIFNob3BwaW5nXG4gICdhbWF6b24uY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2ViYXkuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3dhbG1hcnQuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2V0c3kuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3RhcmdldC5jb20nOiAnU2hvcHBpbmcnLFxuICAnYmVzdGJ1eS5jb20nOiAnU2hvcHBpbmcnLFxuICAnYWxpZXhwcmVzcy5jb20nOiAnU2hvcHBpbmcnLFxuICAnc2hvcGlmeS5jb20nOiAnU2hvcHBpbmcnLFxuICAndGVtdS5jb20nOiAnU2hvcHBpbmcnLFxuICAnc2hlaW4uY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3dheWZhaXIuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2Nvc3Rjby5jb20nOiAnU2hvcHBpbmcnLFxuXG4gIC8vIENvbW11bmljYXRpb25cbiAgJ21haWwuZ29vZ2xlLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ291dGxvb2subGl2ZS5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICdzbGFjay5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICdkaXNjb3JkLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3pvb20udXMnOiAnQ29tbXVuaWNhdGlvbicsXG4gICd0ZWFtcy5taWNyb3NvZnQuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnd2hhdHNhcHAuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAndGVsZWdyYW0ub3JnJzogJ0NvbW11bmljYXRpb24nLFxuICAnbWVzc2VuZ2VyLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3NreXBlLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcblxuICAvLyBGaW5hbmNlXG4gICdwYXlwYWwuY29tJzogJ0ZpbmFuY2UnLFxuICAnY2hhc2UuY29tJzogJ0ZpbmFuY2UnLFxuICAnYmFua29mYW1lcmljYS5jb20nOiAnRmluYW5jZScsXG4gICd3ZWxsc2ZhcmdvLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2FtZXJpY2FuZXhwcmVzcy5jb20nOiAnRmluYW5jZScsXG4gICdzdHJpcGUuY29tJzogJ0ZpbmFuY2UnLFxuICAnY29pbmJhc2UuY29tJzogJ0ZpbmFuY2UnLFxuICAnYmluYW5jZS5jb20nOiAnRmluYW5jZScsXG4gICdrcmFrZW4uY29tJzogJ0ZpbmFuY2UnLFxuICAncm9iaW5ob29kLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2ZpZGVsaXR5LmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3Zhbmd1YXJkLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3NjaHdhYi5jb20nOiAnRmluYW5jZScsXG4gICdtaW50LmludHVpdC5jb20nOiAnRmluYW5jZScsXG5cbiAgLy8gRWR1Y2F0aW9uXG4gICd3aWtpcGVkaWEub3JnJzogJ0VkdWNhdGlvbicsXG4gICdjb3Vyc2VyYS5vcmcnOiAnRWR1Y2F0aW9uJyxcbiAgJ3VkZW15LmNvbSc6ICdFZHVjYXRpb24nLFxuICAnZWR4Lm9yZyc6ICdFZHVjYXRpb24nLFxuICAna2hhbmFjYWRlbXkub3JnJzogJ0VkdWNhdGlvbicsXG4gICdxdWl6bGV0LmNvbSc6ICdFZHVjYXRpb24nLFxuICAnZHVvbGluZ28uY29tJzogJ0VkdWNhdGlvbicsXG4gICdjYW52YXMuaW5zdHJ1Y3R1cmUuY29tJzogJ0VkdWNhdGlvbicsXG4gICdibGFja2JvYXJkLmNvbSc6ICdFZHVjYXRpb24nLFxuICAnbWl0LmVkdSc6ICdFZHVjYXRpb24nLFxuICAnaGFydmFyZC5lZHUnOiAnRWR1Y2F0aW9uJyxcbiAgJ3N0YW5mb3JkLmVkdSc6ICdFZHVjYXRpb24nLFxuICAnYWNhZGVtaWEuZWR1JzogJ0VkdWNhdGlvbicsXG4gICdyZXNlYXJjaGdhdGUubmV0JzogJ0VkdWNhdGlvbicsXG5cbiAgLy8gRGVzaWduXG4gICdmaWdtYS5jb20nOiAnRGVzaWduJyxcbiAgJ2NhbnZhLmNvbSc6ICdEZXNpZ24nLFxuICAnYmVoYW5jZS5uZXQnOiAnRGVzaWduJyxcbiAgJ2RyaWJiYmxlLmNvbSc6ICdEZXNpZ24nLFxuICAnYWRvYmUuY29tJzogJ0Rlc2lnbicsXG4gICd1bnNwbGFzaC5jb20nOiAnRGVzaWduJyxcbiAgJ3BleGVscy5jb20nOiAnRGVzaWduJyxcbiAgJ3BpeGFiYXkuY29tJzogJ0Rlc2lnbicsXG4gICdzaHV0dGVyc3RvY2suY29tJzogJ0Rlc2lnbicsXG5cbiAgLy8gUHJvZHVjdGl2aXR5XG4gICdkb2NzLmdvb2dsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ3NoZWV0cy5nb29nbGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdzbGlkZXMuZ29vZ2xlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnZHJpdmUuZ29vZ2xlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnbm90aW9uLnNvJzogJ1Byb2R1Y3Rpdml0eScsXG4gICd0cmVsbG8uY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdhc2FuYS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ21vbmRheS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2FpcnRhYmxlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnZXZlcm5vdGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdkcm9wYm94LmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnY2xpY2t1cC5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2xpbmVhci5hcHAnOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ21pcm8uY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdsdWNpZGNoYXJ0LmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuXG4gIC8vIEFJXG4gICdvcGVuYWkuY29tJzogJ0FJJyxcbiAgJ2NoYXRncHQuY29tJzogJ0FJJyxcbiAgJ2FudGhyb3BpYy5jb20nOiAnQUknLFxuICAnbWlkam91cm5leS5jb20nOiAnQUknLFxuICAnaHVnZ2luZ2ZhY2UuY28nOiAnQUknLFxuICAnYmFyZC5nb29nbGUuY29tJzogJ0FJJyxcbiAgJ2dlbWluaS5nb29nbGUuY29tJzogJ0FJJyxcbiAgJ2NsYXVkZS5haSc6ICdBSScsXG4gICdwZXJwbGV4aXR5LmFpJzogJ0FJJyxcbiAgJ3BvZS5jb20nOiAnQUknLFxuXG4gIC8vIE11c2ljL0F1ZGlvXG4gICdzcG90aWZ5LmNvbSc6ICdNdXNpYycsXG4gICdzb3VuZGNsb3VkLmNvbSc6ICdNdXNpYycsXG4gICdtdXNpYy5hcHBsZS5jb20nOiAnTXVzaWMnLFxuICAncGFuZG9yYS5jb20nOiAnTXVzaWMnLFxuICAndGlkYWwuY29tJzogJ011c2ljJyxcbiAgJ2JhbmRjYW1wLmNvbSc6ICdNdXNpYycsXG4gICdhdWRpYmxlLmNvbSc6ICdNdXNpYycsXG5cbiAgLy8gR2FtaW5nXG4gICdzdGVhbXBvd2VyZWQuY29tJzogJ0dhbWluZycsXG4gICdyb2Jsb3guY29tJzogJ0dhbWluZycsXG4gICdlcGljZ2FtZXMuY29tJzogJ0dhbWluZycsXG4gICd4Ym94LmNvbSc6ICdHYW1pbmcnLFxuICAncGxheXN0YXRpb24uY29tJzogJ0dhbWluZycsXG4gICduaW50ZW5kby5jb20nOiAnR2FtaW5nJyxcbiAgJ2lnbi5jb20nOiAnR2FtaW5nJyxcbiAgJ2dhbWVzcG90LmNvbSc6ICdHYW1pbmcnLFxuICAna290YWt1LmNvbSc6ICdHYW1pbmcnLFxuICAncG9seWdvbi5jb20nOiAnR2FtaW5nJ1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldEdlbmVyYShob3N0bmFtZTogc3RyaW5nLCBjdXN0b21SZWdpc3RyeT86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBzdHJpbmcgfCBudWxsIHtcbiAgaWYgKCFob3N0bmFtZSkgcmV0dXJuIG51bGw7XG5cbiAgLy8gMC4gQ2hlY2sgY3VzdG9tIHJlZ2lzdHJ5IGZpcnN0XG4gIGlmIChjdXN0b21SZWdpc3RyeSkge1xuICAgICAgY29uc3QgcGFydHMgPSBob3N0bmFtZS5zcGxpdCgnLicpO1xuICAgICAgLy8gQ2hlY2sgZnVsbCBob3N0bmFtZSBhbmQgcHJvZ3Jlc3NpdmVseSBzaG9ydGVyIHN1ZmZpeGVzXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBhcnRzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICAgIGNvbnN0IGRvbWFpbiA9IHBhcnRzLnNsaWNlKGkpLmpvaW4oJy4nKTtcbiAgICAgICAgICBpZiAoY3VzdG9tUmVnaXN0cnlbZG9tYWluXSkge1xuICAgICAgICAgICAgICByZXR1cm4gY3VzdG9tUmVnaXN0cnlbZG9tYWluXTtcbiAgICAgICAgICB9XG4gICAgICB9XG4gIH1cblxuICAvLyAxLiBFeGFjdCBtYXRjaFxuICBpZiAoR0VORVJBX1JFR0lTVFJZW2hvc3RuYW1lXSkge1xuICAgIHJldHVybiBHRU5FUkFfUkVHSVNUUllbaG9zdG5hbWVdO1xuICB9XG5cbiAgLy8gMi4gU3ViZG9tYWluIGNoZWNrIChzdHJpcHBpbmcgc3ViZG9tYWlucylcbiAgLy8gZS5nLiBcImNvbnNvbGUuYXdzLmFtYXpvbi5jb21cIiAtPiBcImF3cy5hbWF6b24uY29tXCIgLT4gXCJhbWF6b24uY29tXCJcbiAgY29uc3QgcGFydHMgPSBob3N0bmFtZS5zcGxpdCgnLicpO1xuXG4gIC8vIFRyeSBtYXRjaGluZyBwcm9ncmVzc2l2ZWx5IHNob3J0ZXIgc3VmZml4ZXNcbiAgLy8gZS5nLiBhLmIuYy5jb20gLT4gYi5jLmNvbSAtPiBjLmNvbVxuICBmb3IgKGxldCBpID0gMDsgaSA8IHBhcnRzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgY29uc3QgZG9tYWluID0gcGFydHMuc2xpY2UoaSkuam9pbignLicpO1xuICAgICAgaWYgKEdFTkVSQV9SRUdJU1RSWVtkb21haW5dKSB7XG4gICAgICAgICAgcmV0dXJuIEdFTkVSQV9SRUdJU1RSWVtkb21haW5dO1xuICAgICAgfVxuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59XG4iLCAiZXhwb3J0IGNvbnN0IGdldFN0b3JlZFZhbHVlID0gYXN5bmMgPFQ+KGtleTogc3RyaW5nKTogUHJvbWlzZTxUIHwgbnVsbD4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoa2V5LCAoaXRlbXMpID0+IHtcbiAgICAgIHJlc29sdmUoKGl0ZW1zW2tleV0gYXMgVCkgPz8gbnVsbCk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IHNldFN0b3JlZFZhbHVlID0gYXN5bmMgPFQ+KGtleTogc3RyaW5nLCB2YWx1ZTogVCk6IFByb21pc2U8dm9pZD4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBba2V5XTogdmFsdWUgfSwgKCkgPT4gcmVzb2x2ZSgpKTtcbiAgfSk7XG59O1xuIiwgImltcG9ydCB7IFByZWZlcmVuY2VzLCBTb3J0aW5nU3RyYXRlZ3ksIFRhYk1ldGFkYXRhIH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcblxuZXhwb3J0IGNvbnN0IG1hcENocm9tZVRhYiA9ICh0YWI6IGNocm9tZS50YWJzLlRhYik6IFRhYk1ldGFkYXRhIHwgbnVsbCA9PiB7XG4gIGlmICghdGFiLmlkIHx8IHRhYi5pZCA9PT0gY2hyb21lLnRhYnMuVEFCX0lEX05PTkUgfHwgIXRhYi53aW5kb3dJZCkgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgaWQ6IHRhYi5pZCxcbiAgICB3aW5kb3dJZDogdGFiLndpbmRvd0lkLFxuICAgIHRpdGxlOiB0YWIudGl0bGUgfHwgXCJVbnRpdGxlZFwiLFxuICAgIHVybDogdGFiLnBlbmRpbmdVcmwgfHwgdGFiLnVybCB8fCBcImFib3V0OmJsYW5rXCIsXG4gICAgcGlubmVkOiBCb29sZWFuKHRhYi5waW5uZWQpLFxuICAgIGxhc3RBY2Nlc3NlZDogdGFiLmxhc3RBY2Nlc3NlZCxcbiAgICBvcGVuZXJUYWJJZDogdGFiLm9wZW5lclRhYklkID8/IHVuZGVmaW5lZCxcbiAgICBmYXZJY29uVXJsOiB0YWIuZmF2SWNvblVybCxcbiAgICBncm91cElkOiB0YWIuZ3JvdXBJZCxcbiAgICBpbmRleDogdGFiLmluZGV4LFxuICAgIGFjdGl2ZTogdGFiLmFjdGl2ZSxcbiAgICBzdGF0dXM6IHRhYi5zdGF0dXMsXG4gICAgc2VsZWN0ZWQ6IHRhYi5oaWdobGlnaHRlZFxuICB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGdldFN0b3JlZFByZWZlcmVuY2VzID0gYXN5bmMgKCk6IFByb21pc2U8UHJlZmVyZW5jZXMgfCBudWxsPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChcInByZWZlcmVuY2VzXCIsIChpdGVtcykgPT4ge1xuICAgICAgcmVzb2x2ZSgoaXRlbXNbXCJwcmVmZXJlbmNlc1wiXSBhcyBQcmVmZXJlbmNlcykgPz8gbnVsbCk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IGFzQXJyYXkgPSA8VD4odmFsdWU6IHVua25vd24pOiBUW10gPT4ge1xuICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkgcmV0dXJuIHZhbHVlIGFzIFRbXTtcbiAgICByZXR1cm4gW107XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gZXNjYXBlSHRtbCh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBpZiAoIXRleHQpIHJldHVybiAnJztcbiAgcmV0dXJuIHRleHRcbiAgICAucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxuICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcbiAgICAucmVwbGFjZSgvPi9nLCAnJmd0OycpXG4gICAgLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKVxuICAgIC5yZXBsYWNlKC8nL2csICcmIzAzOTsnKTtcbn1cbiIsICJpbXBvcnQgeyBDdXN0b21TdHJhdGVneSwgUHJlZmVyZW5jZXMsIFNvcnRpbmdTdHJhdGVneSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFN0b3JlZFZhbHVlLCBzZXRTdG9yZWRWYWx1ZSB9IGZyb20gXCIuL3N0b3JhZ2UuanNcIjtcbmltcG9ydCB7IHNldExvZ2dlclByZWZlcmVuY2VzLCBsb2dEZWJ1ZyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5jb25zdCBQUkVGRVJFTkNFU19LRVkgPSBcInByZWZlcmVuY2VzXCI7XG5cbmV4cG9ydCBjb25zdCBkZWZhdWx0UHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzID0ge1xuICBzb3J0aW5nOiBbXCJwaW5uZWRcIiwgXCJyZWNlbmN5XCJdLFxuICBkZWJ1ZzogZmFsc2UsXG4gIGxvZ0xldmVsOiBcImluZm9cIixcbiAgdGhlbWU6IFwiZGFya1wiLFxuICBjdXN0b21HZW5lcmE6IHt9XG59O1xuXG5jb25zdCBub3JtYWxpemVTb3J0aW5nID0gKHNvcnRpbmc6IHVua25vd24pOiBTb3J0aW5nU3RyYXRlZ3lbXSA9PiB7XG4gIGlmIChBcnJheS5pc0FycmF5KHNvcnRpbmcpKSB7XG4gICAgcmV0dXJuIHNvcnRpbmcuZmlsdGVyKCh2YWx1ZSk6IHZhbHVlIGlzIFNvcnRpbmdTdHJhdGVneSA9PiB0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIpO1xuICB9XG4gIGlmICh0eXBlb2Ygc29ydGluZyA9PT0gXCJzdHJpbmdcIikge1xuICAgIHJldHVybiBbc29ydGluZ107XG4gIH1cbiAgcmV0dXJuIFsuLi5kZWZhdWx0UHJlZmVyZW5jZXMuc29ydGluZ107XG59O1xuXG5jb25zdCBub3JtYWxpemVTdHJhdGVnaWVzID0gKHN0cmF0ZWdpZXM6IHVua25vd24pOiBDdXN0b21TdHJhdGVneVtdID0+IHtcbiAgICBjb25zdCBhcnIgPSBhc0FycmF5PGFueT4oc3RyYXRlZ2llcykuZmlsdGVyKHMgPT4gdHlwZW9mIHMgPT09ICdvYmplY3QnICYmIHMgIT09IG51bGwpO1xuICAgIHJldHVybiBhcnIubWFwKHMgPT4gKHtcbiAgICAgICAgLi4ucyxcbiAgICAgICAgZ3JvdXBpbmdSdWxlczogYXNBcnJheShzLmdyb3VwaW5nUnVsZXMpLFxuICAgICAgICBzb3J0aW5nUnVsZXM6IGFzQXJyYXkocy5zb3J0aW5nUnVsZXMpLFxuICAgICAgICBncm91cFNvcnRpbmdSdWxlczogcy5ncm91cFNvcnRpbmdSdWxlcyA/IGFzQXJyYXkocy5ncm91cFNvcnRpbmdSdWxlcykgOiB1bmRlZmluZWQsXG4gICAgICAgIGZpbHRlcnM6IHMuZmlsdGVycyA/IGFzQXJyYXkocy5maWx0ZXJzKSA6IHVuZGVmaW5lZCxcbiAgICAgICAgZmlsdGVyR3JvdXBzOiBzLmZpbHRlckdyb3VwcyA/IGFzQXJyYXkocy5maWx0ZXJHcm91cHMpLm1hcCgoZzogYW55KSA9PiBhc0FycmF5KGcpKSA6IHVuZGVmaW5lZCxcbiAgICAgICAgcnVsZXM6IHMucnVsZXMgPyBhc0FycmF5KHMucnVsZXMpIDogdW5kZWZpbmVkXG4gICAgfSkpO1xufTtcblxuY29uc3Qgbm9ybWFsaXplUHJlZmVyZW5jZXMgPSAocHJlZnM/OiBQYXJ0aWFsPFByZWZlcmVuY2VzPiB8IG51bGwpOiBQcmVmZXJlbmNlcyA9PiB7XG4gIGNvbnN0IG1lcmdlZCA9IHsgLi4uZGVmYXVsdFByZWZlcmVuY2VzLCAuLi4ocHJlZnMgPz8ge30pIH07XG4gIHJldHVybiB7XG4gICAgLi4ubWVyZ2VkLFxuICAgIHNvcnRpbmc6IG5vcm1hbGl6ZVNvcnRpbmcobWVyZ2VkLnNvcnRpbmcpLFxuICAgIGN1c3RvbVN0cmF0ZWdpZXM6IG5vcm1hbGl6ZVN0cmF0ZWdpZXMobWVyZ2VkLmN1c3RvbVN0cmF0ZWdpZXMpXG4gIH07XG59O1xuXG5leHBvcnQgY29uc3QgbG9hZFByZWZlcmVuY2VzID0gYXN5bmMgKCk6IFByb21pc2U8UHJlZmVyZW5jZXM+ID0+IHtcbiAgY29uc3Qgc3RvcmVkID0gYXdhaXQgZ2V0U3RvcmVkVmFsdWU8UHJlZmVyZW5jZXM+KFBSRUZFUkVOQ0VTX0tFWSk7XG4gIGNvbnN0IG1lcmdlZCA9IG5vcm1hbGl6ZVByZWZlcmVuY2VzKHN0b3JlZCA/PyB1bmRlZmluZWQpO1xuICBzZXRMb2dnZXJQcmVmZXJlbmNlcyhtZXJnZWQpO1xuICByZXR1cm4gbWVyZ2VkO1xufTtcblxuZXhwb3J0IGNvbnN0IHNhdmVQcmVmZXJlbmNlcyA9IGFzeW5jIChwcmVmczogUGFydGlhbDxQcmVmZXJlbmNlcz4pOiBQcm9taXNlPFByZWZlcmVuY2VzPiA9PiB7XG4gIGxvZ0RlYnVnKFwiVXBkYXRpbmcgcHJlZmVyZW5jZXNcIiwgeyBrZXlzOiBPYmplY3Qua2V5cyhwcmVmcykgfSk7XG4gIGNvbnN0IGN1cnJlbnQgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgY29uc3QgbWVyZ2VkID0gbm9ybWFsaXplUHJlZmVyZW5jZXMoeyAuLi5jdXJyZW50LCAuLi5wcmVmcyB9KTtcbiAgYXdhaXQgc2V0U3RvcmVkVmFsdWUoUFJFRkVSRU5DRVNfS0VZLCBtZXJnZWQpO1xuICBzZXRMb2dnZXJQcmVmZXJlbmNlcyhtZXJnZWQpO1xuICByZXR1cm4gbWVyZ2VkO1xufTtcbiIsICJpbXBvcnQgeyBQYWdlQ29udGV4dCwgVGFiTWV0YWRhdGEgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBub3JtYWxpemVVcmwsIHBhcnNlWW91VHViZVVybCwgZXh0cmFjdFlvdVR1YmVDaGFubmVsRnJvbUh0bWwsIGV4dHJhY3RZb3VUdWJlR2VucmVGcm9tSHRtbCB9IGZyb20gXCIuL2xvZ2ljLmpzXCI7XG5pbXBvcnQgeyBnZXRHZW5lcmEgfSBmcm9tIFwiLi9nZW5lcmFSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgbG9hZFByZWZlcmVuY2VzIH0gZnJvbSBcIi4uL3ByZWZlcmVuY2VzLmpzXCI7XG5cbmludGVyZmFjZSBFeHRyYWN0aW9uUmVzcG9uc2Uge1xuICBkYXRhOiBQYWdlQ29udGV4dCB8IG51bGw7XG4gIGVycm9yPzogc3RyaW5nO1xuICBzdGF0dXM6XG4gICAgfCAnT0snXG4gICAgfCAnUkVTVFJJQ1RFRCdcbiAgICB8ICdJTkpFQ1RJT05fRkFJTEVEJ1xuICAgIHwgJ05PX1JFU1BPTlNFJ1xuICAgIHwgJ05PX0hPU1RfUEVSTUlTU0lPTidcbiAgICB8ICdGUkFNRV9BQ0NFU1NfREVOSUVEJztcbn1cblxuLy8gU2ltcGxlIGNvbmN1cnJlbmN5IGNvbnRyb2xcbmxldCBhY3RpdmVGZXRjaGVzID0gMDtcbmNvbnN0IE1BWF9DT05DVVJSRU5UX0ZFVENIRVMgPSA1OyAvLyBDb25zZXJ2YXRpdmUgbGltaXQgdG8gYXZvaWQgcmF0ZSBsaW1pdGluZ1xuY29uc3QgRkVUQ0hfUVVFVUU6ICgoKSA9PiB2b2lkKVtdID0gW107XG5cbmNvbnN0IGZldGNoV2l0aFRpbWVvdXQgPSBhc3luYyAodXJsOiBzdHJpbmcsIHRpbWVvdXQgPSAyMDAwKTogUHJvbWlzZTxSZXNwb25zZT4gPT4ge1xuICAgIGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG4gICAgY29uc3QgaWQgPSBzZXRUaW1lb3V0KCgpID0+IGNvbnRyb2xsZXIuYWJvcnQoKSwgdGltZW91dCk7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwsIHsgc2lnbmFsOiBjb250cm9sbGVyLnNpZ25hbCB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgIH0gZmluYWxseSB7XG4gICAgICAgIGNsZWFyVGltZW91dChpZCk7XG4gICAgfVxufTtcblxuY29uc3QgZW5xdWV1ZUZldGNoID0gYXN5bmMgPFQ+KGZuOiAoKSA9PiBQcm9taXNlPFQ+KTogUHJvbWlzZTxUPiA9PiB7XG4gICAgaWYgKGFjdGl2ZUZldGNoZXMgPj0gTUFYX0NPTkNVUlJFTlRfRkVUQ0hFUykge1xuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IEZFVENIX1FVRVVFLnB1c2gocmVzb2x2ZSkpO1xuICAgIH1cbiAgICBhY3RpdmVGZXRjaGVzKys7XG4gICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGF3YWl0IGZuKCk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgICAgYWN0aXZlRmV0Y2hlcy0tO1xuICAgICAgICBpZiAoRkVUQ0hfUVVFVUUubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc3QgbmV4dCA9IEZFVENIX1FVRVVFLnNoaWZ0KCk7XG4gICAgICAgICAgICBpZiAobmV4dCkgbmV4dCgpO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGV4dHJhY3RQYWdlQ29udGV4dCA9IGFzeW5jICh0YWI6IFRhYk1ldGFkYXRhIHwgY2hyb21lLnRhYnMuVGFiKTogUHJvbWlzZTxFeHRyYWN0aW9uUmVzcG9uc2U+ID0+IHtcbiAgdHJ5IHtcbiAgICBpZiAoIXRhYiB8fCAhdGFiLnVybCkge1xuICAgICAgICByZXR1cm4geyBkYXRhOiBudWxsLCBlcnJvcjogXCJUYWIgbm90IGZvdW5kIG9yIG5vIFVSTFwiLCBzdGF0dXM6ICdOT19SRVNQT05TRScgfTtcbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2Nocm9tZTovLycpIHx8XG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2VkZ2U6Ly8nKSB8fFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdhYm91dDonKSB8fFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdjaHJvbWUtZXh0ZW5zaW9uOi8vJykgfHxcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnY2hyb21lLWVycm9yOi8vJylcbiAgICApIHtcbiAgICAgICAgcmV0dXJuIHsgZGF0YTogbnVsbCwgZXJyb3I6IFwiUmVzdHJpY3RlZCBVUkwgc2NoZW1lXCIsIHN0YXR1czogJ1JFU1RSSUNURUQnIH07XG4gICAgfVxuXG4gICAgY29uc3QgcHJlZnMgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgICBsZXQgYmFzZWxpbmUgPSBidWlsZEJhc2VsaW5lQ29udGV4dCh0YWIgYXMgY2hyb21lLnRhYnMuVGFiLCBwcmVmcy5jdXN0b21HZW5lcmEpO1xuXG4gICAgLy8gRmV0Y2ggYW5kIGVucmljaCBmb3IgWW91VHViZSBpZiBhdXRob3IgaXMgbWlzc2luZyBhbmQgaXQgaXMgYSB2aWRlb1xuICAgIGNvbnN0IHRhcmdldFVybCA9IHRhYi51cmw7XG4gICAgY29uc3QgdXJsT2JqID0gbmV3IFVSTCh0YXJnZXRVcmwpO1xuICAgIGNvbnN0IGhvc3RuYW1lID0gdXJsT2JqLmhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCAnJyk7XG4gICAgaWYgKChob3N0bmFtZS5lbmRzV2l0aCgneW91dHViZS5jb20nKSB8fCBob3N0bmFtZS5lbmRzV2l0aCgneW91dHUuYmUnKSkgJiYgKCFiYXNlbGluZS5hdXRob3JPckNyZWF0b3IgfHwgYmFzZWxpbmUuZ2VucmUgPT09ICdWaWRlbycpKSB7XG4gICAgICAgICB0cnkge1xuICAgICAgICAgICAgIC8vIFdlIHVzZSBhIHF1ZXVlIHRvIHByZXZlbnQgZmxvb2RpbmcgcmVxdWVzdHNcbiAgICAgICAgICAgICBhd2FpdCBlbnF1ZXVlRmV0Y2goYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoV2l0aFRpbWVvdXQodGFyZ2V0VXJsKTtcbiAgICAgICAgICAgICAgICAgaWYgKHJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICAgICAgICAgICBjb25zdCBodG1sID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2hhbm5lbCA9IGV4dHJhY3RZb3VUdWJlQ2hhbm5lbEZyb21IdG1sKGh0bWwpO1xuICAgICAgICAgICAgICAgICAgICAgaWYgKGNoYW5uZWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICBiYXNlbGluZS5hdXRob3JPckNyZWF0b3IgPSBjaGFubmVsO1xuICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgY29uc3QgZ2VucmUgPSBleHRyYWN0WW91VHViZUdlbnJlRnJvbUh0bWwoaHRtbCk7XG4gICAgICAgICAgICAgICAgICAgICBpZiAoZ2VucmUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICBiYXNlbGluZS5nZW5yZSA9IGdlbnJlO1xuICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfSk7XG4gICAgICAgICB9IGNhdGNoIChmZXRjaEVycikge1xuICAgICAgICAgICAgIGxvZ0RlYnVnKFwiRmFpbGVkIHRvIGZldGNoIFlvdVR1YmUgcGFnZSBjb250ZW50XCIsIHsgZXJyb3I6IFN0cmluZyhmZXRjaEVycikgfSk7XG4gICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGRhdGE6IGJhc2VsaW5lLFxuICAgICAgc3RhdHVzOiAnT0snXG4gICAgfTtcblxuICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICBsb2dEZWJ1ZyhgRXh0cmFjdGlvbiBmYWlsZWQgZm9yIHRhYiAke3RhYi5pZH1gLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIGRhdGE6IG51bGwsXG4gICAgICBlcnJvcjogU3RyaW5nKGUpLFxuICAgICAgc3RhdHVzOiAnSU5KRUNUSU9OX0ZBSUxFRCdcbiAgICB9O1xuICB9XG59O1xuXG5jb25zdCBidWlsZEJhc2VsaW5lQ29udGV4dCA9ICh0YWI6IGNocm9tZS50YWJzLlRhYiwgY3VzdG9tR2VuZXJhPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IFBhZ2VDb250ZXh0ID0+IHtcbiAgY29uc3QgdXJsID0gdGFiLnVybCB8fCBcIlwiO1xuICBsZXQgaG9zdG5hbWUgPSBcIlwiO1xuICB0cnkge1xuICAgIGhvc3RuYW1lID0gbmV3IFVSTCh1cmwpLmhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCAnJyk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBob3N0bmFtZSA9IFwiXCI7XG4gIH1cblxuICAvLyBEZXRlcm1pbmUgT2JqZWN0IFR5cGUgZmlyc3RcbiAgbGV0IG9iamVjdFR5cGU6IFBhZ2VDb250ZXh0WydvYmplY3RUeXBlJ10gPSAndW5rbm93bic7XG4gIGxldCBhdXRob3JPckNyZWF0b3I6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG4gIGlmICh1cmwuaW5jbHVkZXMoJy9sb2dpbicpIHx8IHVybC5pbmNsdWRlcygnL3NpZ25pbicpKSB7XG4gICAgICBvYmplY3RUeXBlID0gJ2xvZ2luJztcbiAgfSBlbHNlIGlmIChob3N0bmFtZS5pbmNsdWRlcygneW91dHViZS5jb20nKSB8fCBob3N0bmFtZS5pbmNsdWRlcygneW91dHUuYmUnKSkge1xuICAgICAgY29uc3QgeyB2aWRlb0lkIH0gPSBwYXJzZVlvdVR1YmVVcmwodXJsKTtcbiAgICAgIGlmICh2aWRlb0lkKSBvYmplY3RUeXBlID0gJ3ZpZGVvJztcblxuICAgICAgLy8gVHJ5IHRvIGd1ZXNzIGNoYW5uZWwgZnJvbSBVUkwgaWYgcG9zc2libGVcbiAgICAgIGlmICh1cmwuaW5jbHVkZXMoJy9AJykpIHtcbiAgICAgICAgICBjb25zdCBwYXJ0cyA9IHVybC5zcGxpdCgnL0AnKTtcbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICBjb25zdCBoYW5kbGUgPSBwYXJ0c1sxXS5zcGxpdCgnLycpWzBdO1xuICAgICAgICAgICAgICBhdXRob3JPckNyZWF0b3IgPSAnQCcgKyBoYW5kbGU7XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh1cmwuaW5jbHVkZXMoJy9jLycpKSB7XG4gICAgICAgICAgY29uc3QgcGFydHMgPSB1cmwuc3BsaXQoJy9jLycpO1xuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIGF1dGhvck9yQ3JlYXRvciA9IGRlY29kZVVSSUNvbXBvbmVudChwYXJ0c1sxXS5zcGxpdCgnLycpWzBdKTtcbiAgICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHVybC5pbmNsdWRlcygnL3VzZXIvJykpIHtcbiAgICAgICAgICBjb25zdCBwYXJ0cyA9IHVybC5zcGxpdCgnL3VzZXIvJyk7XG4gICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgYXV0aG9yT3JDcmVhdG9yID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhcnRzWzFdLnNwbGl0KCcvJylbMF0pO1xuICAgICAgICAgIH1cbiAgICAgIH1cbiAgfSBlbHNlIGlmIChob3N0bmFtZSA9PT0gJ2dpdGh1Yi5jb20nICYmIHVybC5pbmNsdWRlcygnL3B1bGwvJykpIHtcbiAgICAgIG9iamVjdFR5cGUgPSAndGlja2V0JztcbiAgfSBlbHNlIGlmIChob3N0bmFtZSA9PT0gJ2dpdGh1Yi5jb20nICYmICF1cmwuaW5jbHVkZXMoJy9wdWxsLycpICYmIHVybC5zcGxpdCgnLycpLmxlbmd0aCA+PSA1KSB7XG4gICAgICAvLyByb3VnaCBjaGVjayBmb3IgcmVwb1xuICAgICAgb2JqZWN0VHlwZSA9ICdyZXBvJztcbiAgfVxuXG4gIC8vIERldGVybWluZSBHZW5yZVxuICAvLyBQcmlvcml0eSAxOiBTaXRlLXNwZWNpZmljIGV4dHJhY3Rpb24gKGRlcml2ZWQgZnJvbSBvYmplY3RUeXBlKVxuICBsZXQgZ2VucmU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICBpZiAob2JqZWN0VHlwZSA9PT0gJ3ZpZGVvJykgZ2VucmUgPSAnVmlkZW8nO1xuICBlbHNlIGlmIChvYmplY3RUeXBlID09PSAncmVwbycgfHwgb2JqZWN0VHlwZSA9PT0gJ3RpY2tldCcpIGdlbnJlID0gJ0RldmVsb3BtZW50JztcblxuICAvLyBQcmlvcml0eSAyOiBGYWxsYmFjayB0byBSZWdpc3RyeVxuICBpZiAoIWdlbnJlKSB7XG4gICAgIGdlbnJlID0gZ2V0R2VuZXJhKGhvc3RuYW1lLCBjdXN0b21HZW5lcmEpIHx8IHVuZGVmaW5lZDtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY2Fub25pY2FsVXJsOiB1cmwgfHwgbnVsbCxcbiAgICBub3JtYWxpemVkVXJsOiBub3JtYWxpemVVcmwodXJsKSxcbiAgICBzaXRlTmFtZTogaG9zdG5hbWUgfHwgbnVsbCxcbiAgICBwbGF0Zm9ybTogaG9zdG5hbWUgfHwgbnVsbCxcbiAgICBvYmplY3RUeXBlLFxuICAgIG9iamVjdElkOiB1cmwgfHwgbnVsbCxcbiAgICB0aXRsZTogdGFiLnRpdGxlIHx8IG51bGwsXG4gICAgZ2VucmUsXG4gICAgZGVzY3JpcHRpb246IG51bGwsXG4gICAgYXV0aG9yT3JDcmVhdG9yOiBhdXRob3JPckNyZWF0b3IsXG4gICAgcHVibGlzaGVkQXQ6IG51bGwsXG4gICAgbW9kaWZpZWRBdDogbnVsbCxcbiAgICBsYW5ndWFnZTogbnVsbCxcbiAgICB0YWdzOiBbXSxcbiAgICBicmVhZGNydW1iczogW10sXG4gICAgaXNBdWRpYmxlOiBmYWxzZSxcbiAgICBpc011dGVkOiBmYWxzZSxcbiAgICBpc0NhcHR1cmluZzogZmFsc2UsXG4gICAgcHJvZ3Jlc3M6IG51bGwsXG4gICAgaGFzVW5zYXZlZENoYW5nZXNMaWtlbHk6IGZhbHNlLFxuICAgIGlzQXV0aGVudGljYXRlZExpa2VseTogZmFsc2UsXG4gICAgc291cmNlczoge1xuICAgICAgY2Fub25pY2FsVXJsOiAndXJsJyxcbiAgICAgIG5vcm1hbGl6ZWRVcmw6ICd1cmwnLFxuICAgICAgc2l0ZU5hbWU6ICd1cmwnLFxuICAgICAgcGxhdGZvcm06ICd1cmwnLFxuICAgICAgb2JqZWN0VHlwZTogJ3VybCcsXG4gICAgICB0aXRsZTogdGFiLnRpdGxlID8gJ3RhYicgOiAndXJsJyxcbiAgICAgIGdlbnJlOiAncmVnaXN0cnknXG4gICAgfSxcbiAgICBjb25maWRlbmNlOiB7fVxuICB9O1xufTtcbiIsICJleHBvcnQgdHlwZSBDYXRlZ29yeVJ1bGUgPSBzdHJpbmcgfCBzdHJpbmdbXTtcblxuZXhwb3J0IGludGVyZmFjZSBDYXRlZ29yeURlZmluaXRpb24ge1xuICBjYXRlZ29yeTogc3RyaW5nO1xuICBydWxlczogQ2F0ZWdvcnlSdWxlW107XG59XG5cbmV4cG9ydCBjb25zdCBDQVRFR09SWV9ERUZJTklUSU9OUzogQ2F0ZWdvcnlEZWZpbml0aW9uW10gPSBbXG4gIHtcbiAgICBjYXRlZ29yeTogXCJEZXZlbG9wbWVudFwiLFxuICAgIHJ1bGVzOiBbXCJnaXRodWJcIiwgXCJzdGFja292ZXJmbG93XCIsIFwibG9jYWxob3N0XCIsIFwiamlyYVwiLCBcImdpdGxhYlwiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiV29ya1wiLFxuICAgIHJ1bGVzOiBbXG4gICAgICBbXCJnb29nbGVcIiwgXCJkb2NzXCJdLCBbXCJnb29nbGVcIiwgXCJzaGVldHNcIl0sIFtcImdvb2dsZVwiLCBcInNsaWRlc1wiXSxcbiAgICAgIFwibGlua2VkaW5cIiwgXCJzbGFja1wiLCBcInpvb21cIiwgXCJ0ZWFtc1wiXG4gICAgXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiRW50ZXJ0YWlubWVudFwiLFxuICAgIHJ1bGVzOiBbXCJuZXRmbGl4XCIsIFwic3BvdGlmeVwiLCBcImh1bHVcIiwgXCJkaXNuZXlcIiwgXCJ5b3V0dWJlXCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJTb2NpYWxcIixcbiAgICBydWxlczogW1widHdpdHRlclwiLCBcImZhY2Vib29rXCIsIFwiaW5zdGFncmFtXCIsIFwicmVkZGl0XCIsIFwidGlrdG9rXCIsIFwicGludGVyZXN0XCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJTaG9wcGluZ1wiLFxuICAgIHJ1bGVzOiBbXCJhbWF6b25cIiwgXCJlYmF5XCIsIFwid2FsbWFydFwiLCBcInRhcmdldFwiLCBcInNob3BpZnlcIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIk5ld3NcIixcbiAgICBydWxlczogW1wiY25uXCIsIFwiYmJjXCIsIFwibnl0aW1lc1wiLCBcIndhc2hpbmd0b25wb3N0XCIsIFwiZm94bmV3c1wiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiRWR1Y2F0aW9uXCIsXG4gICAgcnVsZXM6IFtcImNvdXJzZXJhXCIsIFwidWRlbXlcIiwgXCJlZHhcIiwgXCJraGFuYWNhZGVteVwiLCBcImNhbnZhc1wiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiVHJhdmVsXCIsXG4gICAgcnVsZXM6IFtcImV4cGVkaWFcIiwgXCJib29raW5nXCIsIFwiYWlyYm5iXCIsIFwidHJpcGFkdmlzb3JcIiwgXCJrYXlha1wiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiSGVhbHRoXCIsXG4gICAgcnVsZXM6IFtcIndlYm1kXCIsIFwibWF5b2NsaW5pY1wiLCBcIm5paC5nb3ZcIiwgXCJoZWFsdGhcIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIlNwb3J0c1wiLFxuICAgIHJ1bGVzOiBbXCJlc3BuXCIsIFwibmJhXCIsIFwibmZsXCIsIFwibWxiXCIsIFwiZmlmYVwiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiVGVjaG5vbG9neVwiLFxuICAgIHJ1bGVzOiBbXCJ0ZWNoY3J1bmNoXCIsIFwid2lyZWRcIiwgXCJ0aGV2ZXJnZVwiLCBcImFyc3RlY2huaWNhXCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJTY2llbmNlXCIsXG4gICAgcnVsZXM6IFtcInNjaWVuY2VcIiwgXCJuYXR1cmUuY29tXCIsIFwibmFzYS5nb3ZcIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIkdhbWluZ1wiLFxuICAgIHJ1bGVzOiBbXCJ0d2l0Y2hcIiwgXCJzdGVhbVwiLCBcInJvYmxveFwiLCBcImlnblwiLCBcImdhbWVzcG90XCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJNdXNpY1wiLFxuICAgIHJ1bGVzOiBbXCJzb3VuZGNsb3VkXCIsIFwiYmFuZGNhbXBcIiwgXCJsYXN0LmZtXCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJBcnRcIixcbiAgICBydWxlczogW1wiZGV2aWFudGFydFwiLCBcImJlaGFuY2VcIiwgXCJkcmliYmJsZVwiLCBcImFydHN0YXRpb25cIl1cbiAgfVxuXTtcblxuZXhwb3J0IGNvbnN0IGdldENhdGVnb3J5RnJvbVVybCA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGxvd2VyVXJsID0gdXJsLnRvTG93ZXJDYXNlKCk7XG4gIGZvciAoY29uc3QgZGVmIG9mIENBVEVHT1JZX0RFRklOSVRJT05TKSB7XG4gICAgZm9yIChjb25zdCBydWxlIG9mIGRlZi5ydWxlcykge1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkocnVsZSkpIHtcbiAgICAgICAgaWYgKHJ1bGUuZXZlcnkocGFydCA9PiBsb3dlclVybC5pbmNsdWRlcyhwYXJ0KSkpIHtcbiAgICAgICAgICByZXR1cm4gZGVmLmNhdGVnb3J5O1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAobG93ZXJVcmwuaW5jbHVkZXMocnVsZSkpIHtcbiAgICAgICAgICByZXR1cm4gZGVmLmNhdGVnb3J5O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBcIlVuY2F0ZWdvcml6ZWRcIjtcbn07XG4iLCAiaW1wb3J0IHsgVGFiTWV0YWRhdGEsIFBhZ2VDb250ZXh0IH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcsIGxvZ0Vycm9yIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGV4dHJhY3RQYWdlQ29udGV4dCB9IGZyb20gXCIuL2V4dHJhY3Rpb24vaW5kZXguanNcIjtcbmltcG9ydCB7IGdldENhdGVnb3J5RnJvbVVybCB9IGZyb20gXCIuL2NhdGVnb3J5UnVsZXMuanNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBDb250ZXh0UmVzdWx0IHtcbiAgY29udGV4dDogc3RyaW5nO1xuICBzb3VyY2U6ICdBSScgfCAnSGV1cmlzdGljJyB8ICdFeHRyYWN0aW9uJztcbiAgZGF0YT86IFBhZ2VDb250ZXh0O1xuICBlcnJvcj86IHN0cmluZztcbiAgc3RhdHVzPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgQ2FjaGVFbnRyeSB7XG4gIHJlc3VsdDogQ29udGV4dFJlc3VsdDtcbiAgdGltZXN0YW1wOiBudW1iZXI7XG4gIC8vIFdlIHVzZSB0aGlzIHRvIGRlY2lkZSB3aGVuIHRvIGludmFsaWRhdGUgY2FjaGVcbn1cblxuY29uc3QgY29udGV4dENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIENhY2hlRW50cnk+KCk7XG5jb25zdCBDQUNIRV9UVExfU1VDQ0VTUyA9IDI0ICogNjAgKiA2MCAqIDEwMDA7IC8vIDI0IGhvdXJzXG5jb25zdCBDQUNIRV9UVExfRVJST1IgPSA1ICogNjAgKiAxMDAwOyAvLyA1IG1pbnV0ZXNcblxuZXhwb3J0IGNvbnN0IGFuYWx5emVUYWJDb250ZXh0ID0gYXN5bmMgKFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBvblByb2dyZXNzPzogKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB2b2lkXG4pOiBQcm9taXNlPE1hcDxudW1iZXIsIENvbnRleHRSZXN1bHQ+PiA9PiB7XG4gIGNvbnN0IGNvbnRleHRNYXAgPSBuZXcgTWFwPG51bWJlciwgQ29udGV4dFJlc3VsdD4oKTtcbiAgbGV0IGNvbXBsZXRlZCA9IDA7XG4gIGNvbnN0IHRvdGFsID0gdGFicy5sZW5ndGg7XG5cbiAgY29uc3QgcHJvbWlzZXMgPSB0YWJzLm1hcChhc3luYyAodGFiKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNhY2hlS2V5ID0gYCR7dGFiLmlkfTo6JHt0YWIudXJsfWA7XG4gICAgICBjb25zdCBjYWNoZWQgPSBjb250ZXh0Q2FjaGUuZ2V0KGNhY2hlS2V5KTtcblxuICAgICAgaWYgKGNhY2hlZCkge1xuICAgICAgICBjb25zdCBpc0Vycm9yID0gY2FjaGVkLnJlc3VsdC5zdGF0dXMgPT09ICdFUlJPUicgfHwgISFjYWNoZWQucmVzdWx0LmVycm9yO1xuICAgICAgICBjb25zdCB0dGwgPSBpc0Vycm9yID8gQ0FDSEVfVFRMX0VSUk9SIDogQ0FDSEVfVFRMX1NVQ0NFU1M7XG5cbiAgICAgICAgaWYgKERhdGUubm93KCkgLSBjYWNoZWQudGltZXN0YW1wIDwgdHRsKSB7XG4gICAgICAgICAgY29udGV4dE1hcC5zZXQodGFiLmlkLCBjYWNoZWQucmVzdWx0KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29udGV4dENhY2hlLmRlbGV0ZShjYWNoZUtleSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hDb250ZXh0Rm9yVGFiKHRhYik7XG5cbiAgICAgIC8vIENhY2hlIHdpdGggZXhwaXJhdGlvbiBsb2dpY1xuICAgICAgY29udGV4dENhY2hlLnNldChjYWNoZUtleSwge1xuICAgICAgICByZXN1bHQsXG4gICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKVxuICAgICAgfSk7XG5cbiAgICAgIGNvbnRleHRNYXAuc2V0KHRhYi5pZCwgcmVzdWx0KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nRXJyb3IoYEZhaWxlZCB0byBhbmFseXplIGNvbnRleHQgZm9yIHRhYiAke3RhYi5pZH1gLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgICAgLy8gRXZlbiBpZiBmZXRjaENvbnRleHRGb3JUYWIgZmFpbHMgY29tcGxldGVseSwgd2UgdHJ5IGEgc2FmZSBzeW5jIGZhbGxiYWNrXG4gICAgICBjb250ZXh0TWFwLnNldCh0YWIuaWQsIHsgY29udGV4dDogXCJVbmNhdGVnb3JpemVkXCIsIHNvdXJjZTogJ0hldXJpc3RpYycsIGVycm9yOiBTdHJpbmcoZXJyb3IpLCBzdGF0dXM6ICdFUlJPUicgfSk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGNvbXBsZXRlZCsrO1xuICAgICAgaWYgKG9uUHJvZ3Jlc3MpIG9uUHJvZ3Jlc3MoY29tcGxldGVkLCB0b3RhbCk7XG4gICAgfVxuICB9KTtcblxuICBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gIHJldHVybiBjb250ZXh0TWFwO1xufTtcblxuY29uc3QgZmV0Y2hDb250ZXh0Rm9yVGFiID0gYXN5bmMgKHRhYjogVGFiTWV0YWRhdGEpOiBQcm9taXNlPENvbnRleHRSZXN1bHQ+ID0+IHtcbiAgLy8gMS4gUnVuIEdlbmVyaWMgRXh0cmFjdGlvbiAoQWx3YXlzKVxuICBsZXQgZGF0YTogUGFnZUNvbnRleHQgfCBudWxsID0gbnVsbDtcbiAgbGV0IGVycm9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gIGxldCBzdGF0dXM6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICB0cnkge1xuICAgICAgY29uc3QgZXh0cmFjdGlvbiA9IGF3YWl0IGV4dHJhY3RQYWdlQ29udGV4dCh0YWIpO1xuICAgICAgZGF0YSA9IGV4dHJhY3Rpb24uZGF0YTtcbiAgICAgIGVycm9yID0gZXh0cmFjdGlvbi5lcnJvcjtcbiAgICAgIHN0YXR1cyA9IGV4dHJhY3Rpb24uc3RhdHVzO1xuICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dEZWJ1ZyhgRXh0cmFjdGlvbiBmYWlsZWQgZm9yIHRhYiAke3RhYi5pZH1gLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICBlcnJvciA9IFN0cmluZyhlKTtcbiAgICAgIHN0YXR1cyA9ICdFUlJPUic7XG4gIH1cblxuICBsZXQgY29udGV4dCA9IFwiVW5jYXRlZ29yaXplZFwiO1xuICBsZXQgc291cmNlOiBDb250ZXh0UmVzdWx0Wydzb3VyY2UnXSA9ICdIZXVyaXN0aWMnO1xuXG4gIC8vIDIuIFRyeSB0byBEZXRlcm1pbmUgQ2F0ZWdvcnkgZnJvbSBFeHRyYWN0aW9uIERhdGFcbiAgaWYgKGRhdGEpIHtcbiAgICAgIGlmIChkYXRhLnBsYXRmb3JtID09PSAnWW91VHViZScgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ05ldGZsaXgnIHx8IGRhdGEucGxhdGZvcm0gPT09ICdTcG90aWZ5JyB8fCBkYXRhLnBsYXRmb3JtID09PSAnVHdpdGNoJykge1xuICAgICAgICAgIGNvbnRleHQgPSBcIkVudGVydGFpbm1lbnRcIjtcbiAgICAgICAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gICAgICB9IGVsc2UgaWYgKGRhdGEucGxhdGZvcm0gPT09ICdHaXRIdWInIHx8IGRhdGEucGxhdGZvcm0gPT09ICdTdGFjayBPdmVyZmxvdycgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ0ppcmEnIHx8IGRhdGEucGxhdGZvcm0gPT09ICdHaXRMYWInKSB7XG4gICAgICAgICAgY29udGV4dCA9IFwiRGV2ZWxvcG1lbnRcIjtcbiAgICAgICAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gICAgICB9IGVsc2UgaWYgKGRhdGEucGxhdGZvcm0gPT09ICdHb29nbGUnICYmIChkYXRhLm5vcm1hbGl6ZWRVcmwuaW5jbHVkZXMoJ2RvY3MnKSB8fCBkYXRhLm5vcm1hbGl6ZWRVcmwuaW5jbHVkZXMoJ3NoZWV0cycpIHx8IGRhdGEubm9ybWFsaXplZFVybC5pbmNsdWRlcygnc2xpZGVzJykpKSB7XG4gICAgICAgICAgY29udGV4dCA9IFwiV29ya1wiO1xuICAgICAgICAgIHNvdXJjZSA9ICdFeHRyYWN0aW9uJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIElmIHdlIGhhdmUgc3VjY2Vzc2Z1bCBleHRyYWN0aW9uIGRhdGEgYnV0IG5vIHNwZWNpZmljIHJ1bGUgbWF0Y2hlZCxcbiAgICAgICAgLy8gdXNlIHRoZSBPYmplY3QgVHlwZSBvciBnZW5lcmljIFwiR2VuZXJhbCBXZWJcIiB0byBpbmRpY2F0ZSBleHRyYWN0aW9uIHdvcmtlZC5cbiAgICAgICAgLy8gV2UgcHJlZmVyIHNwZWNpZmljIGNhdGVnb3JpZXMsIGJ1dCBcIkFydGljbGVcIiBvciBcIlZpZGVvXCIgYXJlIGJldHRlciB0aGFuIFwiVW5jYXRlZ29yaXplZFwiLlxuICAgICAgICBpZiAoZGF0YS5vYmplY3RUeXBlICYmIGRhdGEub2JqZWN0VHlwZSAhPT0gJ3Vua25vd24nKSB7XG4gICAgICAgICAgICAgLy8gTWFwIG9iamVjdCB0eXBlcyB0byBjYXRlZ29yaWVzIGlmIHBvc3NpYmxlXG4gICAgICAgICAgICAgaWYgKGRhdGEub2JqZWN0VHlwZSA9PT0gJ3ZpZGVvJykgY29udGV4dCA9ICdFbnRlcnRhaW5tZW50JztcbiAgICAgICAgICAgICBlbHNlIGlmIChkYXRhLm9iamVjdFR5cGUgPT09ICdhcnRpY2xlJykgY29udGV4dCA9ICdOZXdzJzsgLy8gTG9vc2UgbWFwcGluZywgYnV0IGJldHRlciB0aGFuIG5vdGhpbmdcbiAgICAgICAgICAgICBlbHNlIGNvbnRleHQgPSBkYXRhLm9iamVjdFR5cGUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBkYXRhLm9iamVjdFR5cGUuc2xpY2UoMSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgY29udGV4dCA9IFwiR2VuZXJhbCBXZWJcIjtcbiAgICAgICAgfVxuICAgICAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gICAgICB9XG4gIH1cblxuICAvLyAzLiBGYWxsYmFjayB0byBMb2NhbCBIZXVyaXN0aWMgKFVSTCBSZWdleClcbiAgaWYgKGNvbnRleHQgPT09IFwiVW5jYXRlZ29yaXplZFwiKSB7XG4gICAgICBjb25zdCBoID0gYXdhaXQgbG9jYWxIZXVyaXN0aWModGFiKTtcbiAgICAgIGlmIChoLmNvbnRleHQgIT09IFwiVW5jYXRlZ29yaXplZFwiKSB7XG4gICAgICAgICAgY29udGV4dCA9IGguY29udGV4dDtcbiAgICAgICAgICAvLyBzb3VyY2UgcmVtYWlucyAnSGV1cmlzdGljJyAob3IgbWF5YmUgd2Ugc2hvdWxkIHNheSAnSGV1cmlzdGljJyBpcyB0aGUgc291cmNlPylcbiAgICAgICAgICAvLyBUaGUgbG9jYWxIZXVyaXN0aWMgZnVuY3Rpb24gcmV0dXJucyB7IHNvdXJjZTogJ0hldXJpc3RpYycgfVxuICAgICAgfVxuICB9XG5cbiAgLy8gNC4gRmFsbGJhY2sgdG8gQUkgKExMTSkgLSBSRU1PVkVEXG4gIC8vIFRoZSBIdWdnaW5nRmFjZSBBUEkgZW5kcG9pbnQgaXMgNDEwIEdvbmUgYW5kL29yIHJlcXVpcmVzIGF1dGhlbnRpY2F0aW9uIHdoaWNoIHdlIGRvIG5vdCBoYXZlLlxuICAvLyBUaGUgY29kZSBoYXMgYmVlbiByZW1vdmVkIHRvIHByZXZlbnQgZXJyb3JzLlxuXG4gIGlmIChjb250ZXh0ICE9PSBcIlVuY2F0ZWdvcml6ZWRcIiAmJiBzb3VyY2UgIT09IFwiRXh0cmFjdGlvblwiKSB7XG4gICAgZXJyb3IgPSB1bmRlZmluZWQ7XG4gICAgc3RhdHVzID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgcmV0dXJuIHsgY29udGV4dCwgc291cmNlLCBkYXRhOiBkYXRhIHx8IHVuZGVmaW5lZCwgZXJyb3IsIHN0YXR1cyB9O1xufTtcblxuY29uc3QgbG9jYWxIZXVyaXN0aWMgPSBhc3luYyAodGFiOiBUYWJNZXRhZGF0YSk6IFByb21pc2U8Q29udGV4dFJlc3VsdD4gPT4ge1xuICBjb25zdCBjb250ZXh0ID0gZ2V0Q2F0ZWdvcnlGcm9tVXJsKHRhYi51cmwpO1xuICByZXR1cm4geyBjb250ZXh0LCBzb3VyY2U6ICdIZXVyaXN0aWMnIH07XG59O1xuIiwgImltcG9ydCB7IEN1c3RvbVN0cmF0ZWd5LCBTb3J0aW5nU3RyYXRlZ3kgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0cmF0ZWd5RGVmaW5pdGlvbiB7XG4gICAgaWQ6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZztcbiAgICBsYWJlbDogc3RyaW5nO1xuICAgIGlzR3JvdXBpbmc6IGJvb2xlYW47XG4gICAgaXNTb3J0aW5nOiBib29sZWFuO1xuICAgIHRhZ3M/OiBzdHJpbmdbXTtcbiAgICBhdXRvUnVuPzogYm9vbGVhbjtcbiAgICBpc0N1c3RvbT86IGJvb2xlYW47XG59XG5cbi8vIFJlc3RvcmVkIHN0cmF0ZWdpZXMgbWF0Y2hpbmcgYmFja2dyb3VuZCBjYXBhYmlsaXRpZXMuXG5leHBvcnQgY29uc3QgU1RSQVRFR0lFUzogU3RyYXRlZ3lEZWZpbml0aW9uW10gPSBbXG4gICAgeyBpZDogXCJkb21haW5cIiwgbGFiZWw6IFwiRG9tYWluXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJkb21haW5fZnVsbFwiLCBsYWJlbDogXCJGdWxsIERvbWFpblwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidG9waWNcIiwgbGFiZWw6IFwiVG9waWNcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImNvbnRleHRcIiwgbGFiZWw6IFwiQ29udGV4dFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwibGluZWFnZVwiLCBsYWJlbDogXCJMaW5lYWdlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJwaW5uZWRcIiwgbGFiZWw6IFwiUGlubmVkXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJyZWNlbmN5XCIsIGxhYmVsOiBcIlJlY2VuY3lcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImFnZVwiLCBsYWJlbDogXCJBZ2VcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInVybFwiLCBsYWJlbDogXCJVUkxcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcIm5lc3RpbmdcIiwgbGFiZWw6IFwiTmVzdGluZ1wiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidGl0bGVcIiwgbGFiZWw6IFwiVGl0bGVcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbl07XG5cbmV4cG9ydCBjb25zdCBnZXRTdHJhdGVnaWVzID0gKGN1c3RvbVN0cmF0ZWdpZXM/OiBDdXN0b21TdHJhdGVneVtdKTogU3RyYXRlZ3lEZWZpbml0aW9uW10gPT4ge1xuICAgIGlmICghY3VzdG9tU3RyYXRlZ2llcyB8fCBjdXN0b21TdHJhdGVnaWVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFNUUkFURUdJRVM7XG5cbiAgICAvLyBDdXN0b20gc3RyYXRlZ2llcyBjYW4gb3ZlcnJpZGUgYnVpbHQtaW5zIGlmIElEcyBtYXRjaCwgb3IgYWRkIG5ldyBvbmVzLlxuICAgIGNvbnN0IGNvbWJpbmVkID0gWy4uLlNUUkFURUdJRVNdO1xuXG4gICAgY3VzdG9tU3RyYXRlZ2llcy5mb3JFYWNoKGN1c3RvbSA9PiB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nSW5kZXggPSBjb21iaW5lZC5maW5kSW5kZXgocyA9PiBzLmlkID09PSBjdXN0b20uaWQpO1xuXG4gICAgICAgIC8vIERldGVybWluZSBjYXBhYmlsaXRpZXMgYmFzZWQgb24gcnVsZXMgcHJlc2VuY2VcbiAgICAgICAgY29uc3QgaGFzR3JvdXBpbmcgPSAoY3VzdG9tLmdyb3VwaW5nUnVsZXMgJiYgY3VzdG9tLmdyb3VwaW5nUnVsZXMubGVuZ3RoID4gMCkgfHwgKGN1c3RvbS5ydWxlcyAmJiBjdXN0b20ucnVsZXMubGVuZ3RoID4gMCkgfHwgZmFsc2U7XG4gICAgICAgIGNvbnN0IGhhc1NvcnRpbmcgPSAoY3VzdG9tLnNvcnRpbmdSdWxlcyAmJiBjdXN0b20uc29ydGluZ1J1bGVzLmxlbmd0aCA+IDApIHx8IChjdXN0b20ucnVsZXMgJiYgY3VzdG9tLnJ1bGVzLmxlbmd0aCA+IDApIHx8IGZhbHNlO1xuXG4gICAgICAgIGNvbnN0IHRhZ3M6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGlmIChoYXNHcm91cGluZykgdGFncy5wdXNoKFwiZ3JvdXBcIik7XG4gICAgICAgIGlmIChoYXNTb3J0aW5nKSB0YWdzLnB1c2goXCJzb3J0XCIpO1xuXG4gICAgICAgIGNvbnN0IGRlZmluaXRpb246IFN0cmF0ZWd5RGVmaW5pdGlvbiA9IHtcbiAgICAgICAgICAgIGlkOiBjdXN0b20uaWQsXG4gICAgICAgICAgICBsYWJlbDogY3VzdG9tLmxhYmVsLFxuICAgICAgICAgICAgaXNHcm91cGluZzogaGFzR3JvdXBpbmcsXG4gICAgICAgICAgICBpc1NvcnRpbmc6IGhhc1NvcnRpbmcsXG4gICAgICAgICAgICB0YWdzOiB0YWdzLFxuICAgICAgICAgICAgYXV0b1J1bjogY3VzdG9tLmF1dG9SdW4sXG4gICAgICAgICAgICBpc0N1c3RvbTogdHJ1ZVxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChleGlzdGluZ0luZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgY29tYmluZWRbZXhpc3RpbmdJbmRleF0gPSBkZWZpbml0aW9uO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29tYmluZWQucHVzaChkZWZpbml0aW9uKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNvbWJpbmVkO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldFN0cmF0ZWd5ID0gKGlkOiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiBTdHJhdGVneURlZmluaXRpb24gfCB1bmRlZmluZWQgPT4gU1RSQVRFR0lFUy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpO1xuIiwgImltcG9ydCB7IEdyb3VwaW5nU3RyYXRlZ3ksIFNvcnRpbmdTdHJhdGVneSwgVGFiR3JvdXAsIFRhYk1ldGFkYXRhLCBDdXN0b21TdHJhdGVneSwgU3RyYXRlZ3lSdWxlLCBSdWxlQ29uZGl0aW9uLCBHcm91cGluZ1J1bGUsIFNvcnRpbmdSdWxlIH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZ2V0U3RyYXRlZ2llcyB9IGZyb20gXCIuLi9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxubGV0IGN1c3RvbVN0cmF0ZWdpZXM6IEN1c3RvbVN0cmF0ZWd5W10gPSBbXTtcblxuZXhwb3J0IGNvbnN0IHNldEN1c3RvbVN0cmF0ZWdpZXMgPSAoc3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSkgPT4ge1xuICAgIGN1c3RvbVN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldEN1c3RvbVN0cmF0ZWdpZXMgPSAoKTogQ3VzdG9tU3RyYXRlZ3lbXSA9PiBjdXN0b21TdHJhdGVnaWVzO1xuXG5jb25zdCBDT0xPUlMgPSBbXCJncmV5XCIsIFwiYmx1ZVwiLCBcInJlZFwiLCBcInllbGxvd1wiLCBcImdyZWVuXCIsIFwicGlua1wiLCBcInB1cnBsZVwiLCBcImN5YW5cIiwgXCJvcmFuZ2VcIl07XG5cbmNvbnN0IHJlZ2V4Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUmVnRXhwPigpO1xuY29uc3QgZG9tYWluQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuY29uc3Qgc3ViZG9tYWluQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuY29uc3QgTUFYX0NBQ0hFX1NJWkUgPSAxMDAwO1xuXG5leHBvcnQgY29uc3QgZG9tYWluRnJvbVVybCA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGlmIChkb21haW5DYWNoZS5oYXModXJsKSkgcmV0dXJuIGRvbWFpbkNhY2hlLmdldCh1cmwpITtcblxuICB0cnkge1xuICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwodXJsKTtcbiAgICBjb25zdCBkb21haW4gPSBwYXJzZWQuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xuXG4gICAgaWYgKGRvbWFpbkNhY2hlLnNpemUgPj0gTUFYX0NBQ0hFX1NJWkUpIGRvbWFpbkNhY2hlLmNsZWFyKCk7XG4gICAgZG9tYWluQ2FjaGUuc2V0KHVybCwgZG9tYWluKTtcblxuICAgIHJldHVybiBkb21haW47XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgbG9nRGVidWcoXCJGYWlsZWQgdG8gcGFyc2UgZG9tYWluXCIsIHsgdXJsLCBlcnJvcjogU3RyaW5nKGVycm9yKSB9KTtcbiAgICByZXR1cm4gXCJ1bmtub3duXCI7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBzdWJkb21haW5Gcm9tVXJsID0gKHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICBpZiAoc3ViZG9tYWluQ2FjaGUuaGFzKHVybCkpIHJldHVybiBzdWJkb21haW5DYWNoZS5nZXQodXJsKSE7XG5cbiAgICB0cnkge1xuICAgICAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XG4gICAgICAgIGxldCBob3N0bmFtZSA9IHBhcnNlZC5ob3N0bmFtZTtcbiAgICAgICAgLy8gUmVtb3ZlIHd3dy5cbiAgICAgICAgaG9zdG5hbWUgPSBob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG5cbiAgICAgICAgbGV0IHJlc3VsdCA9IFwiXCI7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gaG9zdG5hbWUuc3BsaXQoJy4nKTtcbiAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDIpIHtcbiAgICAgICAgICAgICByZXN1bHQgPSBwYXJ0cy5zbGljZSgwLCBwYXJ0cy5sZW5ndGggLSAyKS5qb2luKCcuJyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3ViZG9tYWluQ2FjaGUuc2l6ZSA+PSBNQVhfQ0FDSEVfU0laRSkgc3ViZG9tYWluQ2FjaGUuY2xlYXIoKTtcbiAgICAgICAgc3ViZG9tYWluQ2FjaGUuc2V0KHVybCwgcmVzdWx0KTtcblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gXCJcIjtcbiAgICB9XG59XG5cbmNvbnN0IGdldE5lc3RlZFByb3BlcnR5ID0gKG9iajogdW5rbm93biwgcGF0aDogc3RyaW5nKTogdW5rbm93biA9PiB7XG4gICAgaWYgKCFvYmogfHwgdHlwZW9mIG9iaiAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG5cbiAgICBpZiAoIXBhdGguaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICByZXR1cm4gKG9iaiBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbcGF0aF07XG4gICAgfVxuXG4gICAgY29uc3QgcGFydHMgPSBwYXRoLnNwbGl0KCcuJyk7XG4gICAgbGV0IGN1cnJlbnQ6IHVua25vd24gPSBvYmo7XG5cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBwYXJ0cykge1xuICAgICAgICBpZiAoIWN1cnJlbnQgfHwgdHlwZW9mIGN1cnJlbnQgIT09ICdvYmplY3QnKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICBjdXJyZW50ID0gKGN1cnJlbnQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW2tleV07XG4gICAgfVxuXG4gICAgcmV0dXJuIGN1cnJlbnQ7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0RmllbGRWYWx1ZSA9ICh0YWI6IFRhYk1ldGFkYXRhLCBmaWVsZDogc3RyaW5nKTogYW55ID0+IHtcbiAgICBzd2l0Y2goZmllbGQpIHtcbiAgICAgICAgY2FzZSAnaWQnOiByZXR1cm4gdGFiLmlkO1xuICAgICAgICBjYXNlICdpbmRleCc6IHJldHVybiB0YWIuaW5kZXg7XG4gICAgICAgIGNhc2UgJ3dpbmRvd0lkJzogcmV0dXJuIHRhYi53aW5kb3dJZDtcbiAgICAgICAgY2FzZSAnZ3JvdXBJZCc6IHJldHVybiB0YWIuZ3JvdXBJZDtcbiAgICAgICAgY2FzZSAndGl0bGUnOiByZXR1cm4gdGFiLnRpdGxlO1xuICAgICAgICBjYXNlICd1cmwnOiByZXR1cm4gdGFiLnVybDtcbiAgICAgICAgY2FzZSAnc3RhdHVzJzogcmV0dXJuIHRhYi5zdGF0dXM7XG4gICAgICAgIGNhc2UgJ2FjdGl2ZSc6IHJldHVybiB0YWIuYWN0aXZlO1xuICAgICAgICBjYXNlICdzZWxlY3RlZCc6IHJldHVybiB0YWIuc2VsZWN0ZWQ7XG4gICAgICAgIGNhc2UgJ3Bpbm5lZCc6IHJldHVybiB0YWIucGlubmVkO1xuICAgICAgICBjYXNlICdvcGVuZXJUYWJJZCc6IHJldHVybiB0YWIub3BlbmVyVGFiSWQ7XG4gICAgICAgIGNhc2UgJ2xhc3RBY2Nlc3NlZCc6IHJldHVybiB0YWIubGFzdEFjY2Vzc2VkO1xuICAgICAgICBjYXNlICdjb250ZXh0JzogcmV0dXJuIHRhYi5jb250ZXh0O1xuICAgICAgICBjYXNlICdnZW5yZSc6IHJldHVybiB0YWIuY29udGV4dERhdGE/LmdlbnJlO1xuICAgICAgICBjYXNlICdzaXRlTmFtZSc6IHJldHVybiB0YWIuY29udGV4dERhdGE/LnNpdGVOYW1lO1xuICAgICAgICAvLyBEZXJpdmVkIG9yIG1hcHBlZCBmaWVsZHNcbiAgICAgICAgY2FzZSAnZG9tYWluJzogcmV0dXJuIGRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGNhc2UgJ3N1YmRvbWFpbic6IHJldHVybiBzdWJkb21haW5Gcm9tVXJsKHRhYi51cmwpO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgcmV0dXJuIGdldE5lc3RlZFByb3BlcnR5KHRhYiwgZmllbGQpO1xuICAgIH1cbn07XG5cbmNvbnN0IHN0cmlwVGxkID0gKGRvbWFpbjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGRvbWFpbi5yZXBsYWNlKC9cXC4oY29tfG9yZ3xnb3Z8bmV0fGVkdXxpbykkL2ksIFwiXCIpO1xufTtcblxuZXhwb3J0IGNvbnN0IHNlbWFudGljQnVja2V0ID0gKHRpdGxlOiBzdHJpbmcsIHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3Qga2V5ID0gYCR7dGl0bGV9ICR7dXJsfWAudG9Mb3dlckNhc2UoKTtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRvY1wiKSB8fCBrZXkuaW5jbHVkZXMoXCJyZWFkbWVcIikgfHwga2V5LmluY2x1ZGVzKFwiZ3VpZGVcIikpIHJldHVybiBcIkRvY3NcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcIm1haWxcIikgfHwga2V5LmluY2x1ZGVzKFwiaW5ib3hcIikpIHJldHVybiBcIkNoYXRcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRhc2hib2FyZFwiKSB8fCBrZXkuaW5jbHVkZXMoXCJjb25zb2xlXCIpKSByZXR1cm4gXCJEYXNoXCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJpc3N1ZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJ0aWNrZXRcIikpIHJldHVybiBcIlRhc2tzXCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJkcml2ZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJzdG9yYWdlXCIpKSByZXR1cm4gXCJGaWxlc1wiO1xuICByZXR1cm4gXCJNaXNjXCI7XG59O1xuXG5leHBvcnQgY29uc3QgbmF2aWdhdGlvbktleSA9ICh0YWI6IFRhYk1ldGFkYXRhKTogc3RyaW5nID0+IHtcbiAgaWYgKHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIGBjaGlsZC1vZi0ke3RhYi5vcGVuZXJUYWJJZH1gO1xuICB9XG4gIHJldHVybiBgd2luZG93LSR7dGFiLndpbmRvd0lkfWA7XG59O1xuXG5jb25zdCBnZXRSZWNlbmN5TGFiZWwgPSAobGFzdEFjY2Vzc2VkOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICBjb25zdCBkaWZmID0gbm93IC0gbGFzdEFjY2Vzc2VkO1xuICBpZiAoZGlmZiA8IDM2MDAwMDApIHJldHVybiBcIkp1c3Qgbm93XCI7IC8vIDFoXG4gIGlmIChkaWZmIDwgODY0MDAwMDApIHJldHVybiBcIlRvZGF5XCI7IC8vIDI0aFxuICBpZiAoZGlmZiA8IDE3MjgwMDAwMCkgcmV0dXJuIFwiWWVzdGVyZGF5XCI7IC8vIDQ4aFxuICBpZiAoZGlmZiA8IDYwNDgwMDAwMCkgcmV0dXJuIFwiVGhpcyBXZWVrXCI7IC8vIDdkXG4gIHJldHVybiBcIk9sZGVyXCI7XG59O1xuXG5jb25zdCBjb2xvckZvcktleSA9IChrZXk6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIpOiBzdHJpbmcgPT4gQ09MT1JTWyhNYXRoLmFicyhoYXNoQ29kZShrZXkpKSArIG9mZnNldCkgJSBDT0xPUlMubGVuZ3RoXTtcblxuY29uc3QgaGFzaENvZGUgPSAodmFsdWU6IHN0cmluZyk6IG51bWJlciA9PiB7XG4gIGxldCBoYXNoID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5sZW5ndGg7IGkgKz0gMSkge1xuICAgIGhhc2ggPSAoaGFzaCA8PCA1KSAtIGhhc2ggKyB2YWx1ZS5jaGFyQ29kZUF0KGkpO1xuICAgIGhhc2ggfD0gMDtcbiAgfVxuICByZXR1cm4gaGFzaDtcbn07XG5cbi8vIEhlbHBlciB0byBnZXQgYSBodW1hbi1yZWFkYWJsZSBsYWJlbCBjb21wb25lbnQgZnJvbSBhIHN0cmF0ZWd5IGFuZCBhIHNldCBvZiB0YWJzXG5jb25zdCBnZXRMYWJlbENvbXBvbmVudCA9IChzdHJhdGVneTogR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZywgdGFiczogVGFiTWV0YWRhdGFbXSwgYWxsVGFic01hcDogTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+KTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGNvbnN0IGZpcnN0VGFiID0gdGFic1swXTtcbiAgaWYgKCFmaXJzdFRhYikgcmV0dXJuIFwiVW5rbm93blwiO1xuXG4gIC8vIENoZWNrIGN1c3RvbSBzdHJhdGVnaWVzIGZpcnN0XG4gIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgcmV0dXJuIGdyb3VwaW5nS2V5KGZpcnN0VGFiLCBzdHJhdGVneSk7XG4gIH1cblxuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcImRvbWFpblwiOiB7XG4gICAgICBjb25zdCBzaXRlTmFtZXMgPSBuZXcgU2V0KHRhYnMubWFwKHQgPT4gdC5jb250ZXh0RGF0YT8uc2l0ZU5hbWUpLmZpbHRlcihCb29sZWFuKSk7XG4gICAgICBpZiAoc2l0ZU5hbWVzLnNpemUgPT09IDEpIHtcbiAgICAgICAgcmV0dXJuIHN0cmlwVGxkKEFycmF5LmZyb20oc2l0ZU5hbWVzKVswXSBhcyBzdHJpbmcpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN0cmlwVGxkKGRvbWFpbkZyb21VcmwoZmlyc3RUYWIudXJsKSk7XG4gICAgfVxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgcmV0dXJuIGRvbWFpbkZyb21VcmwoZmlyc3RUYWIudXJsKTtcbiAgICBjYXNlIFwidG9waWNcIjpcbiAgICAgIHJldHVybiBzZW1hbnRpY0J1Y2tldChmaXJzdFRhYi50aXRsZSwgZmlyc3RUYWIudXJsKTtcbiAgICBjYXNlIFwibGluZWFnZVwiOlxuICAgICAgaWYgKGZpcnN0VGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29uc3QgcGFyZW50ID0gYWxsVGFic01hcC5nZXQoZmlyc3RUYWIub3BlbmVyVGFiSWQpO1xuICAgICAgICBpZiAocGFyZW50KSB7XG4gICAgICAgICAgY29uc3QgcGFyZW50VGl0bGUgPSBwYXJlbnQudGl0bGUubGVuZ3RoID4gMjAgPyBwYXJlbnQudGl0bGUuc3Vic3RyaW5nKDAsIDIwKSArIFwiLi4uXCIgOiBwYXJlbnQudGl0bGU7XG4gICAgICAgICAgcmV0dXJuIGBGcm9tOiAke3BhcmVudFRpdGxlfWA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGBGcm9tOiBUYWIgJHtmaXJzdFRhYi5vcGVuZXJUYWJJZH1gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGBXaW5kb3cgJHtmaXJzdFRhYi53aW5kb3dJZH1gO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIjtcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIucGlubmVkID8gXCJQaW5uZWRcIiA6IFwiVW5waW5uZWRcIjtcbiAgICBjYXNlIFwiYWdlXCI6XG4gICAgICByZXR1cm4gZ2V0UmVjZW5jeUxhYmVsKGZpcnN0VGFiLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbiAgICBjYXNlIFwidXJsXCI6XG4gICAgICByZXR1cm4gXCJVUkwgR3JvdXBcIjtcbiAgICBjYXNlIFwicmVjZW5jeVwiOlxuICAgICAgcmV0dXJuIFwiVGltZSBHcm91cFwiO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IFwiQ2hpbGRyZW5cIiA6IFwiUm9vdHNcIjtcbiAgICBkZWZhdWx0OlxuICAgICAgY29uc3QgdmFsID0gZ2V0RmllbGRWYWx1ZShmaXJzdFRhYiwgc3RyYXRlZ3kpO1xuICAgICAgaWYgKHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiBTdHJpbmcodmFsKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBcIlVua25vd25cIjtcbiAgfVxufTtcblxuY29uc3QgZ2VuZXJhdGVMYWJlbCA9IChcbiAgc3RyYXRlZ2llczogKEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpW10sXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIGFsbFRhYnNNYXA6IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPlxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgbGFiZWxzID0gc3RyYXRlZ2llc1xuICAgIC5tYXAocyA9PiBnZXRMYWJlbENvbXBvbmVudChzLCB0YWJzLCBhbGxUYWJzTWFwKSlcbiAgICAuZmlsdGVyKGwgPT4gbCAmJiBsICE9PSBcIlVua25vd25cIiAmJiBsICE9PSBcIkdyb3VwXCIgJiYgbCAhPT0gXCJVUkwgR3JvdXBcIiAmJiBsICE9PSBcIlRpbWUgR3JvdXBcIiAmJiBsICE9PSBcIk1pc2NcIik7XG5cbiAgaWYgKGxhYmVscy5sZW5ndGggPT09IDApIHJldHVybiBcIkdyb3VwXCI7XG4gIHJldHVybiBBcnJheS5mcm9tKG5ldyBTZXQobGFiZWxzKSkuam9pbihcIiAtIFwiKTtcbn07XG5cbmNvbnN0IGdldFN0cmF0ZWd5Q29sb3JSdWxlID0gKHN0cmF0ZWd5SWQ6IHN0cmluZyk6IEdyb3VwaW5nUnVsZSB8IHVuZGVmaW5lZCA9PiB7XG4gICAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3lJZCk7XG4gICAgaWYgKCFjdXN0b20pIHJldHVybiB1bmRlZmluZWQ7XG5cbiAgICBjb25zdCBncm91cGluZ1J1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgLy8gSXRlcmF0ZSBtYW51YWxseSB0byBjaGVjayBjb2xvclxuICAgIGZvciAobGV0IGkgPSBncm91cGluZ1J1bGVzTGlzdC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICBjb25zdCBydWxlID0gZ3JvdXBpbmdSdWxlc0xpc3RbaV07XG4gICAgICAgIGlmIChydWxlICYmIHJ1bGUuY29sb3IgJiYgcnVsZS5jb2xvciAhPT0gJ3JhbmRvbScpIHtcbiAgICAgICAgICAgIHJldHVybiBydWxlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB1bmRlZmluZWQ7XG59O1xuXG5jb25zdCByZXNvbHZlV2luZG93TW9kZSA9IChtb2RlczogKHN0cmluZyB8IHVuZGVmaW5lZClbXSk6IFwiY3VycmVudFwiIHwgXCJuZXdcIiB8IFwiY29tcG91bmRcIiA9PiB7XG4gICAgaWYgKG1vZGVzLmluY2x1ZGVzKFwibmV3XCIpKSByZXR1cm4gXCJuZXdcIjtcbiAgICBpZiAobW9kZXMuaW5jbHVkZXMoXCJjb21wb3VuZFwiKSkgcmV0dXJuIFwiY29tcG91bmRcIjtcbiAgICByZXR1cm4gXCJjdXJyZW50XCI7XG59O1xuXG5leHBvcnQgY29uc3QgZ3JvdXBUYWJzID0gKFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBzdHJhdGVnaWVzOiAoU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nKVtdXG4pOiBUYWJHcm91cFtdID0+IHtcbiAgY29uc3QgYXZhaWxhYmxlU3RyYXRlZ2llcyA9IGdldFN0cmF0ZWdpZXMoY3VzdG9tU3RyYXRlZ2llcyk7XG4gIGNvbnN0IGVmZmVjdGl2ZVN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IGF2YWlsYWJsZVN0cmF0ZWdpZXMuZmluZChhdmFpbCA9PiBhdmFpbC5pZCA9PT0gcyk/LmlzR3JvdXBpbmcpO1xuICBjb25zdCBidWNrZXRzID0gbmV3IE1hcDxzdHJpbmcsIFRhYkdyb3VwPigpO1xuXG4gIGNvbnN0IGFsbFRhYnNNYXAgPSBuZXcgTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+KCk7XG4gIHRhYnMuZm9yRWFjaCh0ID0+IGFsbFRhYnNNYXAuc2V0KHQuaWQsIHQpKTtcblxuICB0YWJzLmZvckVhY2goKHRhYikgPT4ge1xuICAgIGxldCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGFwcGxpZWRTdHJhdGVnaWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGNvbGxlY3RlZE1vZGVzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCBzIG9mIGVmZmVjdGl2ZVN0cmF0ZWdpZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGdldEdyb3VwaW5nUmVzdWx0KHRhYiwgcyk7XG4gICAgICAgICAgICBpZiAocmVzdWx0LmtleSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGtleXMucHVzaChgJHtzfToke3Jlc3VsdC5rZXl9YCk7XG4gICAgICAgICAgICAgICAgYXBwbGllZFN0cmF0ZWdpZXMucHVzaChzKTtcbiAgICAgICAgICAgICAgICBjb2xsZWN0ZWRNb2Rlcy5wdXNoKHJlc3VsdC5tb2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nRGVidWcoXCJFcnJvciBnZW5lcmF0aW5nIGdyb3VwaW5nIGtleVwiLCB7IHRhYklkOiB0YWIuaWQsIGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgIHJldHVybjsgLy8gU2tpcCB0aGlzIHRhYiBvbiBlcnJvclxuICAgIH1cblxuICAgIC8vIElmIG5vIHN0cmF0ZWdpZXMgYXBwbGllZCAoZS5nLiBhbGwgZmlsdGVyZWQgb3V0KSwgc2tpcCBncm91cGluZyBmb3IgdGhpcyB0YWJcbiAgICBpZiAoa2V5cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGVmZmVjdGl2ZU1vZGUgPSByZXNvbHZlV2luZG93TW9kZShjb2xsZWN0ZWRNb2Rlcyk7XG4gICAgY29uc3QgdmFsdWVLZXkgPSBrZXlzLmpvaW4oXCI6OlwiKTtcbiAgICBsZXQgYnVja2V0S2V5ID0gXCJcIjtcbiAgICBpZiAoZWZmZWN0aXZlTW9kZSA9PT0gJ2N1cnJlbnQnKSB7XG4gICAgICAgICBidWNrZXRLZXkgPSBgd2luZG93LSR7dGFiLndpbmRvd0lkfTo6YCArIHZhbHVlS2V5O1xuICAgIH0gZWxzZSB7XG4gICAgICAgICBidWNrZXRLZXkgPSBgZ2xvYmFsOjpgICsgdmFsdWVLZXk7XG4gICAgfVxuXG4gICAgbGV0IGdyb3VwID0gYnVja2V0cy5nZXQoYnVja2V0S2V5KTtcbiAgICBpZiAoIWdyb3VwKSB7XG4gICAgICBsZXQgZ3JvdXBDb2xvciA9IG51bGw7XG4gICAgICBsZXQgY29sb3JGaWVsZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgbGV0IGNvbG9yVHJhbnNmb3JtOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICBsZXQgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgICAgIGZvciAoY29uc3Qgc0lkIG9mIGFwcGxpZWRTdHJhdGVnaWVzKSB7XG4gICAgICAgIGNvbnN0IHJ1bGUgPSBnZXRTdHJhdGVneUNvbG9yUnVsZShzSWQpO1xuICAgICAgICBpZiAocnVsZSkge1xuICAgICAgICAgICAgZ3JvdXBDb2xvciA9IHJ1bGUuY29sb3I7XG4gICAgICAgICAgICBjb2xvckZpZWxkID0gcnVsZS5jb2xvckZpZWxkO1xuICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm0gPSBydWxlLmNvbG9yVHJhbnNmb3JtO1xuICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuID0gcnVsZS5jb2xvclRyYW5zZm9ybVBhdHRlcm47XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoZ3JvdXBDb2xvciA9PT0gJ21hdGNoJykge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkodmFsdWVLZXksIDApO1xuICAgICAgfSBlbHNlIGlmIChncm91cENvbG9yID09PSAnZmllbGQnICYmIGNvbG9yRmllbGQpIHtcbiAgICAgICAgY29uc3QgdmFsID0gZ2V0RmllbGRWYWx1ZSh0YWIsIGNvbG9yRmllbGQpO1xuICAgICAgICBsZXQga2V5ID0gdmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsID8gU3RyaW5nKHZhbCkgOiBcIlwiO1xuICAgICAgICBpZiAoY29sb3JUcmFuc2Zvcm0pIHtcbiAgICAgICAgICAgIGtleSA9IGFwcGx5VmFsdWVUcmFuc2Zvcm0oa2V5LCBjb2xvclRyYW5zZm9ybSwgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuKTtcbiAgICAgICAgfVxuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkoa2V5LCAwKTtcbiAgICAgIH0gZWxzZSBpZiAoIWdyb3VwQ29sb3IgfHwgZ3JvdXBDb2xvciA9PT0gJ2ZpZWxkJykge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkoYnVja2V0S2V5LCBidWNrZXRzLnNpemUpO1xuICAgICAgfVxuXG4gICAgICBncm91cCA9IHtcbiAgICAgICAgaWQ6IGJ1Y2tldEtleSxcbiAgICAgICAgd2luZG93SWQ6IHRhYi53aW5kb3dJZCxcbiAgICAgICAgbGFiZWw6IFwiXCIsXG4gICAgICAgIGNvbG9yOiBncm91cENvbG9yLFxuICAgICAgICB0YWJzOiBbXSxcbiAgICAgICAgcmVhc29uOiBhcHBsaWVkU3RyYXRlZ2llcy5qb2luKFwiICsgXCIpLFxuICAgICAgICB3aW5kb3dNb2RlOiBlZmZlY3RpdmVNb2RlXG4gICAgICB9O1xuICAgICAgYnVja2V0cy5zZXQoYnVja2V0S2V5LCBncm91cCk7XG4gICAgfVxuICAgIGdyb3VwLnRhYnMucHVzaCh0YWIpO1xuICB9KTtcblxuICBjb25zdCBncm91cHMgPSBBcnJheS5mcm9tKGJ1Y2tldHMudmFsdWVzKCkpO1xuICBncm91cHMuZm9yRWFjaChncm91cCA9PiB7XG4gICAgZ3JvdXAubGFiZWwgPSBnZW5lcmF0ZUxhYmVsKGVmZmVjdGl2ZVN0cmF0ZWdpZXMsIGdyb3VwLnRhYnMsIGFsbFRhYnNNYXApO1xuICB9KTtcblxuICByZXR1cm4gZ3JvdXBzO1xufTtcblxuY29uc3QgY2hlY2tWYWx1ZU1hdGNoID0gKFxuICAgIG9wZXJhdG9yOiBzdHJpbmcsXG4gICAgcmF3VmFsdWU6IGFueSxcbiAgICBydWxlVmFsdWU6IHN0cmluZ1xuKTogeyBpc01hdGNoOiBib29sZWFuOyBtYXRjaE9iajogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCB9ID0+IHtcbiAgICBjb25zdCB2YWx1ZVN0ciA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQgJiYgcmF3VmFsdWUgIT09IG51bGwgPyBTdHJpbmcocmF3VmFsdWUpIDogXCJcIjtcbiAgICBjb25zdCB2YWx1ZVRvQ2hlY2sgPSB2YWx1ZVN0ci50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IHBhdHRlcm5Ub0NoZWNrID0gcnVsZVZhbHVlID8gcnVsZVZhbHVlLnRvTG93ZXJDYXNlKCkgOiBcIlwiO1xuXG4gICAgbGV0IGlzTWF0Y2ggPSBmYWxzZTtcbiAgICBsZXQgbWF0Y2hPYmo6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGwgPSBudWxsO1xuXG4gICAgc3dpdGNoIChvcGVyYXRvcikge1xuICAgICAgICBjYXNlICdjb250YWlucyc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suaW5jbHVkZXMocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZG9lc05vdENvbnRhaW4nOiBpc01hdGNoID0gIXZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdlcXVhbHMnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrID09PSBwYXR0ZXJuVG9DaGVjazsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3N0YXJ0c1dpdGgnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrLnN0YXJ0c1dpdGgocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZW5kc1dpdGgnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrLmVuZHNXaXRoKHBhdHRlcm5Ub0NoZWNrKTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2V4aXN0cyc6IGlzTWF0Y2ggPSByYXdWYWx1ZSAhPT0gdW5kZWZpbmVkOyBicmVhaztcbiAgICAgICAgY2FzZSAnZG9lc05vdEV4aXN0JzogaXNNYXRjaCA9IHJhd1ZhbHVlID09PSB1bmRlZmluZWQ7IGJyZWFrO1xuICAgICAgICBjYXNlICdpc051bGwnOiBpc01hdGNoID0gcmF3VmFsdWUgPT09IG51bGw7IGJyZWFrO1xuICAgICAgICBjYXNlICdpc05vdE51bGwnOiBpc01hdGNoID0gcmF3VmFsdWUgIT09IG51bGw7IGJyZWFrO1xuICAgICAgICBjYXNlICdtYXRjaGVzJzpcbiAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChydWxlVmFsdWUsICdpJyk7XG4gICAgICAgICAgICAgICAgbWF0Y2hPYmogPSByZWdleC5leGVjKHZhbHVlU3RyKTtcbiAgICAgICAgICAgICAgICBpc01hdGNoID0gISFtYXRjaE9iajtcbiAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4geyBpc01hdGNoLCBtYXRjaE9iaiB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGNoZWNrQ29uZGl0aW9uID0gKGNvbmRpdGlvbjogUnVsZUNvbmRpdGlvbiwgdGFiOiBUYWJNZXRhZGF0YSk6IGJvb2xlYW4gPT4ge1xuICAgIGlmICghY29uZGl0aW9uKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgcmF3VmFsdWUgPSBnZXRGaWVsZFZhbHVlKHRhYiwgY29uZGl0aW9uLmZpZWxkKTtcbiAgICBjb25zdCB7IGlzTWF0Y2ggfSA9IGNoZWNrVmFsdWVNYXRjaChjb25kaXRpb24ub3BlcmF0b3IsIHJhd1ZhbHVlLCBjb25kaXRpb24udmFsdWUpO1xuICAgIHJldHVybiBpc01hdGNoO1xufTtcblxuZXhwb3J0IGNvbnN0IGFwcGx5VmFsdWVUcmFuc2Zvcm0gPSAodmFsOiBzdHJpbmcsIHRyYW5zZm9ybTogc3RyaW5nLCBwYXR0ZXJuPzogc3RyaW5nLCByZXBsYWNlbWVudD86IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgaWYgKCF2YWwgfHwgIXRyYW5zZm9ybSB8fCB0cmFuc2Zvcm0gPT09ICdub25lJykgcmV0dXJuIHZhbDtcblxuICAgIHN3aXRjaCAodHJhbnNmb3JtKSB7XG4gICAgICAgIGNhc2UgJ3N0cmlwVGxkJzpcbiAgICAgICAgICAgIHJldHVybiBzdHJpcFRsZCh2YWwpO1xuICAgICAgICBjYXNlICdsb3dlcmNhc2UnOlxuICAgICAgICAgICAgcmV0dXJuIHZhbC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBjYXNlICd1cHBlcmNhc2UnOlxuICAgICAgICAgICAgcmV0dXJuIHZhbC50b1VwcGVyQ2FzZSgpO1xuICAgICAgICBjYXNlICdmaXJzdENoYXInOlxuICAgICAgICAgICAgcmV0dXJuIHZhbC5jaGFyQXQoMCk7XG4gICAgICAgIGNhc2UgJ2RvbWFpbic6XG4gICAgICAgICAgICByZXR1cm4gZG9tYWluRnJvbVVybCh2YWwpO1xuICAgICAgICBjYXNlICdob3N0bmFtZSc6XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICByZXR1cm4gbmV3IFVSTCh2YWwpLmhvc3RuYW1lO1xuICAgICAgICAgICAgfSBjYXRjaCB7IHJldHVybiB2YWw7IH1cbiAgICAgICAgY2FzZSAncmVnZXgnOlxuICAgICAgICAgICAgaWYgKHBhdHRlcm4pIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBsZXQgcmVnZXggPSByZWdleENhY2hlLmdldChwYXR0ZXJuKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFyZWdleCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVnZXggPSBuZXcgUmVnRXhwKHBhdHRlcm4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVnZXhDYWNoZS5zZXQocGF0dGVybiwgcmVnZXgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gcmVnZXguZXhlYyh2YWwpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBleHRyYWN0ZWQgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4dHJhY3RlZCArPSBtYXRjaFtpXSB8fCBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGV4dHJhY3RlZDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkludmFsaWQgcmVnZXggaW4gdHJhbnNmb3JtXCIsIHsgcGF0dGVybjogcGF0dGVybiwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgY2FzZSAncmVnZXhSZXBsYWNlJzpcbiAgICAgICAgICAgICBpZiAocGF0dGVybikge1xuICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgLy8gVXNpbmcgJ2cnIGdsb2JhbCBmbGFnIGJ5IGRlZmF1bHQgZm9yIHJlcGxhY2VtZW50XG4gICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmFsLnJlcGxhY2UobmV3IFJlZ0V4cChwYXR0ZXJuLCAnZycpLCByZXBsYWNlbWVudCB8fCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgbG9nRGVidWcoXCJJbnZhbGlkIHJlZ2V4IGluIHRyYW5zZm9ybVwiLCB7IHBhdHRlcm46IHBhdHRlcm4sIGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmFsO1xuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfVxuICAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gdmFsO1xuICAgIH1cbn07XG5cbmZ1bmN0aW9uIGV2YWx1YXRlTGVnYWN5UnVsZXMobGVnYWN5UnVsZXM6IFN0cmF0ZWd5UnVsZVtdLCB0YWI6IFRhYk1ldGFkYXRhKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgLy8gRGVmZW5zaXZlIGNoZWNrXG4gICAgaWYgKCFsZWdhY3lSdWxlcyB8fCAhQXJyYXkuaXNBcnJheShsZWdhY3lSdWxlcykpIHtcbiAgICAgICAgaWYgKCFsZWdhY3lSdWxlcykgcmV0dXJuIG51bGw7XG4gICAgICAgIC8vIFRyeSBhc0FycmF5IGlmIGl0J3Mgbm90IGFycmF5IGJ1dCB0cnV0aHkgKHVubGlrZWx5IGdpdmVuIHByZXZpb3VzIGxvZ2ljIGJ1dCBzYWZlKVxuICAgIH1cblxuICAgIGNvbnN0IGxlZ2FjeVJ1bGVzTGlzdCA9IGFzQXJyYXk8U3RyYXRlZ3lSdWxlPihsZWdhY3lSdWxlcyk7XG4gICAgaWYgKGxlZ2FjeVJ1bGVzTGlzdC5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGxlZ2FjeVJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHJhd1ZhbHVlID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgY29uc3QgeyBpc01hdGNoLCBtYXRjaE9iaiB9ID0gY2hlY2tWYWx1ZU1hdGNoKHJ1bGUub3BlcmF0b3IsIHJhd1ZhbHVlLCBydWxlLnZhbHVlKTtcblxuICAgICAgICAgICAgaWYgKGlzTWF0Y2gpIHtcbiAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gcnVsZS5yZXN1bHQ7XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoT2JqKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbWF0Y2hPYmoubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShuZXcgUmVnRXhwKGBcXFxcJCR7aX1gLCAnZycpLCBtYXRjaE9ialtpXSB8fCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbG9nRGVidWcoXCJFcnJvciBldmFsdWF0aW5nIGxlZ2FjeSBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGNvbnN0IGdldEdyb3VwaW5nUmVzdWx0ID0gKHRhYjogVGFiTWV0YWRhdGEsIHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogeyBrZXk6IHN0cmluZyB8IG51bGwsIG1vZGU6IFwiY3VycmVudFwiIHwgXCJuZXdcIiB8IFwiY29tcG91bmRcIiB9ID0+IHtcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICBjb25zdCBmaWx0ZXJHcm91cHNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uW10+KGN1c3RvbS5maWx0ZXJHcm91cHMpO1xuICAgICAgY29uc3QgZmlsdGVyc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGN1c3RvbS5maWx0ZXJzKTtcblxuICAgICAgbGV0IG1hdGNoID0gZmFsc2U7XG5cbiAgICAgIGlmIChmaWx0ZXJHcm91cHNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBPUiBsb2dpY1xuICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZmlsdGVyR3JvdXBzTGlzdCkge1xuICAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihncm91cCk7XG4gICAgICAgICAgICAgIGlmIChncm91cFJ1bGVzLmxlbmd0aCA9PT0gMCB8fCBncm91cFJ1bGVzLmV2ZXJ5KHIgPT4gY2hlY2tDb25kaXRpb24ociwgdGFiKSkpIHtcbiAgICAgICAgICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChmaWx0ZXJzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gTGVnYWN5L1NpbXBsZSBBTkQgbG9naWNcbiAgICAgICAgICBpZiAoZmlsdGVyc0xpc3QuZXZlcnkoZiA9PiBjaGVja0NvbmRpdGlvbihmLCB0YWIpKSkge1xuICAgICAgICAgICAgICBtYXRjaCA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBObyBmaWx0ZXJzIC0+IE1hdGNoIGFsbFxuICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICAgIHJldHVybiB7IGtleTogbnVsbCwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZ3JvdXBpbmdSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgICAgaWYgKGdyb3VwaW5nUnVsZXNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICBjb25zdCBtb2Rlczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwaW5nUnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBsZXQgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICAgICBpZiAocnVsZS5zb3VyY2UgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJhdyA9IGdldEZpZWxkVmFsdWUodGFiLCBydWxlLnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHJhdyAhPT0gdW5kZWZpbmVkICYmIHJhdyAhPT0gbnVsbCA/IFN0cmluZyhyYXcpIDogXCJcIjtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgdmFsID0gcnVsZS52YWx1ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodmFsICYmIHJ1bGUudHJhbnNmb3JtICYmIHJ1bGUudHJhbnNmb3JtICE9PSAnbm9uZScpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsID0gYXBwbHlWYWx1ZVRyYW5zZm9ybSh2YWwsIHJ1bGUudHJhbnNmb3JtLCBydWxlLnRyYW5zZm9ybVBhdHRlcm4sIHJ1bGUudHJhbnNmb3JtUmVwbGFjZW1lbnQpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgcGFydHMucHVzaCh2YWwpO1xuICAgICAgICAgICAgICAgICAgICBpZiAocnVsZS53aW5kb3dNb2RlKSBtb2Rlcy5wdXNoKHJ1bGUud2luZG93TW9kZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGFwcGx5aW5nIGdyb3VwaW5nIHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICByZXR1cm4geyBrZXk6IHBhcnRzLmpvaW4oXCIgLSBcIiksIG1vZGU6IHJlc29sdmVXaW5kb3dNb2RlKG1vZGVzKSB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4geyBrZXk6IGN1c3RvbS5mYWxsYmFjayB8fCBcIk1pc2NcIiwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH0gZWxzZSBpZiAoY3VzdG9tLnJ1bGVzKSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gZXZhbHVhdGVMZWdhY3lSdWxlcyhhc0FycmF5PFN0cmF0ZWd5UnVsZT4oY3VzdG9tLnJ1bGVzKSwgdGFiKTtcbiAgICAgICAgICBpZiAocmVzdWx0KSByZXR1cm4geyBrZXk6IHJlc3VsdCwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHsga2V5OiBjdXN0b20uZmFsbGJhY2sgfHwgXCJNaXNjXCIsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gIH1cblxuICAvLyBCdWlsdC1pbiBzdHJhdGVnaWVzXG4gIGxldCBzaW1wbGVLZXk6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcImRvbWFpblwiOlxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgc2ltcGxlS2V5ID0gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgc2ltcGxlS2V5ID0gc2VtYW50aWNCdWNrZXQodGFiLnRpdGxlLCB0YWIudXJsKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJsaW5lYWdlXCI6XG4gICAgICBzaW1wbGVLZXkgPSBuYXZpZ2F0aW9uS2V5KHRhYik7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLmNvbnRleHQgfHwgXCJVbmNhdGVnb3JpemVkXCI7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIucGlubmVkID8gXCJwaW5uZWRcIiA6IFwidW5waW5uZWRcIjtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJhZ2VcIjpcbiAgICAgIHNpbXBsZUtleSA9IGdldFJlY2VuY3lMYWJlbCh0YWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInVybFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnVybDtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ0aXRsZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnRpdGxlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInJlY2VuY3lcIjpcbiAgICAgIHNpbXBsZUtleSA9IFN0cmluZyh0YWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gXCJjaGlsZFwiIDogXCJyb290XCI7XG4gICAgICBicmVhaztcbiAgICBkZWZhdWx0OlxuICAgICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKHRhYiwgc3RyYXRlZ3kpO1xuICAgICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsKSB7XG4gICAgICAgICAgICBzaW1wbGVLZXkgPSBTdHJpbmcodmFsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNpbXBsZUtleSA9IFwiVW5rbm93blwiO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICB9XG4gIHJldHVybiB7IGtleTogc2ltcGxlS2V5LCBtb2RlOiBcImN1cnJlbnRcIiB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGdyb3VwaW5nS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEsIHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gICAgcmV0dXJuIGdldEdyb3VwaW5nUmVzdWx0KHRhYiwgc3RyYXRlZ3kpLmtleTtcbn07XG5cbmZ1bmN0aW9uIGlzQ29udGV4dEZpZWxkKGZpZWxkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gZmllbGQgPT09ICdjb250ZXh0JyB8fCBmaWVsZCA9PT0gJ2dlbnJlJyB8fCBmaWVsZCA9PT0gJ3NpdGVOYW1lJyB8fCBmaWVsZC5zdGFydHNXaXRoKCdjb250ZXh0RGF0YS4nKTtcbn1cblxuZXhwb3J0IGNvbnN0IHJlcXVpcmVzQ29udGV4dEFuYWx5c2lzID0gKHN0cmF0ZWd5SWRzOiAoc3RyaW5nIHwgU29ydGluZ1N0cmF0ZWd5KVtdKTogYm9vbGVhbiA9PiB7XG4gICAgLy8gQ2hlY2sgaWYgXCJjb250ZXh0XCIgc3RyYXRlZ3kgaXMgZXhwbGljaXRseSByZXF1ZXN0ZWRcbiAgICBpZiAoc3RyYXRlZ3lJZHMuaW5jbHVkZXMoXCJjb250ZXh0XCIpKSByZXR1cm4gdHJ1ZTtcblxuICAgIGNvbnN0IHN0cmF0ZWdpZXMgPSBnZXRTdHJhdGVnaWVzKGN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgIC8vIGZpbHRlciBvbmx5IHRob3NlIHRoYXQgbWF0Y2ggdGhlIHJlcXVlc3RlZCBJRHNcbiAgICBjb25zdCBhY3RpdmVEZWZzID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiBzdHJhdGVneUlkcy5pbmNsdWRlcyhzLmlkKSk7XG5cbiAgICBmb3IgKGNvbnN0IGRlZiBvZiBhY3RpdmVEZWZzKSB7XG4gICAgICAgIC8vIElmIGl0J3MgYSBidWlsdC1pbiBzdHJhdGVneSB0aGF0IG5lZWRzIGNvbnRleHQgKG9ubHkgJ2NvbnRleHQnIGRvZXMpXG4gICAgICAgIGlmIChkZWYuaWQgPT09ICdjb250ZXh0JykgcmV0dXJuIHRydWU7XG5cbiAgICAgICAgLy8gSWYgaXQgaXMgYSBjdXN0b20gc3RyYXRlZ3kgKG9yIG92ZXJyaWRlcyBidWlsdC1pbiksIGNoZWNrIGl0cyBydWxlc1xuICAgICAgICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQoYyA9PiBjLmlkID09PSBkZWYuaWQpO1xuICAgICAgICBpZiAoY3VzdG9tKSB7XG4gICAgICAgICAgICAgY29uc3QgZ3JvdXBSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IHNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uc29ydGluZ1J1bGVzKTtcbiAgICAgICAgICAgICBjb25zdCBncm91cFNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uZ3JvdXBTb3J0aW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IGZpbHRlcnNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihjdXN0b20uZmlsdGVycyk7XG4gICAgICAgICAgICAgY29uc3QgZmlsdGVyR3JvdXBzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbltdPihjdXN0b20uZmlsdGVyR3JvdXBzKTtcblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBydWxlLnNvdXJjZSA9PT0gJ2ZpZWxkJyAmJiBpc0NvbnRleHRGaWVsZChydWxlLnZhbHVlKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIHJ1bGUuY29sb3IgPT09ICdmaWVsZCcgJiYgcnVsZS5jb2xvckZpZWxkICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuY29sb3JGaWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBzb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBTb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZmlsdGVyc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZmlsdGVyR3JvdXBzTGlzdCkge1xuICAgICAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihncm91cCk7XG4gICAgICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFJ1bGVzKSB7XG4gICAgICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufTtcbiIsICJpbXBvcnQgeyBTb3J0aW5nU3RyYXRlZ3ksIFRhYk1ldGFkYXRhLCBDdXN0b21TdHJhdGVneSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBkb21haW5Gcm9tVXJsLCBzZW1hbnRpY0J1Y2tldCwgbmF2aWdhdGlvbktleSwgZ3JvdXBpbmdLZXksIGdldEZpZWxkVmFsdWUsIGdldEN1c3RvbVN0cmF0ZWdpZXMgfSBmcm9tIFwiLi9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCByZWNlbmN5U2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gdGFiLmxhc3RBY2Nlc3NlZCA/PyAwO1xuZXhwb3J0IGNvbnN0IGhpZXJhcmNoeVNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+ICh0YWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IDEgOiAwKTtcbmV4cG9ydCBjb25zdCBwaW5uZWRTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiAodGFiLnBpbm5lZCA/IDAgOiAxKTtcblxuZXhwb3J0IGNvbnN0IHNvcnRUYWJzID0gKHRhYnM6IFRhYk1ldGFkYXRhW10sIHN0cmF0ZWdpZXM6IFNvcnRpbmdTdHJhdGVneVtdKTogVGFiTWV0YWRhdGFbXSA9PiB7XG4gIGNvbnN0IHNjb3Jpbmc6IFNvcnRpbmdTdHJhdGVneVtdID0gc3RyYXRlZ2llcy5sZW5ndGggPyBzdHJhdGVnaWVzIDogW1wicGlubmVkXCIsIFwicmVjZW5jeVwiXTtcbiAgcmV0dXJuIFsuLi50YWJzXS5zb3J0KChhLCBiKSA9PiB7XG4gICAgZm9yIChjb25zdCBzdHJhdGVneSBvZiBzY29yaW5nKSB7XG4gICAgICBjb25zdCBkaWZmID0gY29tcGFyZUJ5KHN0cmF0ZWd5LCBhLCBiKTtcbiAgICAgIGlmIChkaWZmICE9PSAwKSByZXR1cm4gZGlmZjtcbiAgICB9XG4gICAgcmV0dXJuIGEuaWQgLSBiLmlkO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBjb21wYXJlQnkgPSAoc3RyYXRlZ3k6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZywgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyID0+IHtcbiAgLy8gMS4gQ2hlY2sgQ3VzdG9tIFN0cmF0ZWdpZXMgZm9yIFNvcnRpbmcgUnVsZXNcbiAgY29uc3QgY3VzdG9tU3RyYXRzID0gZ2V0Q3VzdG9tU3RyYXRlZ2llcygpO1xuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdHMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5zb3J0aW5nUnVsZXMpO1xuICAgICAgaWYgKHNvcnRSdWxlc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIEV2YWx1YXRlIGN1c3RvbSBzb3J0aW5nIHJ1bGVzIGluIG9yZGVyXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBydWxlLmZpZWxkKTtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbEIgPSBnZXRGaWVsZFZhbHVlKGIsIHJ1bGUuZmllbGQpO1xuXG4gICAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gMDtcbiAgICAgICAgICAgICAgICAgIGlmICh2YWxBIDwgdmFsQikgcmVzdWx0ID0gLTE7XG4gICAgICAgICAgICAgICAgICBlbHNlIGlmICh2YWxBID4gdmFsQikgcmVzdWx0ID0gMTtcblxuICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBydWxlLm9yZGVyID09PSAnZGVzYycgPyAtcmVzdWx0IDogcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgY3VzdG9tIHNvcnRpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBJZiBhbGwgcnVsZXMgZXF1YWwsIGNvbnRpbnVlIHRvIG5leHQgc3RyYXRlZ3kgKHJldHVybiAwKVxuICAgICAgICAgIHJldHVybiAwO1xuICAgICAgfVxuICB9XG5cbiAgLy8gMi4gQnVpbHQtaW4gb3IgZmFsbGJhY2tcbiAgc3dpdGNoIChzdHJhdGVneSkge1xuICAgIGNhc2UgXCJyZWNlbmN5XCI6XG4gICAgICByZXR1cm4gKGIubGFzdEFjY2Vzc2VkID8/IDApIC0gKGEubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6IC8vIEZvcm1lcmx5IGhpZXJhcmNoeVxuICAgICAgcmV0dXJuIGhpZXJhcmNoeVNjb3JlKGEpIC0gaGllcmFyY2h5U2NvcmUoYik7XG4gICAgY2FzZSBcInBpbm5lZFwiOlxuICAgICAgcmV0dXJuIHBpbm5lZFNjb3JlKGEpIC0gcGlubmVkU2NvcmUoYik7XG4gICAgY2FzZSBcInRpdGxlXCI6XG4gICAgICByZXR1cm4gYS50aXRsZS5sb2NhbGVDb21wYXJlKGIudGl0bGUpO1xuICAgIGNhc2UgXCJ1cmxcIjpcbiAgICAgIHJldHVybiBhLnVybC5sb2NhbGVDb21wYXJlKGIudXJsKTtcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgcmV0dXJuIChhLmNvbnRleHQgPz8gXCJcIikubG9jYWxlQ29tcGFyZShiLmNvbnRleHQgPz8gXCJcIik7XG4gICAgY2FzZSBcImRvbWFpblwiOlxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgcmV0dXJuIGRvbWFpbkZyb21VcmwoYS51cmwpLmxvY2FsZUNvbXBhcmUoZG9tYWluRnJvbVVybChiLnVybCkpO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgcmV0dXJuIHNlbWFudGljQnVja2V0KGEudGl0bGUsIGEudXJsKS5sb2NhbGVDb21wYXJlKHNlbWFudGljQnVja2V0KGIudGl0bGUsIGIudXJsKSk7XG4gICAgY2FzZSBcImxpbmVhZ2VcIjpcbiAgICAgIHJldHVybiBuYXZpZ2F0aW9uS2V5KGEpLmxvY2FsZUNvbXBhcmUobmF2aWdhdGlvbktleShiKSk7XG4gICAgY2FzZSBcImFnZVwiOlxuICAgICAgLy8gUmV2ZXJzZSBhbHBoYWJldGljYWwgZm9yIGFnZSBidWNrZXRzIChUb2RheSA8IFllc3RlcmRheSksIHJvdWdoIGFwcHJveFxuICAgICAgcmV0dXJuIChncm91cGluZ0tleShhLCBcImFnZVwiKSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIFwiYWdlXCIpIHx8IFwiXCIpO1xuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBDaGVjayBpZiBpdCdzIGEgZ2VuZXJpYyBmaWVsZCBmaXJzdFxuICAgICAgY29uc3QgdmFsQSA9IGdldEZpZWxkVmFsdWUoYSwgc3RyYXRlZ3kpO1xuICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgc3RyYXRlZ3kpO1xuXG4gICAgICBpZiAodmFsQSAhPT0gdW5kZWZpbmVkICYmIHZhbEIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGlmICh2YWxBIDwgdmFsQikgcmV0dXJuIC0xO1xuICAgICAgICAgIGlmICh2YWxBID4gdmFsQikgcmV0dXJuIDE7XG4gICAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9XG5cbiAgICAgIC8vIEZhbGxiYWNrIGZvciBjdXN0b20gc3RyYXRlZ2llcyBncm91cGluZyBrZXkgKGlmIHVzaW5nIGN1c3RvbSBzdHJhdGVneSBhcyBzb3J0aW5nIGJ1dCBubyBzb3J0aW5nIHJ1bGVzIGRlZmluZWQpXG4gICAgICAvLyBvciB1bmhhbmRsZWQgYnVpbHQtaW5zXG4gICAgICByZXR1cm4gKGdyb3VwaW5nS2V5KGEsIHN0cmF0ZWd5KSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIHN0cmF0ZWd5KSB8fCBcIlwiKTtcbiAgfVxufTtcbiIsICJpbXBvcnQge1xuICBBcHBseUdyb3VwaW5nUGF5bG9hZCxcbiAgR3JvdXBpbmdTZWxlY3Rpb24sXG4gIFByZWZlcmVuY2VzLFxuICBSdW50aW1lTWVzc2FnZSxcbiAgUnVudGltZVJlc3BvbnNlLFxuICBTYXZlZFN0YXRlLFxuICBTb3J0aW5nU3RyYXRlZ3ksXG4gIFRhYkdyb3VwLFxuICBUYWJNZXRhZGF0YVxufSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBmZXRjaExvY2FsU3RhdGUgfSBmcm9tIFwiLi9sb2NhbFN0YXRlLmpzXCI7XG5cbmV4cG9ydCBjb25zdCBzZW5kTWVzc2FnZSA9IGFzeW5jIDxURGF0YT4odHlwZTogUnVudGltZU1lc3NhZ2VbXCJ0eXBlXCJdLCBwYXlsb2FkPzogYW55KTogUHJvbWlzZTxSdW50aW1lUmVzcG9uc2U8VERhdGE+PiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZSwgcGF5bG9hZCB9LCAocmVzcG9uc2UpID0+IHtcbiAgICAgIGlmIChjaHJvbWUucnVudGltZS5sYXN0RXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIlJ1bnRpbWUgZXJyb3I6XCIsIGNocm9tZS5ydW50aW1lLmxhc3RFcnJvcik7XG4gICAgICAgIHJlc29sdmUoeyBvazogZmFsc2UsIGVycm9yOiBjaHJvbWUucnVudGltZS5sYXN0RXJyb3IubWVzc2FnZSB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc29sdmUocmVzcG9uc2UgfHwgeyBvazogZmFsc2UsIGVycm9yOiBcIk5vIHJlc3BvbnNlIGZyb20gYmFja2dyb3VuZFwiIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcbn07XG5cbmV4cG9ydCB0eXBlIFRhYldpdGhHcm91cCA9IFRhYk1ldGFkYXRhICYge1xuICBncm91cExhYmVsPzogc3RyaW5nO1xuICBncm91cENvbG9yPzogc3RyaW5nO1xuICByZWFzb24/OiBzdHJpbmc7XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFdpbmRvd1ZpZXcge1xuICBpZDogbnVtYmVyO1xuICB0aXRsZTogc3RyaW5nO1xuICB0YWJzOiBUYWJXaXRoR3JvdXBbXTtcbiAgdGFiQ291bnQ6IG51bWJlcjtcbiAgZ3JvdXBDb3VudDogbnVtYmVyO1xuICBwaW5uZWRDb3VudDogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgSUNPTlMgPSB7XG4gIGFjdGl2ZTogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwb2x5Z29uIHBvaW50cz1cIjMgMTEgMjIgMiAxMyAyMSAxMSAxMyAzIDExXCI+PC9wb2x5Z29uPjwvc3ZnPmAsXG4gIGhpZGU6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTE3Ljk0IDE3Ljk0QTEwLjA3IDEwLjA3IDAgMCAxIDEyIDIwYy03IDAtMTEtOC0xMS04YTE4LjQ1IDE4LjQ1IDAgMCAxIDUuMDYtNS45NE05LjkgNC4yNEE5LjEyIDkuMTIgMCAwIDEgMTIgNGM3IDAgMTEgOCAxMSA4YTE4LjUgMTguNSAwIDAgMS0yLjE2IDMuMTltLTYuNzItMS4wN2EzIDMgMCAxIDEtNC4yNC00LjI0XCI+PC9wYXRoPjxsaW5lIHgxPVwiMVwiIHkxPVwiMVwiIHgyPVwiMjNcIiB5Mj1cIjIzXCI+PC9saW5lPjwvc3ZnPmAsXG4gIHNob3c6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTEgMTJzNC04IDExLTggMTEgOCAxMSA4LTQgOC0xMSA4LTExLTgtMTEtOC0xMS04elwiPjwvcGF0aD48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjNcIj48L2NpcmNsZT48L3N2Zz5gLFxuICBmb2N1czogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiMTBcIj48L2NpcmNsZT48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjZcIj48L2NpcmNsZT48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjJcIj48L2NpcmNsZT48L3N2Zz5gLFxuICBjbG9zZTogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxsaW5lIHgxPVwiMThcIiB5MT1cIjZcIiB4Mj1cIjZcIiB5Mj1cIjE4XCI+PC9saW5lPjxsaW5lIHgxPVwiNlwiIHkxPVwiNlwiIHgyPVwiMThcIiB5Mj1cIjE4XCI+PC9saW5lPjwvc3ZnPmAsXG4gIHVuZ3JvdXA6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjEwXCI+PC9jaXJjbGU+PGxpbmUgeDE9XCI4XCIgeTE9XCIxMlwiIHgyPVwiMTZcIiB5Mj1cIjEyXCI+PC9saW5lPjwvc3ZnPmAsXG4gIGRlZmF1bHRGaWxlOiBgPHN2ZyB3aWR0aD1cIjI0XCIgaGVpZ2h0PVwiMjRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0xNCAySDZhMiAyIDAgMCAwLTIgMnYxNmEyIDIgMCAwIDAgMiAyaDEyYTIgMiAwIDAgMCAyLTJWOHpcIj48L3BhdGg+PHBvbHlsaW5lIHBvaW50cz1cIjE0IDIgMTQgOCAyMCA4XCI+PC9wb2x5bGluZT48bGluZSB4MT1cIjE2XCIgeTE9XCIxM1wiIHgyPVwiOFwiIHkyPVwiMTNcIj48L2xpbmU+PGxpbmUgeDE9XCIxNlwiIHkxPVwiMTdcIiB4Mj1cIjhcIiB5Mj1cIjE3XCI+PC9saW5lPjxwb2x5bGluZSBwb2ludHM9XCIxMCA5IDkgOSA4IDlcIj48L3BvbHlsaW5lPjwvc3ZnPmAsXG4gIGF1dG9SdW46IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cG9seWdvbiBwb2ludHM9XCIxMyAyIDMgMTQgMTIgMTQgMTEgMjIgMjEgMTAgMTIgMTAgMTMgMlwiPjwvcG9seWdvbj48L3N2Zz5gXG59O1xuXG5leHBvcnQgY29uc3QgR1JPVVBfQ09MT1JTOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICBncmV5OiBcIiM2NDc0OGJcIixcbiAgYmx1ZTogXCIjM2I4MmY2XCIsXG4gIHJlZDogXCIjZWY0NDQ0XCIsXG4gIHllbGxvdzogXCIjZWFiMzA4XCIsXG4gIGdyZWVuOiBcIiMyMmM1NWVcIixcbiAgcGluazogXCIjZWM0ODk5XCIsXG4gIHB1cnBsZTogXCIjYTg1NWY3XCIsXG4gIGN5YW46IFwiIzA2YjZkNFwiLFxuICBvcmFuZ2U6IFwiI2Y5NzMxNlwiXG59O1xuXG5leHBvcnQgY29uc3QgZ2V0R3JvdXBDb2xvciA9IChuYW1lOiBzdHJpbmcpID0+IEdST1VQX0NPTE9SU1tuYW1lXSB8fCBcIiNjYmQ1ZTFcIjtcblxuZXhwb3J0IGNvbnN0IGZldGNoU3RhdGUgPSBhc3luYyAoKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBzZW5kTWVzc2FnZTx7IGdyb3VwczogVGFiR3JvdXBbXTsgcHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzIH0+KFwiZ2V0U3RhdGVcIik7XG4gICAgaWYgKHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICB9XG4gICAgY29uc29sZS53YXJuKFwiZmV0Y2hTdGF0ZSBmYWlsZWQsIHVzaW5nIGZhbGxiYWNrOlwiLCByZXNwb25zZS5lcnJvcik7XG4gICAgcmV0dXJuIGF3YWl0IGZldGNoTG9jYWxTdGF0ZSgpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS53YXJuKFwiZmV0Y2hTdGF0ZSB0aHJldyBleGNlcHRpb24sIHVzaW5nIGZhbGxiYWNrOlwiLCBlKTtcbiAgICByZXR1cm4gYXdhaXQgZmV0Y2hMb2NhbFN0YXRlKCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBhcHBseUdyb3VwaW5nID0gYXN5bmMgKHBheWxvYWQ6IEFwcGx5R3JvdXBpbmdQYXlsb2FkKSA9PiB7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFwcGx5R3JvdXBpbmdcIiwgcGF5bG9hZCB9KTtcbiAgcmV0dXJuIHJlc3BvbnNlIGFzIFJ1bnRpbWVSZXNwb25zZTx1bmtub3duPjtcbn07XG5cbmV4cG9ydCBjb25zdCBhcHBseVNvcnRpbmcgPSBhc3luYyAocGF5bG9hZDogQXBwbHlHcm91cGluZ1BheWxvYWQpID0+IHtcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiYXBwbHlTb3J0aW5nXCIsIHBheWxvYWQgfSk7XG4gIHJldHVybiByZXNwb25zZSBhcyBSdW50aW1lUmVzcG9uc2U8dW5rbm93bj47XG59O1xuXG5leHBvcnQgY29uc3QgbWFwV2luZG93cyA9IChncm91cHM6IFRhYkdyb3VwW10sIHdpbmRvd1RpdGxlczogTWFwPG51bWJlciwgc3RyaW5nPik6IFdpbmRvd1ZpZXdbXSA9PiB7XG4gIGNvbnN0IHdpbmRvd3MgPSBuZXcgTWFwPG51bWJlciwgVGFiV2l0aEdyb3VwW10+KCk7XG5cbiAgZ3JvdXBzLmZvckVhY2goKGdyb3VwKSA9PiB7XG4gICAgY29uc3QgaXNVbmdyb3VwZWQgPSBncm91cC5yZWFzb24gPT09IFwiVW5ncm91cGVkXCI7XG4gICAgZ3JvdXAudGFicy5mb3JFYWNoKCh0YWIpID0+IHtcbiAgICAgIGNvbnN0IGRlY29yYXRlZDogVGFiV2l0aEdyb3VwID0ge1xuICAgICAgICAuLi50YWIsXG4gICAgICAgIGdyb3VwTGFiZWw6IGlzVW5ncm91cGVkID8gdW5kZWZpbmVkIDogZ3JvdXAubGFiZWwsXG4gICAgICAgIGdyb3VwQ29sb3I6IGlzVW5ncm91cGVkID8gdW5kZWZpbmVkIDogZ3JvdXAuY29sb3IsXG4gICAgICAgIHJlYXNvbjogZ3JvdXAucmVhc29uXG4gICAgICB9O1xuICAgICAgY29uc3QgZXhpc3RpbmcgPSB3aW5kb3dzLmdldCh0YWIud2luZG93SWQpID8/IFtdO1xuICAgICAgZXhpc3RpbmcucHVzaChkZWNvcmF0ZWQpO1xuICAgICAgd2luZG93cy5zZXQodGFiLndpbmRvd0lkLCBleGlzdGluZyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIHJldHVybiBBcnJheS5mcm9tKHdpbmRvd3MuZW50cmllcygpKVxuICAgIC5tYXA8V2luZG93Vmlldz4oKFtpZCwgdGFic10pID0+IHtcbiAgICAgIGNvbnN0IGdyb3VwQ291bnQgPSBuZXcgU2V0KHRhYnMubWFwKCh0YWIpID0+IHRhYi5ncm91cExhYmVsKS5maWx0ZXIoKGwpOiBsIGlzIHN0cmluZyA9PiAhIWwpKS5zaXplO1xuICAgICAgY29uc3QgcGlubmVkQ291bnQgPSB0YWJzLmZpbHRlcigodGFiKSA9PiB0YWIucGlubmVkKS5sZW5ndGg7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBpZCxcbiAgICAgICAgdGl0bGU6IHdpbmRvd1RpdGxlcy5nZXQoaWQpID8/IGBXaW5kb3cgJHtpZH1gLFxuICAgICAgICB0YWJzLFxuICAgICAgICB0YWJDb3VudDogdGFicy5sZW5ndGgsXG4gICAgICAgIGdyb3VwQ291bnQsXG4gICAgICAgIHBpbm5lZENvdW50XG4gICAgICB9O1xuICAgIH0pXG4gICAgLnNvcnQoKGEsIGIpID0+IGEuaWQgLSBiLmlkKTtcbn07XG5cbmV4cG9ydCBjb25zdCBmb3JtYXREb21haW4gPSAodXJsOiBzdHJpbmcpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XG4gICAgcmV0dXJuIHBhcnNlZC5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgcmV0dXJuIHVybDtcbiAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldERyYWdBZnRlckVsZW1lbnQoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgeTogbnVtYmVyLCBzZWxlY3Rvcjogc3RyaW5nKSB7XG4gIGNvbnN0IGRyYWdnYWJsZUVsZW1lbnRzID0gQXJyYXkuZnJvbShjb250YWluZXIucXVlcnlTZWxlY3RvckFsbChzZWxlY3RvcikpO1xuXG4gIHJldHVybiBkcmFnZ2FibGVFbGVtZW50cy5yZWR1Y2UoKGNsb3Nlc3QsIGNoaWxkKSA9PiB7XG4gICAgY29uc3QgYm94ID0gY2hpbGQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgY29uc3Qgb2Zmc2V0ID0geSAtIGJveC50b3AgLSBib3guaGVpZ2h0IC8gMjtcbiAgICBpZiAob2Zmc2V0IDwgMCAmJiBvZmZzZXQgPiBjbG9zZXN0Lm9mZnNldCkge1xuICAgICAgcmV0dXJuIHsgb2Zmc2V0OiBvZmZzZXQsIGVsZW1lbnQ6IGNoaWxkIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBjbG9zZXN0O1xuICAgIH1cbiAgfSwgeyBvZmZzZXQ6IE51bWJlci5ORUdBVElWRV9JTkZJTklUWSwgZWxlbWVudDogbnVsbCBhcyBFbGVtZW50IHwgbnVsbCB9KS5lbGVtZW50O1xufVxuIiwgImltcG9ydCB7IGFuYWx5emVUYWJDb250ZXh0LCBDb250ZXh0UmVzdWx0IH0gZnJvbSBcIi4uL2JhY2tncm91bmQvY29udGV4dEFuYWx5c2lzLmpzXCI7XG5pbXBvcnQge1xuICBncm91cFRhYnMsXG4gIGRvbWFpbkZyb21VcmwsXG4gIHNlbWFudGljQnVja2V0LFxuICBuYXZpZ2F0aW9uS2V5LFxuICBncm91cGluZ0tleVxufSBmcm9tIFwiLi4vYmFja2dyb3VuZC9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IEdFTkVSQV9SRUdJU1RSWSB9IGZyb20gXCIuLi9iYWNrZ3JvdW5kL2V4dHJhY3Rpb24vZ2VuZXJhUmVnaXN0cnkuanNcIjtcbmltcG9ydCB7XG4gIHNvcnRUYWJzLFxuICByZWNlbmN5U2NvcmUsXG4gIGhpZXJhcmNoeVNjb3JlLFxuICBwaW5uZWRTY29yZSxcbiAgY29tcGFyZUJ5XG59IGZyb20gXCIuLi9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBtYXBDaHJvbWVUYWIsIGVzY2FwZUh0bWwgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5pbXBvcnQgeyBnZXREcmFnQWZ0ZXJFbGVtZW50IH0gZnJvbSBcIi4vY29tbW9uLmpzXCI7XG5pbXBvcnQgeyBzZXRDdXN0b21TdHJhdGVnaWVzIH0gZnJvbSBcIi4uL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBHcm91cGluZ1N0cmF0ZWd5LCBQcmVmZXJlbmNlcywgU29ydGluZ1N0cmF0ZWd5LCBUYWJNZXRhZGF0YSwgVGFiR3JvdXAsIEN1c3RvbVN0cmF0ZWd5LCBTdHJhdGVneVJ1bGUsIFJ1bGVDb25kaXRpb24sIEdyb3VwaW5nUnVsZSwgU29ydGluZ1J1bGUsIExvZ0VudHJ5LCBMb2dMZXZlbCB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IFNUUkFURUdJRVMsIFN0cmF0ZWd5RGVmaW5pdGlvbiwgZ2V0U3RyYXRlZ2llcyB9IGZyb20gXCIuLi9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgbG9nSW5mbyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5cbi8vIFR5cGVzXG5pbnRlcmZhY2UgQ29sdW1uRGVmaW5pdGlvbiB7XG4gICAga2V5OiBzdHJpbmc7XG4gICAgbGFiZWw6IHN0cmluZztcbiAgICB2aXNpYmxlOiBib29sZWFuO1xuICAgIHdpZHRoOiBzdHJpbmc7IC8vIENTUyB3aWR0aFxuICAgIGZpbHRlcmFibGU6IGJvb2xlYW47XG59XG5cbi8vIFN0YXRlXG5sZXQgY3VycmVudFRhYnM6IGNocm9tZS50YWJzLlRhYltdID0gW107XG5sZXQgbG9jYWxDdXN0b21TdHJhdGVnaWVzOiBDdXN0b21TdHJhdGVneVtdID0gW107XG5sZXQgY3VycmVudENvbnRleHRNYXAgPSBuZXcgTWFwPG51bWJlciwgQ29udGV4dFJlc3VsdD4oKTtcbmxldCB0YWJUaXRsZXMgPSBuZXcgTWFwPG51bWJlciwgc3RyaW5nPigpO1xubGV0IHNvcnRLZXk6IHN0cmluZyB8IG51bGwgPSBudWxsO1xubGV0IHNvcnREaXJlY3Rpb246ICdhc2MnIHwgJ2Rlc2MnID0gJ2FzYyc7XG5sZXQgc2ltdWxhdGVkU2VsZWN0aW9uID0gbmV3IFNldDxudW1iZXI+KCk7XG5cbi8vIE1vZGVybiBUYWJsZSBTdGF0ZVxubGV0IGdsb2JhbFNlYXJjaFF1ZXJ5ID0gJyc7XG5sZXQgY29sdW1uRmlsdGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xubGV0IGNvbHVtbnM6IENvbHVtbkRlZmluaXRpb25bXSA9IFtcbiAgICB7IGtleTogJ2lkJywgbGFiZWw6ICdJRCcsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnNjBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ2luZGV4JywgbGFiZWw6ICdJbmRleCcsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnNjBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ3dpbmRvd0lkJywgbGFiZWw6ICdXaW5kb3cnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzcwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICdncm91cElkJywgbGFiZWw6ICdHcm91cCcsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnNzBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ3RpdGxlJywgbGFiZWw6ICdUaXRsZScsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnMjAwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICd1cmwnLCBsYWJlbDogJ1VSTCcsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnMjUwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICdnZW5yZScsIGxhYmVsOiAnR2VucmUnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnY29udGV4dCcsIGxhYmVsOiAnQ2F0ZWdvcnknLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnc2l0ZU5hbWUnLCBsYWJlbDogJ1NpdGUgTmFtZScsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnMTIwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICdwbGF0Zm9ybScsIGxhYmVsOiAnUGxhdGZvcm0nLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnb2JqZWN0VHlwZScsIGxhYmVsOiAnT2JqZWN0IFR5cGUnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnZXh0cmFjdGVkVGl0bGUnLCBsYWJlbDogJ0V4dHJhY3RlZCBUaXRsZScsIHZpc2libGU6IGZhbHNlLCB3aWR0aDogJzIwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnYXV0aG9yT3JDcmVhdG9yJywgbGFiZWw6ICdBdXRob3InLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEyMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAncHVibGlzaGVkQXQnLCBsYWJlbDogJ1B1Ymxpc2hlZCcsIHZpc2libGU6IGZhbHNlLCB3aWR0aDogJzEwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnc3RhdHVzJywgbGFiZWw6ICdTdGF0dXMnLCB2aXNpYmxlOiBmYWxzZSwgd2lkdGg6ICc4MHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnYWN0aXZlJywgbGFiZWw6ICdBY3RpdmUnLCB2aXNpYmxlOiBmYWxzZSwgd2lkdGg6ICc2MHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAncGlubmVkJywgbGFiZWw6ICdQaW5uZWQnLCB2aXNpYmxlOiBmYWxzZSwgd2lkdGg6ICc2MHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnb3BlbmVyVGFiSWQnLCBsYWJlbDogJ09wZW5lcicsIHZpc2libGU6IGZhbHNlLCB3aWR0aDogJzcwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICdwYXJlbnRUaXRsZScsIGxhYmVsOiAnUGFyZW50IFRpdGxlJywgdmlzaWJsZTogZmFsc2UsIHdpZHRoOiAnMTUwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICdnZW5yZScsIGxhYmVsOiAnR2VucmUnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnY29udGV4dCcsIGxhYmVsOiAnRXh0cmFjdGVkIENvbnRleHQnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzQwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnbGFzdEFjY2Vzc2VkJywgbGFiZWw6ICdMYXN0IEFjY2Vzc2VkJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxNTBweCcsIGZpbHRlcmFibGU6IGZhbHNlIH0sXG4gICAgeyBrZXk6ICdhY3Rpb25zJywgbGFiZWw6ICdBY3Rpb25zJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMjBweCcsIGZpbHRlcmFibGU6IGZhbHNlIH1cbl07XG5cblxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIGFzeW5jICgpID0+IHtcbiAgY29uc3QgcmVmcmVzaEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZWZyZXNoQnRuJyk7XG4gIGlmIChyZWZyZXNoQnRuKSB7XG4gICAgcmVmcmVzaEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGxvYWRUYWJzKTtcbiAgfVxuXG4gIC8vIFRhYiBTd2l0Y2hpbmcgTG9naWNcbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnRhYi1idG4nKS5mb3JFYWNoKGJ0biA9PiB7XG4gICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgLy8gUmVtb3ZlIGFjdGl2ZSBjbGFzcyBmcm9tIGFsbCBidXR0b25zIGFuZCBzZWN0aW9uc1xuICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnRhYi1idG4nKS5mb3JFYWNoKGIgPT4gYi5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKSk7XG4gICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcudmlldy1zZWN0aW9uJykuZm9yRWFjaChzID0+IHMuY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJykpO1xuXG4gICAgICAvLyBBZGQgYWN0aXZlIGNsYXNzIHRvIGNsaWNrZWQgYnV0dG9uXG4gICAgICBidG4uY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG5cbiAgICAgIC8vIFNob3cgdGFyZ2V0IHNlY3Rpb25cbiAgICAgIGNvbnN0IHRhcmdldElkID0gKGJ0biBhcyBIVE1MRWxlbWVudCkuZGF0YXNldC50YXJnZXQ7XG4gICAgICBpZiAodGFyZ2V0SWQpIHtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQodGFyZ2V0SWQpPy5jbGFzc0xpc3QuYWRkKCdhY3RpdmUnKTtcbiAgICAgICAgbG9nSW5mbyhcIlN3aXRjaGVkIHZpZXdcIiwgeyB0YXJnZXRJZCB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gSWYgc3dpdGNoaW5nIHRvIGFsZ29yaXRobXMsIHBvcHVsYXRlIHJlZmVyZW5jZSBpZiBlbXB0eVxuICAgICAgaWYgKHRhcmdldElkID09PSAndmlldy1hbGdvcml0aG1zJykge1xuICAgICAgICAgcmVuZGVyQWxnb3JpdGhtc1ZpZXcoKTtcbiAgICAgIH0gZWxzZSBpZiAodGFyZ2V0SWQgPT09ICd2aWV3LXN0cmF0ZWd5LWxpc3QnKSB7XG4gICAgICAgICByZW5kZXJTdHJhdGVneUxpc3RUYWJsZSgpO1xuICAgICAgfSBlbHNlIGlmICh0YXJnZXRJZCA9PT0gJ3ZpZXctbG9ncycpIHtcbiAgICAgICAgIGxvYWRMb2dzKCk7XG4gICAgICAgICBsb2FkR2xvYmFsTG9nTGV2ZWwoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG5cbiAgLy8gTG9nIFZpZXdlciBMb2dpY1xuICBjb25zdCByZWZyZXNoTG9nc0J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZWZyZXNoLWxvZ3MtYnRuJyk7XG4gIGlmIChyZWZyZXNoTG9nc0J0bikgcmVmcmVzaExvZ3NCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBsb2FkTG9ncyk7XG5cbiAgY29uc3QgY2xlYXJMb2dzQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NsZWFyLWxvZ3MtYnRuJyk7XG4gIGlmIChjbGVhckxvZ3NCdG4pIGNsZWFyTG9nc0J0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGNsZWFyUmVtb3RlTG9ncyk7XG5cbiAgY29uc3QgbG9nTGV2ZWxGaWx0ZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9nLWxldmVsLWZpbHRlcicpO1xuICBpZiAobG9nTGV2ZWxGaWx0ZXIpIGxvZ0xldmVsRmlsdGVyLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHJlbmRlckxvZ3MpO1xuXG4gIGNvbnN0IGxvZ1NlYXJjaCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2ctc2VhcmNoJyk7XG4gIGlmIChsb2dTZWFyY2gpIGxvZ1NlYXJjaC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIHJlbmRlckxvZ3MpO1xuXG4gIGNvbnN0IGdsb2JhbExvZ0xldmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dsb2JhbC1sb2ctbGV2ZWwnKTtcbiAgaWYgKGdsb2JhbExvZ0xldmVsKSBnbG9iYWxMb2dMZXZlbC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB1cGRhdGVHbG9iYWxMb2dMZXZlbCk7XG5cbiAgLy8gU2ltdWxhdGlvbiBMb2dpY1xuICBjb25zdCBydW5TaW1CdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncnVuU2ltQnRuJyk7XG4gIGlmIChydW5TaW1CdG4pIHtcbiAgICBydW5TaW1CdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBydW5TaW11bGF0aW9uKTtcbiAgfVxuXG4gIGNvbnN0IGFwcGx5QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FwcGx5QnRuJyk7XG4gIGlmIChhcHBseUJ0bikge1xuICAgIGFwcGx5QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgYXBwbHlUb0Jyb3dzZXIpO1xuICB9XG5cbiAgLy8gTW9kZXJuIFRhYmxlIENvbnRyb2xzXG4gIGNvbnN0IGdsb2JhbFNlYXJjaElucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dsb2JhbFNlYXJjaCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gIGlmIChnbG9iYWxTZWFyY2hJbnB1dCkge1xuICAgICAgZ2xvYmFsU2VhcmNoSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCAoZSkgPT4ge1xuICAgICAgICAgIGdsb2JhbFNlYXJjaFF1ZXJ5ID0gKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgIHJlbmRlclRhYmxlKCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IGNvbHVtbnNCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY29sdW1uc0J0bicpO1xuICBpZiAoY29sdW1uc0J0bikge1xuICAgICAgY29sdW1uc0J0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICBjb25zdCBtZW51ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvbHVtbnNNZW51Jyk7XG4gICAgICAgICAgbWVudT8uY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJyk7XG4gICAgICAgICAgcmVuZGVyQ29sdW1uc01lbnUoKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY29uc3QgcmVzZXRWaWV3QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Jlc2V0Vmlld0J0bicpO1xuICBpZiAocmVzZXRWaWV3QnRuKSB7XG4gICAgICByZXNldFZpZXdCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgLy8gUmVzZXQgY29sdW1ucyB0byBkZWZhdWx0cyAoc2ltcGxpZmllZCwganVzdCBzaG93IGFsbCByZWFzb25hYmxlIG9uZXMpXG4gICAgICAgICAgICBjb2x1bW5zLmZvckVhY2goYyA9PiBjLnZpc2libGUgPSBbJ2lkJywgJ3RpdGxlJywgJ3VybCcsICd3aW5kb3dJZCcsICdncm91cElkJywgJ2dlbnJlJywgJ2NvbnRleHQnLCAnc2l0ZU5hbWUnLCAncGxhdGZvcm0nLCAnb2JqZWN0VHlwZScsICdhdXRob3JPckNyZWF0b3InLCAnYWN0aW9ucyddLmluY2x1ZGVzKGMua2V5KSk7XG4gICAgICAgICAgZ2xvYmFsU2VhcmNoUXVlcnkgPSAnJztcbiAgICAgICAgICBpZiAoZ2xvYmFsU2VhcmNoSW5wdXQpIGdsb2JhbFNlYXJjaElucHV0LnZhbHVlID0gJyc7XG4gICAgICAgICAgY29sdW1uRmlsdGVycyA9IHt9O1xuICAgICAgICAgIHJlbmRlclRhYmxlSGVhZGVyKCk7XG4gICAgICAgICAgcmVuZGVyVGFibGUoKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gSGlkZSBjb2x1bW4gbWVudSB3aGVuIGNsaWNraW5nIG91dHNpZGVcbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICBpZiAoIXRhcmdldC5jbG9zZXN0KCcuY29sdW1ucy1tZW51LWNvbnRhaW5lcicpKSB7XG4gICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvbHVtbnNNZW51Jyk/LmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xuICAgICAgfVxuICB9KTtcblxuXG4gIC8vIExpc3RlbiBmb3IgdGFiIHVwZGF0ZXMgdG8gcmVmcmVzaCBkYXRhIChTUEEgc3VwcG9ydClcbiAgY2hyb21lLnRhYnMub25VcGRhdGVkLmFkZExpc3RlbmVyKCh0YWJJZCwgY2hhbmdlSW5mbywgdGFiKSA9PiB7XG4gICAgLy8gV2UgdXBkYXRlIGlmIFVSTCBjaGFuZ2VzIG9yIHN0YXR1cyBjaGFuZ2VzIHRvIGNvbXBsZXRlXG4gICAgaWYgKGNoYW5nZUluZm8udXJsIHx8IGNoYW5nZUluZm8uc3RhdHVzID09PSAnY29tcGxldGUnKSB7XG4gICAgICAgIGxvYWRUYWJzKCk7XG4gICAgfVxuICB9KTtcblxuICAvLyBMaXN0ZW4gZm9yIHRhYiByZW1vdmFscyB0byByZWZyZXNoIGRhdGFcbiAgY2hyb21lLnRhYnMub25SZW1vdmVkLmFkZExpc3RlbmVyKCgpID0+IHtcbiAgICBsb2FkVGFicygpO1xuICB9KTtcblxuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChldmVudCkgPT4ge1xuICAgIGNvbnN0IHRhcmdldCA9IGV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgaWYgKCF0YXJnZXQpIHJldHVybjtcblxuICAgIGlmICh0YXJnZXQubWF0Y2hlcygnLmNvbnRleHQtanNvbi1idG4nKSkge1xuICAgICAgY29uc3QgdGFiSWQgPSBOdW1iZXIodGFyZ2V0LmRhdGFzZXQudGFiSWQpO1xuICAgICAgaWYgKCF0YWJJZCkgcmV0dXJuO1xuICAgICAgY29uc3QgZGF0YSA9IGN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWJJZCk/LmRhdGE7XG4gICAgICBpZiAoIWRhdGEpIHJldHVybjtcbiAgICAgIGNvbnN0IGpzb24gPSBKU09OLnN0cmluZ2lmeShkYXRhLCBudWxsLCAyKTtcbiAgICAgIGNvbnN0IGh0bWxDb250ZW50ID0gYFxuICAgICAgICA8IURPQ1RZUEUgaHRtbD5cbiAgICAgICAgPGh0bWw+XG4gICAgICAgIDxoZWFkPlxuICAgICAgICAgIDx0aXRsZT5KU09OIFZpZXc8L3RpdGxlPlxuICAgICAgICAgIDxzdHlsZT5cbiAgICAgICAgICAgIGJvZHkgeyBmb250LWZhbWlseTogbW9ub3NwYWNlOyBiYWNrZ3JvdW5kLWNvbG9yOiAjZjBmMGYwOyBwYWRkaW5nOiAyMHB4OyB9XG4gICAgICAgICAgICBwcmUgeyBiYWNrZ3JvdW5kLWNvbG9yOiB3aGl0ZTsgcGFkZGluZzogMTVweDsgYm9yZGVyLXJhZGl1czogNXB4OyBib3JkZXI6IDFweCBzb2xpZCAjY2NjOyBvdmVyZmxvdzogYXV0bzsgfVxuICAgICAgICAgIDwvc3R5bGU+XG4gICAgICAgIDwvaGVhZD5cbiAgICAgICAgPGJvZHk+XG4gICAgICAgICAgPGgzPkpTT04gRGF0YTwvaDM+XG4gICAgICAgICAgPHByZT4ke2VzY2FwZUh0bWwoanNvbil9PC9wcmU+XG4gICAgICAgIDwvYm9keT5cbiAgICAgICAgPC9odG1sPlxuICAgICAgYDtcbiAgICAgIGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbaHRtbENvbnRlbnRdLCB7IHR5cGU6ICd0ZXh0L2h0bWwnIH0pO1xuICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICAgIHdpbmRvdy5vcGVuKHVybCwgJ19ibGFuaycsICdub29wZW5lcixub3JlZmVycmVyJyk7XG4gICAgfSBlbHNlIGlmICh0YXJnZXQubWF0Y2hlcygnLmdvdG8tdGFiLWJ0bicpKSB7XG4gICAgICBjb25zdCB0YWJJZCA9IE51bWJlcih0YXJnZXQuZGF0YXNldC50YWJJZCk7XG4gICAgICBjb25zdCB3aW5kb3dJZCA9IE51bWJlcih0YXJnZXQuZGF0YXNldC53aW5kb3dJZCk7XG4gICAgICBpZiAodGFiSWQgJiYgd2luZG93SWQpIHtcbiAgICAgICAgY2hyb21lLnRhYnMudXBkYXRlKHRhYklkLCB7IGFjdGl2ZTogdHJ1ZSB9KTtcbiAgICAgICAgY2hyb21lLndpbmRvd3MudXBkYXRlKHdpbmRvd0lkLCB7IGZvY3VzZWQ6IHRydWUgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0YXJnZXQubWF0Y2hlcygnLmNsb3NlLXRhYi1idG4nKSkge1xuICAgICAgY29uc3QgdGFiSWQgPSBOdW1iZXIodGFyZ2V0LmRhdGFzZXQudGFiSWQpO1xuICAgICAgaWYgKHRhYklkKSB7XG4gICAgICAgIGNocm9tZS50YWJzLnJlbW92ZSh0YWJJZCk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0YXJnZXQubWF0Y2hlcygnLnN0cmF0ZWd5LXZpZXctYnRuJykpIHtcbiAgICAgICAgY29uc3QgdHlwZSA9IHRhcmdldC5kYXRhc2V0LnR5cGU7XG4gICAgICAgIGNvbnN0IG5hbWUgPSB0YXJnZXQuZGF0YXNldC5uYW1lO1xuICAgICAgICBpZiAodHlwZSAmJiBuYW1lKSB7XG4gICAgICAgICAgICBzaG93U3RyYXRlZ3lEZXRhaWxzKHR5cGUsIG5hbWUpO1xuICAgICAgICB9XG4gICAgfVxuICB9KTtcblxuICAvLyBJbml0IHRhYmxlIGhlYWRlclxuICByZW5kZXJUYWJsZUhlYWRlcigpO1xuXG4gIGxvYWRUYWJzKCk7XG4gIC8vIFByZS1yZW5kZXIgc3RhdGljIGNvbnRlbnRcbiAgYXdhaXQgbG9hZFByZWZlcmVuY2VzQW5kSW5pdCgpOyAvLyBMb2FkIHByZWZlcmVuY2VzIGZpcnN0IHRvIGluaXQgc3RyYXRlZ2llc1xuICByZW5kZXJBbGdvcml0aG1zVmlldygpO1xuICBsb2FkQ3VzdG9tR2VuZXJhKCk7XG4gIGluaXRTdHJhdGVneUJ1aWxkZXIoKTtcblxuICBjb25zdCBleHBvcnRBbGxCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXRlZ3ktbGlzdC1leHBvcnQtYnRuJyk7XG4gIGNvbnN0IGltcG9ydEFsbEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdGVneS1saXN0LWltcG9ydC1idG4nKTtcbiAgaWYgKGV4cG9ydEFsbEJ0bikgZXhwb3J0QWxsQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZXhwb3J0QWxsU3RyYXRlZ2llcyk7XG4gIGlmIChpbXBvcnRBbGxCdG4pIGltcG9ydEFsbEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGltcG9ydEFsbFN0cmF0ZWdpZXMpO1xufSk7XG5cbi8vIENvbHVtbiBNYW5hZ2VtZW50XG5cbmZ1bmN0aW9uIHJlbmRlckNvbHVtbnNNZW51KCkge1xuICAgIGNvbnN0IG1lbnUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY29sdW1uc01lbnUnKTtcbiAgICBpZiAoIW1lbnUpIHJldHVybjtcblxuICAgIG1lbnUuaW5uZXJIVE1MID0gY29sdW1ucy5tYXAoY29sID0+IGBcbiAgICAgICAgPGxhYmVsIGNsYXNzPVwiY29sdW1uLXRvZ2dsZVwiPlxuICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGRhdGEta2V5PVwiJHtjb2wua2V5fVwiICR7Y29sLnZpc2libGUgPyAnY2hlY2tlZCcgOiAnJ30+XG4gICAgICAgICAgICAke2VzY2FwZUh0bWwoY29sLmxhYmVsKX1cbiAgICAgICAgPC9sYWJlbD5cbiAgICBgKS5qb2luKCcnKTtcblxuICAgIG1lbnUucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQnKS5mb3JFYWNoKGlucHV0ID0+IHtcbiAgICAgICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKGUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS5kYXRhc2V0LmtleTtcbiAgICAgICAgICAgIGNvbnN0IGNoZWNrZWQgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZDtcbiAgICAgICAgICAgIGNvbnN0IGNvbCA9IGNvbHVtbnMuZmluZChjID0+IGMua2V5ID09PSBrZXkpO1xuICAgICAgICAgICAgaWYgKGNvbCkge1xuICAgICAgICAgICAgICAgIGNvbC52aXNpYmxlID0gY2hlY2tlZDtcbiAgICAgICAgICAgICAgICByZW5kZXJUYWJsZUhlYWRlcigpOyAvLyBSZS1yZW5kZXIgaGVhZGVyIHRvIGFkZC9yZW1vdmUgY29sdW1uc1xuICAgICAgICAgICAgICAgIHJlbmRlclRhYmxlKCk7IC8vIFJlLXJlbmRlciBib2R5XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiByZW5kZXJUYWJsZUhlYWRlcigpIHtcbiAgICBjb25zdCBoZWFkZXJSb3cgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaGVhZGVyUm93Jyk7XG4gICAgY29uc3QgZmlsdGVyUm93ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2ZpbHRlclJvdycpO1xuICAgIGlmICghaGVhZGVyUm93IHx8ICFmaWx0ZXJSb3cpIHJldHVybjtcblxuICAgIGNvbnN0IHZpc2libGVDb2xzID0gY29sdW1ucy5maWx0ZXIoYyA9PiBjLnZpc2libGUpO1xuXG4gICAgLy8gUmVuZGVyIEhlYWRlcnNcbiAgICBoZWFkZXJSb3cuaW5uZXJIVE1MID0gdmlzaWJsZUNvbHMubWFwKGNvbCA9PiBgXG4gICAgICAgIDx0aCBjbGFzcz1cIiR7Y29sLmtleSAhPT0gJ2FjdGlvbnMnID8gJ3NvcnRhYmxlJyA6ICcnfVwiIGRhdGEta2V5PVwiJHtjb2wua2V5fVwiIHN0eWxlPVwid2lkdGg6ICR7Y29sLndpZHRofTsgcG9zaXRpb246IHJlbGF0aXZlO1wiPlxuICAgICAgICAgICAgJHtlc2NhcGVIdG1sKGNvbC5sYWJlbCl9XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwicmVzaXplclwiPjwvZGl2PlxuICAgICAgICA8L3RoPlxuICAgIGApLmpvaW4oJycpO1xuXG4gICAgLy8gUmVuZGVyIEZpbHRlciBJbnB1dHNcbiAgICBmaWx0ZXJSb3cuaW5uZXJIVE1MID0gdmlzaWJsZUNvbHMubWFwKGNvbCA9PiB7XG4gICAgICAgIGlmICghY29sLmZpbHRlcmFibGUpIHJldHVybiAnPHRoPjwvdGg+JztcbiAgICAgICAgY29uc3QgdmFsID0gY29sdW1uRmlsdGVyc1tjb2wua2V5XSB8fCAnJztcbiAgICAgICAgcmV0dXJuIGBcbiAgICAgICAgICAgIDx0aD5cbiAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cImZpbHRlci1pbnB1dFwiIGRhdGEta2V5PVwiJHtjb2wua2V5fVwiIHZhbHVlPVwiJHtlc2NhcGVIdG1sKHZhbCl9XCIgcGxhY2Vob2xkZXI9XCJGaWx0ZXIuLi5cIj5cbiAgICAgICAgICAgIDwvdGg+XG4gICAgICAgIGA7XG4gICAgfSkuam9pbignJyk7XG5cbiAgICAvLyBBdHRhY2ggU29ydCBMaXN0ZW5lcnNcbiAgICBoZWFkZXJSb3cucXVlcnlTZWxlY3RvckFsbCgnLnNvcnRhYmxlJykuZm9yRWFjaCh0aCA9PiB7XG4gICAgICAgIHRoLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgICAgICAgIC8vIElnbm9yZSBpZiBjbGlja2VkIG9uIHJlc2l6ZXJcbiAgICAgICAgICAgIGlmICgoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmNsYXNzTGlzdC5jb250YWlucygncmVzaXplcicpKSByZXR1cm47XG5cbiAgICAgICAgICAgIGNvbnN0IGtleSA9IHRoLmdldEF0dHJpYnV0ZSgnZGF0YS1rZXknKTtcbiAgICAgICAgICAgIGlmIChrZXkpIGhhbmRsZVNvcnQoa2V5KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAvLyBBdHRhY2ggRmlsdGVyIExpc3RlbmVyc1xuICAgIGZpbHRlclJvdy5xdWVyeVNlbGVjdG9yQWxsKCcuZmlsdGVyLWlucHV0JykuZm9yRWFjaChpbnB1dCA9PiB7XG4gICAgICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgKGUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuZGF0YXNldC5rZXk7XG4gICAgICAgICAgICBjb25zdCB2YWwgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICBpZiAoa2V5KSB7XG4gICAgICAgICAgICAgICAgY29sdW1uRmlsdGVyc1trZXldID0gdmFsO1xuICAgICAgICAgICAgICAgIHJlbmRlclRhYmxlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgLy8gQXR0YWNoIFJlc2l6ZSBMaXN0ZW5lcnNcbiAgICBoZWFkZXJSb3cucXVlcnlTZWxlY3RvckFsbCgnLnJlc2l6ZXInKS5mb3JFYWNoKHJlc2l6ZXIgPT4ge1xuICAgICAgICBpbml0UmVzaXplKHJlc2l6ZXIgYXMgSFRNTEVsZW1lbnQpO1xuICAgIH0pO1xuXG4gICAgdXBkYXRlSGVhZGVyU3R5bGVzKCk7XG59XG5cbmZ1bmN0aW9uIGluaXRSZXNpemUocmVzaXplcjogSFRNTEVsZW1lbnQpIHtcbiAgICBsZXQgeCA9IDA7XG4gICAgbGV0IHcgPSAwO1xuICAgIGxldCB0aDogSFRNTEVsZW1lbnQ7XG5cbiAgICBjb25zdCBtb3VzZURvd25IYW5kbGVyID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgICAgdGggPSByZXNpemVyLnBhcmVudEVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIHggPSBlLmNsaWVudFg7XG4gICAgICAgIHcgPSB0aC5vZmZzZXRXaWR0aDtcblxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCBtb3VzZU1vdmVIYW5kbGVyKTtcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIG1vdXNlVXBIYW5kbGVyKTtcbiAgICAgICAgcmVzaXplci5jbGFzc0xpc3QuYWRkKCdyZXNpemluZycpO1xuICAgIH07XG5cbiAgICBjb25zdCBtb3VzZU1vdmVIYW5kbGVyID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgICAgY29uc3QgZHggPSBlLmNsaWVudFggLSB4O1xuICAgICAgICBjb25zdCBjb2xLZXkgPSB0aC5nZXRBdHRyaWJ1dGUoJ2RhdGEta2V5Jyk7XG4gICAgICAgIGNvbnN0IGNvbCA9IGNvbHVtbnMuZmluZChjID0+IGMua2V5ID09PSBjb2xLZXkpO1xuICAgICAgICBpZiAoY29sKSB7XG4gICAgICAgICAgICBjb25zdCBuZXdXaWR0aCA9IE1hdGgubWF4KDMwLCB3ICsgZHgpOyAvLyBNaW4gd2lkdGggMzBweFxuICAgICAgICAgICAgY29sLndpZHRoID0gYCR7bmV3V2lkdGh9cHhgO1xuICAgICAgICAgICAgdGguc3R5bGUud2lkdGggPSBjb2wud2lkdGg7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgY29uc3QgbW91c2VVcEhhbmRsZXIgPSAoKSA9PiB7XG4gICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIG1vdXNlTW92ZUhhbmRsZXIpO1xuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgbW91c2VVcEhhbmRsZXIpO1xuICAgICAgICByZXNpemVyLmNsYXNzTGlzdC5yZW1vdmUoJ3Jlc2l6aW5nJyk7XG4gICAgfTtcblxuICAgIHJlc2l6ZXIuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgbW91c2VEb3duSGFuZGxlcik7XG59XG5cblxuYXN5bmMgZnVuY3Rpb24gbG9hZFByZWZlcmVuY2VzQW5kSW5pdCgpIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvYWRQcmVmZXJlbmNlcycgfSk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmcyA9IHJlc3BvbnNlLmRhdGEgYXMgUHJlZmVyZW5jZXM7XG4gICAgICAgICAgICBsb2NhbEN1c3RvbVN0cmF0ZWdpZXMgPSBwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdO1xuICAgICAgICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhsb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMb2FkT3B0aW9ucygpO1xuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMaXN0VGFibGUoKTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIHByZWZlcmVuY2VzXCIsIGUpO1xuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gbG9hZEN1c3RvbUdlbmVyYSgpIHtcbiAgICBjb25zdCBsaXN0Q29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2N1c3RvbS1nZW5lcmEtbGlzdCcpO1xuICAgIGlmICghbGlzdENvbnRhaW5lcikgcmV0dXJuO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2FkUHJlZmVyZW5jZXMnIH0pO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgICAgICAgY29uc3QgcHJlZnMgPSByZXNwb25zZS5kYXRhIGFzIFByZWZlcmVuY2VzO1xuICAgICAgICAgICAgcmVuZGVyQ3VzdG9tR2VuZXJhTGlzdChwcmVmcy5jdXN0b21HZW5lcmEgfHwge30pO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgY3VzdG9tIGdlbmVyYVwiLCBlKTtcbiAgICB9XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gU1RSQVRFR1kgQlVJTERFUiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIGdldEJ1aWx0SW5TdHJhdGVneUNvbmZpZyhpZDogc3RyaW5nKTogQ3VzdG9tU3RyYXRlZ3kgfCBudWxsIHtcbiAgICBjb25zdCBiYXNlOiBDdXN0b21TdHJhdGVneSA9IHtcbiAgICAgICAgaWQ6IGlkLFxuICAgICAgICBsYWJlbDogU1RSQVRFR0lFUy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpPy5sYWJlbCB8fCBpZCxcbiAgICAgICAgZmlsdGVyczogW10sXG4gICAgICAgIGdyb3VwaW5nUnVsZXM6IFtdLFxuICAgICAgICBzb3J0aW5nUnVsZXM6IFtdLFxuICAgICAgICBncm91cFNvcnRpbmdSdWxlczogW10sXG4gICAgICAgIGZhbGxiYWNrOiAnTWlzYycsXG4gICAgICAgIHNvcnRHcm91cHM6IGZhbHNlLFxuICAgICAgICBhdXRvUnVuOiBmYWxzZVxuICAgIH07XG5cbiAgICBzd2l0Y2ggKGlkKSB7XG4gICAgICAgIGNhc2UgJ2RvbWFpbic6XG4gICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAnZG9tYWluJywgdHJhbnNmb3JtOiAnc3RyaXBUbGQnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAnZG9tYWluJywgb3JkZXI6ICdhc2MnIH1dO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2RvbWFpbl9mdWxsJzpcbiAgICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAnZG9tYWluJywgdHJhbnNmb3JtOiAnbm9uZScsIGNvbG9yOiAncmFuZG9tJyB9XTtcbiAgICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAnZG9tYWluJywgb3JkZXI6ICdhc2MnIH1dO1xuICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICd0b3BpYyc6XG4gICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAnZ2VucmUnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnY29udGV4dCc6XG4gICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAnY29udGV4dCcsIGNvbG9yOiAncmFuZG9tJyB9XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdsaW5lYWdlJzpcbiAgICAgICAgICAgIGJhc2UuZ3JvdXBpbmdSdWxlcyA9IFt7IHNvdXJjZTogJ2ZpZWxkJywgdmFsdWU6ICdwYXJlbnRUaXRsZScsIGNvbG9yOiAncmFuZG9tJyB9XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdwaW5uZWQnOlxuICAgICAgICAgICAgIGJhc2Uuc29ydGluZ1J1bGVzID0gW3sgZmllbGQ6ICdwaW5uZWQnLCBvcmRlcjogJ2Rlc2MnIH1dO1xuICAgICAgICAgICAgIGJhc2UuZ3JvdXBpbmdSdWxlcyA9IFt7IHNvdXJjZTogJ2ZpZWxkJywgdmFsdWU6ICdwaW5uZWQnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3JlY2VuY3knOlxuICAgICAgICAgICAgYmFzZS5zb3J0aW5nUnVsZXMgPSBbeyBmaWVsZDogJ2xhc3RBY2Nlc3NlZCcsIG9yZGVyOiAnZGVzYycgfV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnYWdlJzpcbiAgICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAnbGFzdEFjY2Vzc2VkJywgb3JkZXI6ICdkZXNjJyB9XTtcbiAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndXJsJzpcbiAgICAgICAgICAgIGJhc2Uuc29ydGluZ1J1bGVzID0gW3sgZmllbGQ6ICd1cmwnLCBvcmRlcjogJ2FzYycgfV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndGl0bGUnOlxuICAgICAgICAgICAgYmFzZS5zb3J0aW5nUnVsZXMgPSBbeyBmaWVsZDogJ3RpdGxlJywgb3JkZXI6ICdhc2MnIH1dO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ25lc3RpbmcnOlxuICAgICAgICAgICAgIGJhc2Uuc29ydGluZ1J1bGVzID0gW3sgZmllbGQ6ICdwYXJlbnRUaXRsZScsIG9yZGVyOiAnYXNjJyB9XTtcbiAgICAgICAgICAgICBicmVhaztcbiAgICB9XG5cbiAgICByZXR1cm4gYmFzZTtcbn1cblxuY29uc3QgRklFTERfT1BUSU9OUyA9IGBcbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwidXJsXCI+VVJMPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInRpdGxlXCI+VGl0bGU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZG9tYWluXCI+RG9tYWluPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInN1YmRvbWFpblwiPlN1YmRvbWFpbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJpZFwiPklEPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImluZGV4XCI+SW5kZXg8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwid2luZG93SWRcIj5XaW5kb3cgSUQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZ3JvdXBJZFwiPkdyb3VwIElEPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImFjdGl2ZVwiPkFjdGl2ZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzZWxlY3RlZFwiPlNlbGVjdGVkPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInBpbm5lZFwiPlBpbm5lZDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzdGF0dXNcIj5TdGF0dXM8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwib3BlbmVyVGFiSWRcIj5PcGVuZXIgSUQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwicGFyZW50VGl0bGVcIj5QYXJlbnQgVGl0bGU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibGFzdEFjY2Vzc2VkXCI+TGFzdCBBY2Nlc3NlZDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJnZW5yZVwiPkdlbnJlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHRcIj5Db250ZXh0IFN1bW1hcnk8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuc2l0ZU5hbWVcIj5TaXRlIE5hbWU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuY2Fub25pY2FsVXJsXCI+Q2Fub25pY2FsIFVSTDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5ub3JtYWxpemVkVXJsXCI+Tm9ybWFsaXplZCBVUkw8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEucGxhdGZvcm1cIj5QbGF0Zm9ybTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5vYmplY3RUeXBlXCI+T2JqZWN0IFR5cGU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEub2JqZWN0SWRcIj5PYmplY3QgSUQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEudGl0bGVcIj5FeHRyYWN0ZWQgVGl0bGU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuZGVzY3JpcHRpb25cIj5EZXNjcmlwdGlvbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5hdXRob3JPckNyZWF0b3JcIj5BdXRob3IvQ3JlYXRvcjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5wdWJsaXNoZWRBdFwiPlB1Ymxpc2hlZCBBdDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5tb2RpZmllZEF0XCI+TW9kaWZpZWQgQXQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEubGFuZ3VhZ2VcIj5MYW5ndWFnZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5pc0F1ZGlibGVcIj5JcyBBdWRpYmxlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLmlzTXV0ZWRcIj5JcyBNdXRlZDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5oYXNVbnNhdmVkQ2hhbmdlc0xpa2VseVwiPlVuc2F2ZWQgQ2hhbmdlczwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5pc0F1dGhlbnRpY2F0ZWRMaWtlbHlcIj5BdXRoZW50aWNhdGVkPC9vcHRpb24+YDtcblxuY29uc3QgT1BFUkFUT1JfT1BUSU9OUyA9IGBcbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGFpbnNcIj5jb250YWluczwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJkb2VzTm90Q29udGFpblwiPmRvZXMgbm90IGNvbnRhaW48L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibWF0Y2hlc1wiPm1hdGNoZXMgcmVnZXg8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZXF1YWxzXCI+ZXF1YWxzPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInN0YXJ0c1dpdGhcIj5zdGFydHMgd2l0aDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJlbmRzV2l0aFwiPmVuZHMgd2l0aDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJleGlzdHNcIj5leGlzdHM8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZG9lc05vdEV4aXN0XCI+ZG9lcyBub3QgZXhpc3Q8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiaXNOdWxsXCI+aXMgbnVsbDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJpc05vdE51bGxcIj5pcyBub3QgbnVsbDwvb3B0aW9uPmA7XG5cbmZ1bmN0aW9uIGluaXRTdHJhdGVneUJ1aWxkZXIoKSB7XG4gICAgY29uc3QgYWRkRmlsdGVyR3JvdXBCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWRkLWZpbHRlci1ncm91cC1idG4nKTtcbiAgICBjb25zdCBhZGRHcm91cEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhZGQtZ3JvdXAtYnRuJyk7XG4gICAgY29uc3QgYWRkU29ydEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhZGQtc29ydC1idG4nKTtcbiAgICBjb25zdCBsb2FkU2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0ZWd5LWxvYWQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQgfCBudWxsO1xuXG4gICAgLy8gTmV3OiBHcm91cCBTb3J0aW5nXG4gICAgY29uc3QgYWRkR3JvdXBTb3J0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FkZC1ncm91cC1zb3J0LWJ0bicpO1xuICAgIGNvbnN0IGdyb3VwU29ydENoZWNrID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LXNvcnRncm91cHMtY2hlY2snKTtcblxuICAgIGNvbnN0IHNhdmVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1zYXZlLWJ0bicpO1xuICAgIGNvbnN0IHJ1bkJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidWlsZGVyLXJ1bi1idG4nKTtcbiAgICBjb25zdCBydW5MaXZlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1aWxkZXItcnVuLWxpdmUtYnRuJyk7XG4gICAgY29uc3QgY2xlYXJCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1jbGVhci1idG4nKTtcblxuICAgIGNvbnN0IGV4cG9ydEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidWlsZGVyLWV4cG9ydC1idG4nKTtcbiAgICBjb25zdCBpbXBvcnRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1pbXBvcnQtYnRuJyk7XG5cbiAgICBpZiAoZXhwb3J0QnRuKSBleHBvcnRCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBleHBvcnRCdWlsZGVyU3RyYXRlZ3kpO1xuICAgIGlmIChpbXBvcnRCdG4pIGltcG9ydEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGltcG9ydEJ1aWxkZXJTdHJhdGVneSk7XG5cbiAgICBpZiAoYWRkRmlsdGVyR3JvdXBCdG4pIGFkZEZpbHRlckdyb3VwQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gYWRkRmlsdGVyR3JvdXBSb3coKSk7XG4gICAgaWYgKGFkZEdyb3VwQnRuKSBhZGRHcm91cEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGFkZEJ1aWxkZXJSb3coJ2dyb3VwJykpO1xuICAgIGlmIChhZGRTb3J0QnRuKSBhZGRTb3J0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gYWRkQnVpbGRlclJvdygnc29ydCcpKTtcbiAgICBpZiAoYWRkR3JvdXBTb3J0QnRuKSBhZGRHcm91cFNvcnRCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBhZGRCdWlsZGVyUm93KCdncm91cFNvcnQnKSk7XG5cbiAgICBpZiAoZ3JvdXBTb3J0Q2hlY2spIHtcbiAgICAgICAgZ3JvdXBTb3J0Q2hlY2suYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKGUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNoZWNrZWQgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZDtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdncm91cC1zb3J0LXJvd3MtY29udGFpbmVyJyk7XG4gICAgICAgICAgICBjb25zdCBhZGRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWRkLWdyb3VwLXNvcnQtYnRuJyk7XG4gICAgICAgICAgICBpZiAoY29udGFpbmVyICYmIGFkZEJ0bikge1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gY2hlY2tlZCA/ICdibG9jaycgOiAnbm9uZSc7XG4gICAgICAgICAgICAgICAgYWRkQnRuLnN0eWxlLmRpc3BsYXkgPSBjaGVja2VkID8gJ2Jsb2NrJyA6ICdub25lJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKHNhdmVCdG4pIHNhdmVCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBzYXZlQ3VzdG9tU3RyYXRlZ3lGcm9tQnVpbGRlcih0cnVlKSk7XG4gICAgaWYgKHJ1bkJ0bikgcnVuQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgcnVuQnVpbGRlclNpbXVsYXRpb24pO1xuICAgIGlmIChydW5MaXZlQnRuKSBydW5MaXZlQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgcnVuQnVpbGRlckxpdmUpO1xuICAgIGlmIChjbGVhckJ0bikgY2xlYXJCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjbGVhckJ1aWxkZXIpO1xuXG4gICAgaWYgKGxvYWRTZWxlY3QpIHtcbiAgICAgICAgbG9hZFNlbGVjdC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBzZWxlY3RlZElkID0gbG9hZFNlbGVjdC52YWx1ZTtcbiAgICAgICAgICAgIGlmICghc2VsZWN0ZWRJZCkgcmV0dXJuO1xuXG4gICAgICAgICAgICBsZXQgc3RyYXQgPSBsb2NhbEN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHNlbGVjdGVkSWQpO1xuICAgICAgICAgICAgaWYgKCFzdHJhdCkge1xuICAgICAgICAgICAgICAgIHN0cmF0ID0gZ2V0QnVpbHRJblN0cmF0ZWd5Q29uZmlnKHNlbGVjdGVkSWQpIHx8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHN0cmF0KSB7XG4gICAgICAgICAgICAgICAgcG9wdWxhdGVCdWlsZGVyRnJvbVN0cmF0ZWd5KHN0cmF0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gSW5pdGlhbCBMaXZlIFZpZXdcbiAgICByZW5kZXJMaXZlVmlldygpO1xuICAgIGNvbnN0IHJlZnJlc2hMaXZlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3JlZnJlc2gtbGl2ZS12aWV3LWJ0bicpO1xuICAgIGlmIChyZWZyZXNoTGl2ZUJ0bikgcmVmcmVzaExpdmVCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCByZW5kZXJMaXZlVmlldyk7XG5cbiAgICBjb25zdCBsaXZlQ29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xpdmUtdmlldy1jb250YWluZXInKTtcbiAgICBpZiAobGl2ZUNvbnRhaW5lcikge1xuICAgICAgICBsaXZlQ29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgaXRlbSA9IHRhcmdldC5jbG9zZXN0KCcuc2VsZWN0YWJsZS1pdGVtJykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgICAgICBpZiAoIWl0ZW0pIHJldHVybjtcblxuICAgICAgICAgICAgY29uc3QgdHlwZSA9IGl0ZW0uZGF0YXNldC50eXBlO1xuICAgICAgICAgICAgY29uc3QgaWQgPSBOdW1iZXIoaXRlbS5kYXRhc2V0LmlkKTtcbiAgICAgICAgICAgIGlmICghdHlwZSB8fCBpc05hTihpZCkpIHJldHVybjtcblxuICAgICAgICAgICAgaWYgKHR5cGUgPT09ICd0YWInKSB7XG4gICAgICAgICAgICAgICAgaWYgKHNpbXVsYXRlZFNlbGVjdGlvbi5oYXMoaWQpKSBzaW11bGF0ZWRTZWxlY3Rpb24uZGVsZXRlKGlkKTtcbiAgICAgICAgICAgICAgICBlbHNlIHNpbXVsYXRlZFNlbGVjdGlvbi5hZGQoaWQpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnZ3JvdXAnKSB7XG4gICAgICAgICAgICAgICAgLy8gVG9nZ2xlIGFsbCB0YWJzIGluIGdyb3VwXG4gICAgICAgICAgICAgICAgLy8gV2UgbmVlZCB0byBrbm93IHdoaWNoIHRhYnMgYXJlIGluIHRoZSBncm91cC5cbiAgICAgICAgICAgICAgICAvLyBXZSBjYW4gZmluZCB0aGVtIGluIERPTSBvciByZWZldGNoLiBET00gaXMgZWFzaWVyLlxuICAgICAgICAgICAgICAgIC8vIE9yIGJldHRlciwgbG9naWMgaW4gcmVuZGVyTGl2ZVZpZXcgaGFuZGxlcyByZW5kZXJpbmcsIGhlcmUgd2UgaGFuZGxlIGRhdGEuXG4gICAgICAgICAgICAgICAgLy8gTGV0J3MgcmVseSBvbiBET00gc3RydWN0dXJlIG9yIHJlLXF1ZXJ5LlxuICAgICAgICAgICAgICAgIC8vIFJlLXF1ZXJ5aW5nIGlzIHJvYnVzdC5cbiAgICAgICAgICAgICAgICBjaHJvbWUudGFicy5xdWVyeSh7fSkudGhlbih0YWJzID0+IHtcbiAgICAgICAgICAgICAgICAgICBjb25zdCBncm91cFRhYnMgPSB0YWJzLmZpbHRlcih0ID0+IHQuZ3JvdXBJZCA9PT0gaWQpO1xuICAgICAgICAgICAgICAgICAgIGNvbnN0IGFsbFNlbGVjdGVkID0gZ3JvdXBUYWJzLmV2ZXJ5KHQgPT4gdC5pZCAmJiBzaW11bGF0ZWRTZWxlY3Rpb24uaGFzKHQuaWQpKTtcbiAgICAgICAgICAgICAgICAgICBncm91cFRhYnMuZm9yRWFjaCh0ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgaWYgKHQuaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhbGxTZWxlY3RlZCkgc2ltdWxhdGVkU2VsZWN0aW9uLmRlbGV0ZSh0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2Ugc2ltdWxhdGVkU2VsZWN0aW9uLmFkZCh0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgIHJlbmRlckxpdmVWaWV3KCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuOyAvLyBhc3luYyB1cGRhdGVcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3dpbmRvdycpIHtcbiAgICAgICAgICAgICAgICBjaHJvbWUudGFicy5xdWVyeSh7fSkudGhlbih0YWJzID0+IHtcbiAgICAgICAgICAgICAgICAgICBjb25zdCB3aW5UYWJzID0gdGFicy5maWx0ZXIodCA9PiB0LndpbmRvd0lkID09PSBpZCk7XG4gICAgICAgICAgICAgICAgICAgY29uc3QgYWxsU2VsZWN0ZWQgPSB3aW5UYWJzLmV2ZXJ5KHQgPT4gdC5pZCAmJiBzaW11bGF0ZWRTZWxlY3Rpb24uaGFzKHQuaWQpKTtcbiAgICAgICAgICAgICAgICAgICB3aW5UYWJzLmZvckVhY2godCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgIGlmICh0LmlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYWxsU2VsZWN0ZWQpIHNpbXVsYXRlZFNlbGVjdGlvbi5kZWxldGUodC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlIHNpbXVsYXRlZFNlbGVjdGlvbi5hZGQodC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICByZW5kZXJMaXZlVmlldygpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybjsgLy8gYXN5bmMgdXBkYXRlXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJlbmRlckxpdmVWaWV3KCk7XG4gICAgICAgIH0pO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gYWRkRmlsdGVyR3JvdXBSb3coY29uZGl0aW9ucz86IFJ1bGVDb25kaXRpb25bXSkge1xuICAgIGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmaWx0ZXItcm93cy1jb250YWluZXInKTtcbiAgICBpZiAoIWNvbnRhaW5lcikgcmV0dXJuO1xuXG4gICAgY29uc3QgZ3JvdXBEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBncm91cERpdi5jbGFzc05hbWUgPSAnZmlsdGVyLWdyb3VwLXJvdyc7XG5cbiAgICBncm91cERpdi5pbm5lckhUTUwgPSBgXG4gICAgICAgIDxkaXYgY2xhc3M9XCJmaWx0ZXItZ3JvdXAtaGVhZGVyXCI+XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cImZpbHRlci1ncm91cC10aXRsZVwiPkdyb3VwIChBTkQpPC9zcGFuPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInNtYWxsLWJ0biBidG4tZGVsLWdyb3VwXCI+RGVsZXRlIEdyb3VwPC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwiY29uZGl0aW9ucy1jb250YWluZXJcIj48L2Rpdj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInNtYWxsLWJ0biBidG4tYWRkLWNvbmRpdGlvblwiPisgQWRkIENvbmRpdGlvbjwvYnV0dG9uPlxuICAgIGA7XG5cbiAgICBncm91cERpdi5xdWVyeVNlbGVjdG9yKCcuYnRuLWRlbC1ncm91cCcpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgZ3JvdXBEaXYucmVtb3ZlKCk7XG4gICAgICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbmRpdGlvbnNDb250YWluZXIgPSBncm91cERpdi5xdWVyeVNlbGVjdG9yKCcuY29uZGl0aW9ucy1jb250YWluZXInKSBhcyBIVE1MRWxlbWVudDtcbiAgICBjb25zdCBhZGRDb25kaXRpb25CdG4gPSBncm91cERpdi5xdWVyeVNlbGVjdG9yKCcuYnRuLWFkZC1jb25kaXRpb24nKTtcblxuICAgIGNvbnN0IGFkZENvbmRpdGlvbiA9IChkYXRhPzogUnVsZUNvbmRpdGlvbikgPT4ge1xuICAgICAgICBjb25zdCBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgZGl2LmNsYXNzTmFtZSA9ICdidWlsZGVyLXJvdyBjb25kaXRpb24tcm93JztcbiAgICAgICAgZGl2LnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG4gICAgICAgIGRpdi5zdHlsZS5nYXAgPSAnNXB4JztcbiAgICAgICAgZGl2LnN0eWxlLm1hcmdpbkJvdHRvbSA9ICc1cHgnO1xuICAgICAgICBkaXYuc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xuXG4gICAgICAgIGRpdi5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwiZmllbGQtc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgJHtGSUVMRF9PUFRJT05TfVxuICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cIm9wZXJhdG9yLWNvbnRhaW5lclwiPlxuICAgICAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJvcGVyYXRvci1zZWxlY3RcIj5cbiAgICAgICAgICAgICAgICAgICAgJHtPUEVSQVRPUl9PUFRJT05TfVxuICAgICAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJ2YWx1ZS1jb250YWluZXJcIj5cbiAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cInZhbHVlLWlucHV0XCIgcGxhY2Vob2xkZXI9XCJWYWx1ZVwiPlxuICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInNtYWxsLWJ0biBidG4tZGVsLWNvbmRpdGlvblwiIHN0eWxlPVwiYmFja2dyb3VuZDogbm9uZTsgYm9yZGVyOiBub25lOyBjb2xvcjogcmVkO1wiPiZ0aW1lczs8L2J1dHRvbj5cbiAgICAgICAgYDtcblxuICAgICAgICBjb25zdCBmaWVsZFNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IG9wZXJhdG9yQ29udGFpbmVyID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5vcGVyYXRvci1jb250YWluZXInKSBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgY29uc3QgdmFsdWVDb250YWluZXIgPSBkaXYucXVlcnlTZWxlY3RvcignLnZhbHVlLWNvbnRhaW5lcicpIGFzIEhUTUxFbGVtZW50O1xuXG4gICAgICAgIGNvbnN0IHVwZGF0ZVN0YXRlID0gKGluaXRpYWxPcD86IHN0cmluZywgaW5pdGlhbFZhbD86IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgY29uc3QgdmFsID0gZmllbGRTZWxlY3QudmFsdWU7XG4gICAgICAgICAgICAvLyBIYW5kbGUgYm9vbGVhbiBmaWVsZHNcbiAgICAgICAgICAgIGlmIChbJ3NlbGVjdGVkJywgJ3Bpbm5lZCddLmluY2x1ZGVzKHZhbCkpIHtcbiAgICAgICAgICAgICAgICBvcGVyYXRvckNvbnRhaW5lci5pbm5lckhUTUwgPSBgPHNlbGVjdCBjbGFzcz1cIm9wZXJhdG9yLXNlbGVjdFwiIGRpc2FibGVkIHN0eWxlPVwiYmFja2dyb3VuZDogI2VlZTsgY29sb3I6ICM1NTU7XCI+PG9wdGlvbiB2YWx1ZT1cImVxdWFsc1wiPmlzPC9vcHRpb24+PC9zZWxlY3Q+YDtcbiAgICAgICAgICAgICAgICB2YWx1ZUNvbnRhaW5lci5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJ2YWx1ZS1pbnB1dFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInRydWVcIj5UcnVlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZmFsc2VcIj5GYWxzZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgICAgICBgO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiBhbHJlYWR5IGluIHN0YW5kYXJkIG1vZGUgdG8gYXZvaWQgdW5uZWNlc3NhcnkgRE9NIHRocmFzaGluZ1xuICAgICAgICAgICAgICAgIGlmICghb3BlcmF0b3JDb250YWluZXIucXVlcnlTZWxlY3Rvcignc2VsZWN0Om5vdChbZGlzYWJsZWRdKScpKSB7XG4gICAgICAgICAgICAgICAgICAgIG9wZXJhdG9yQ29udGFpbmVyLmlubmVySFRNTCA9IGA8c2VsZWN0IGNsYXNzPVwib3BlcmF0b3Itc2VsZWN0XCI+JHtPUEVSQVRPUl9PUFRJT05TfTwvc2VsZWN0PmA7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlQ29udGFpbmVyLmlubmVySFRNTCA9IGA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cInZhbHVlLWlucHV0XCIgcGxhY2Vob2xkZXI9XCJWYWx1ZVwiPmA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBSZXN0b3JlIHZhbHVlcyBpZiBwcm92aWRlZCAoZXNwZWNpYWxseSB3aGVuIHN3aXRjaGluZyBiYWNrIG9yIGluaXRpYWxpemluZylcbiAgICAgICAgICAgIGlmIChpbml0aWFsT3AgfHwgaW5pdGlhbFZhbCkge1xuICAgICAgICAgICAgICAgICBjb25zdCBvcEVsID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5vcGVyYXRvci1zZWxlY3QnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgIGNvbnN0IHZhbEVsID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgICAgICAgaWYgKG9wRWwgJiYgaW5pdGlhbE9wKSBvcEVsLnZhbHVlID0gaW5pdGlhbE9wO1xuICAgICAgICAgICAgICAgICBpZiAodmFsRWwgJiYgaW5pdGlhbFZhbCkgdmFsRWwudmFsdWUgPSBpbml0aWFsVmFsO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBSZS1hdHRhY2ggbGlzdGVuZXJzIHRvIG5ldyBlbGVtZW50c1xuICAgICAgICAgICAgZGl2LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0LCBzZWxlY3QnKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgICAgICAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB1cGRhdGVCcmVhZGNydW1iKTtcbiAgICAgICAgICAgICAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKCdpbnB1dCcsIHVwZGF0ZUJyZWFkY3J1bWIpO1xuICAgICAgICAgICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHVwZGF0ZUJyZWFkY3J1bWIpO1xuICAgICAgICAgICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgdXBkYXRlQnJlYWRjcnVtYik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBmaWVsZFNlbGVjdC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoKSA9PiB7XG4gICAgICAgICAgICB1cGRhdGVTdGF0ZSgpO1xuICAgICAgICAgICAgdXBkYXRlQnJlYWRjcnVtYigpO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoZGF0YSkge1xuICAgICAgICAgICAgZmllbGRTZWxlY3QudmFsdWUgPSBkYXRhLmZpZWxkO1xuICAgICAgICAgICAgdXBkYXRlU3RhdGUoZGF0YS5vcGVyYXRvciwgZGF0YS52YWx1ZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB1cGRhdGVTdGF0ZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgZGl2LnF1ZXJ5U2VsZWN0b3IoJy5idG4tZGVsLWNvbmRpdGlvbicpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgIGRpdi5yZW1vdmUoKTtcbiAgICAgICAgICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uZGl0aW9uc0NvbnRhaW5lci5hcHBlbmRDaGlsZChkaXYpO1xuICAgIH07XG5cbiAgICBhZGRDb25kaXRpb25CdG4/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gYWRkQ29uZGl0aW9uKCkpO1xuXG4gICAgaWYgKGNvbmRpdGlvbnMgJiYgY29uZGl0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbmRpdGlvbnMuZm9yRWFjaChjID0+IGFkZENvbmRpdGlvbihjKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gQWRkIG9uZSBlbXB0eSBjb25kaXRpb24gYnkgZGVmYXVsdFxuICAgICAgICBhZGRDb25kaXRpb24oKTtcbiAgICB9XG5cbiAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JvdXBEaXYpO1xuICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbn1cblxuZnVuY3Rpb24gYWRkQnVpbGRlclJvdyh0eXBlOiAnZ3JvdXAnIHwgJ3NvcnQnIHwgJ2dyb3VwU29ydCcsIGRhdGE/OiBhbnkpIHtcbiAgICBsZXQgY29udGFpbmVySWQgPSAnJztcbiAgICBpZiAodHlwZSA9PT0gJ2dyb3VwJykgY29udGFpbmVySWQgPSAnZ3JvdXAtcm93cy1jb250YWluZXInO1xuICAgIGVsc2UgaWYgKHR5cGUgPT09ICdzb3J0JykgY29udGFpbmVySWQgPSAnc29ydC1yb3dzLWNvbnRhaW5lcic7XG4gICAgZWxzZSBpZiAodHlwZSA9PT0gJ2dyb3VwU29ydCcpIGNvbnRhaW5lcklkID0gJ2dyb3VwLXNvcnQtcm93cy1jb250YWluZXInO1xuXG4gICAgY29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY29udGFpbmVySWQpO1xuICAgIGlmICghY29udGFpbmVyKSByZXR1cm47XG5cbiAgICBjb25zdCBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBkaXYuY2xhc3NOYW1lID0gJ2J1aWxkZXItcm93JztcbiAgICBkaXYuZGF0YXNldC50eXBlID0gdHlwZTtcblxuICAgIGlmICh0eXBlID09PSAnZ3JvdXAnKSB7XG4gICAgICAgIGRpdi5zdHlsZS5mbGV4V3JhcCA9ICd3cmFwJztcbiAgICAgICAgZGl2LmlubmVySFRNTCA9IGBcbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwicm93LW51bWJlclwiPjwvc3Bhbj5cbiAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJzb3VyY2Utc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImZpZWxkXCI+RmllbGQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZml4ZWRcIj5GaXhlZCBWYWx1ZTwvb3B0aW9uPlxuICAgICAgICAgICAgPC9zZWxlY3Q+XG5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiaW5wdXQtY29udGFpbmVyXCI+XG4gICAgICAgICAgICAgICAgIDwhLS0gV2lsbCBiZSBwb3B1bGF0ZWQgYmFzZWQgb24gc291cmNlIHNlbGVjdGlvbiAtLT5cbiAgICAgICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cImZpZWxkLXNlbGVjdCB2YWx1ZS1pbnB1dC1maWVsZFwiPlxuICAgICAgICAgICAgICAgICAgICAke0ZJRUxEX09QVElPTlN9XG4gICAgICAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cInZhbHVlLWlucHV0LXRleHRcIiBwbGFjZWhvbGRlcj1cIkdyb3VwIE5hbWVcIiBzdHlsZT1cImRpc3BsYXk6bm9uZTtcIj5cbiAgICAgICAgICAgIDwvc3Bhbj5cblxuICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJtYXJnaW4tbGVmdDogMTBweDtcIj5UcmFuc2Zvcm06PC9zcGFuPlxuICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cInRyYW5zZm9ybS1zZWxlY3RcIj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibm9uZVwiPk5vbmU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwic3RyaXBUbGRcIj5TdHJpcCBUTEQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZG9tYWluXCI+R2V0IERvbWFpbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJob3N0bmFtZVwiPkdldCBIb3N0bmFtZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJsb3dlcmNhc2VcIj5Mb3dlcmNhc2U8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwidXBwZXJjYXNlXCI+VXBwZXJjYXNlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImZpcnN0Q2hhclwiPkZpcnN0IENoYXI8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwicmVnZXhcIj5SZWdleCBFeHRyYWN0aW9uPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInJlZ2V4UmVwbGFjZVwiPlJlZ2V4IFJlcGxhY2U8L29wdGlvbj5cbiAgICAgICAgICAgIDwvc2VsZWN0PlxuXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwicmVnZXgtY29udGFpbmVyXCIgc3R5bGU9XCJkaXNwbGF5Om5vbmU7IGZsZXgtYmFzaXM6IDEwMCU7IG1hcmdpbi10b3A6IDhweDsgcGFkZGluZzogOHB4OyBiYWNrZ3JvdW5kOiAjZjhmOWZhOyBib3JkZXI6IDFweCBkYXNoZWQgI2NlZDRkYTsgYm9yZGVyLXJhZGl1czogNHB4O1wiPlxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDhweDsgbWFyZ2luLWJvdHRvbTogNXB4O1wiPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImZvbnQtd2VpZ2h0OiA1MDA7IGZvbnQtc2l6ZTogMC45ZW07XCI+UGF0dGVybjo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIGNsYXNzPVwidHJhbnNmb3JtLXBhdHRlcm5cIiBwbGFjZWhvbGRlcj1cImUuZy4gXihcXHcrKS0oXFxkKykkXCIgc3R5bGU9XCJmbGV4OjE7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIHRpdGxlPVwiRm9yIGV4dHJhY3Rpb246IENhcHR1cmVzIGFsbCBncm91cHMgYW5kIGNvbmNhdGVuYXRlcyB0aGVtLiBFeGFtcGxlOiAndXNlci0oXFxkKyknIC0+ICcxMjMnLiBGb3IgcmVwbGFjZW1lbnQ6IFN0YW5kYXJkIEpTIHJlZ2V4LlwiIHN0eWxlPVwiY3Vyc29yOiBoZWxwOyBjb2xvcjogIzAwN2JmZjsgZm9udC13ZWlnaHQ6IGJvbGQ7IGJhY2tncm91bmQ6ICNlN2YxZmY7IHdpZHRoOiAxOHB4OyBoZWlnaHQ6IDE4cHg7IGRpc3BsYXk6IGlubGluZS1mbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsgYm9yZGVyLXJhZGl1czogNTAlOyBmb250LXNpemU6IDEycHg7XCI+Pzwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwicmVwbGFjZW1lbnQtY29udGFpbmVyXCIgc3R5bGU9XCJkaXNwbGF5Om5vbmU7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogOHB4OyBtYXJnaW4tYm90dG9tOiA1cHg7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZm9udC13ZWlnaHQ6IDUwMDsgZm9udC1zaXplOiAwLjllbTtcIj5SZXBsYWNlOjwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJ0cmFuc2Zvcm0tcmVwbGFjZW1lbnRcIiBwbGFjZWhvbGRlcj1cImUuZy4gJDIgJDFcIiBzdHlsZT1cImZsZXg6MTtcIj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsgZ2FwOiA4cHg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGZvbnQtc2l6ZTogMC45ZW07XCI+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZm9udC13ZWlnaHQ6IDUwMDtcIj5UZXN0Ojwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJyZWdleC10ZXN0LWlucHV0XCIgcGxhY2Vob2xkZXI9XCJUZXN0IFN0cmluZ1wiIHN0eWxlPVwiZmxleDogMTtcIj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4+JnJhcnI7PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cInJlZ2V4LXRlc3QtcmVzdWx0XCIgc3R5bGU9XCJmb250LWZhbWlseTogbW9ub3NwYWNlOyBiYWNrZ3JvdW5kOiB3aGl0ZTsgcGFkZGluZzogMnB4IDVweDsgYm9yZGVyOiAxcHggc29saWQgI2RkZDsgYm9yZGVyLXJhZGl1czogM3B4OyBtaW4td2lkdGg6IDYwcHg7XCI+KHByZXZpZXcpPC9zcGFuPlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwibWFyZ2luLWxlZnQ6IDEwcHg7XCI+V2luZG93Ojwvc3Bhbj5cbiAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJ3aW5kb3ctbW9kZS1zZWxlY3RcIj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY3VycmVudFwiPkN1cnJlbnQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29tcG91bmRcIj5Db21wb3VuZDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJuZXdcIj5OZXc8L29wdGlvbj5cbiAgICAgICAgICAgIDwvc2VsZWN0PlxuXG4gICAgICAgICAgICA8c3BhbiBzdHlsZT1cIm1hcmdpbi1sZWZ0OiAxMHB4O1wiPkNvbG9yOjwvc3Bhbj5cbiAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJjb2xvci1pbnB1dFwiPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJncmV5XCI+R3JleTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJibHVlXCI+Qmx1ZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJyZWRcIj5SZWQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwieWVsbG93XCI+WWVsbG93PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImdyZWVuXCI+R3JlZW48L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwicGlua1wiPlBpbms8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwicHVycGxlXCI+UHVycGxlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImN5YW5cIj5DeWFuPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIm9yYW5nZVwiPk9yYW5nZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJtYXRjaFwiPk1hdGNoIFZhbHVlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImZpZWxkXCI+Q29sb3IgYnkgRmllbGQ8L29wdGlvbj5cbiAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cImNvbG9yLWZpZWxkLXNlbGVjdFwiIHN0eWxlPVwiZGlzcGxheTpub25lO1wiPlxuICAgICAgICAgICAgICAgICR7RklFTERfT1BUSU9OU31cbiAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJjb2xvci10cmFuc2Zvcm0tY29udGFpbmVyXCIgc3R5bGU9XCJkaXNwbGF5Om5vbmU7IG1hcmdpbi1sZWZ0OiA1cHg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7XCI+XG4gICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJmb250LXNpemU6IDAuOWVtOyBtYXJnaW4tcmlnaHQ6IDNweDtcIj5UcmFuczo8L3NwYW4+XG4gICAgICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cImNvbG9yLXRyYW5zZm9ybS1zZWxlY3RcIj5cbiAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIm5vbmVcIj5Ob25lPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzdHJpcFRsZFwiPlN0cmlwIFRMRDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZG9tYWluXCI+R2V0IERvbWFpbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiaG9zdG5hbWVcIj5HZXQgSG9zdG5hbWU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImxvd2VyY2FzZVwiPkxvd2VyY2FzZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwidXBwZXJjYXNlXCI+VXBwZXJjYXNlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJmaXJzdENoYXJcIj5GaXJzdCBDaGFyPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJyZWdleFwiPlJlZ2V4PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJjb2xvci10cmFuc2Zvcm0tcGF0dGVyblwiIHBsYWNlaG9sZGVyPVwiUmVnZXhcIiBzdHlsZT1cImRpc3BsYXk6bm9uZTsgd2lkdGg6IDgwcHg7IG1hcmdpbi1sZWZ0OiAzcHg7XCI+XG4gICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgICAgICA8bGFiZWw+PGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGNsYXNzPVwicmFuZG9tLWNvbG9yLWNoZWNrXCIgY2hlY2tlZD4gUmFuZG9tPC9sYWJlbD5cblxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJvdy1hY3Rpb25zXCI+XG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInNtYWxsLWJ0biBidG4tZGVsXCIgc3R5bGU9XCJiYWNrZ3JvdW5kOiAjZmZjY2NjOyBjb2xvcjogZGFya3JlZDtcIj5EZWxldGU8L2J1dHRvbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICBgO1xuXG4gICAgICAgIC8vIEFkZCBzcGVjaWZpYyBsaXN0ZW5lcnMgZm9yIEdyb3VwIHJvd1xuICAgICAgICBjb25zdCBzb3VyY2VTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLnNvdXJjZS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgY29uc3QgZmllbGRTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLnZhbHVlLWlucHV0LWZpZWxkJykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IHRleHRJbnB1dCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQtdGV4dCcpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICBjb25zdCBjb2xvcklucHV0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci1pbnB1dCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICBjb25zdCBjb2xvckZpZWxkU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci1maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JUcmFuc2Zvcm1Db250YWluZXIgPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLXRyYW5zZm9ybS1jb250YWluZXInKSBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JUcmFuc2Zvcm1TZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLXRyYW5zZm9ybS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci10cmFuc2Zvcm0tcGF0dGVybicpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IHJhbmRvbUNoZWNrID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5yYW5kb20tY29sb3ItY2hlY2snKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuXG4gICAgICAgIC8vIFJlZ2V4IExvZ2ljXG4gICAgICAgIGNvbnN0IHRyYW5zZm9ybVNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcudHJhbnNmb3JtLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICBjb25zdCByZWdleENvbnRhaW5lciA9IGRpdi5xdWVyeVNlbGVjdG9yKCcucmVnZXgtY29udGFpbmVyJykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IHBhdHRlcm5JbnB1dCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcudHJhbnNmb3JtLXBhdHRlcm4nKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICBjb25zdCByZXBsYWNlbWVudElucHV0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy50cmFuc2Zvcm0tcmVwbGFjZW1lbnQnKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICBjb25zdCB0ZXN0SW5wdXQgPSBkaXYucXVlcnlTZWxlY3RvcignLnJlZ2V4LXRlc3QtaW5wdXQnKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICBjb25zdCB0ZXN0UmVzdWx0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5yZWdleC10ZXN0LXJlc3VsdCcpIGFzIEhUTUxFbGVtZW50O1xuXG4gICAgICAgIGNvbnN0IHRvZ2dsZVRyYW5zZm9ybSA9ICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHZhbCA9IHRyYW5zZm9ybVNlbGVjdC52YWx1ZTtcbiAgICAgICAgICAgIGlmICh2YWwgPT09ICdyZWdleCcgfHwgdmFsID09PSAncmVnZXhSZXBsYWNlJykge1xuICAgICAgICAgICAgICAgIHJlZ2V4Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlcENvbnRhaW5lciA9IGRpdi5xdWVyeVNlbGVjdG9yKCcucmVwbGFjZW1lbnQtY29udGFpbmVyJykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgaWYgKHJlcENvbnRhaW5lcikge1xuICAgICAgICAgICAgICAgICAgICByZXBDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IHZhbCA9PT0gJ3JlZ2V4UmVwbGFjZScgPyAnZmxleCcgOiAnbm9uZSc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZWdleENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdXBkYXRlQnJlYWRjcnVtYigpO1xuICAgICAgICB9O1xuICAgICAgICB0cmFuc2Zvcm1TZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgdG9nZ2xlVHJhbnNmb3JtKTtcblxuICAgICAgICBjb25zdCB1cGRhdGVUZXN0ID0gKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGF0ID0gcGF0dGVybklucHV0LnZhbHVlO1xuICAgICAgICAgICAgY29uc3QgdHh0ID0gdGVzdElucHV0LnZhbHVlO1xuICAgICAgICAgICAgaWYgKCFwYXQgfHwgIXR4dCkge1xuICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnRleHRDb250ZW50ID0gXCIocHJldmlldylcIjtcbiAgICAgICAgICAgICAgICAgdGVzdFJlc3VsdC5zdHlsZS5jb2xvciA9IFwiIzU1NVwiO1xuICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGlmICh0cmFuc2Zvcm1TZWxlY3QudmFsdWUgPT09ICdyZWdleFJlcGxhY2UnKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlcCA9IHJlcGxhY2VtZW50SW5wdXQudmFsdWUgfHwgXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzID0gdHh0LnJlcGxhY2UobmV3IFJlZ0V4cChwYXQsICdnJyksIHJlcCk7XG4gICAgICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQudGV4dENvbnRlbnQgPSByZXM7XG4gICAgICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQuc3R5bGUuY29sb3IgPSBcImdyZWVuXCI7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHBhdCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gcmVnZXguZXhlYyh0eHQpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgZXh0cmFjdGVkID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IG1hdGNoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4dHJhY3RlZCArPSBtYXRjaFtpXSB8fCBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnRleHRDb250ZW50ID0gZXh0cmFjdGVkIHx8IFwiKGVtcHR5IGdyb3VwKVwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQuc3R5bGUuY29sb3IgPSBcImdyZWVuXCI7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgdGVzdFJlc3VsdC50ZXh0Q29udGVudCA9IFwiKG5vIG1hdGNoKVwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQuc3R5bGUuY29sb3IgPSBcInJlZFwiO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQudGV4dENvbnRlbnQgPSBcIihpbnZhbGlkIHJlZ2V4KVwiO1xuICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQuc3R5bGUuY29sb3IgPSBcInJlZFwiO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBwYXR0ZXJuSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCAoKSA9PiB7IHVwZGF0ZVRlc3QoKTsgdXBkYXRlQnJlYWRjcnVtYigpOyB9KTtcbiAgICAgICAgaWYgKHJlcGxhY2VtZW50SW5wdXQpIHtcbiAgICAgICAgICAgIHJlcGxhY2VtZW50SW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCAoKSA9PiB7IHVwZGF0ZVRlc3QoKTsgdXBkYXRlQnJlYWRjcnVtYigpOyB9KTtcbiAgICAgICAgfVxuICAgICAgICB0ZXN0SW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCB1cGRhdGVUZXN0KTtcblxuXG4gICAgICAgIC8vIFRvZ2dsZSBpbnB1dCB0eXBlXG4gICAgICAgIGNvbnN0IHRvZ2dsZUlucHV0ID0gKCkgPT4ge1xuICAgICAgICAgICAgaWYgKHNvdXJjZVNlbGVjdC52YWx1ZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgIGZpZWxkU2VsZWN0LnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWJsb2NrJztcbiAgICAgICAgICAgICAgICB0ZXh0SW5wdXQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZmllbGRTZWxlY3Quc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgICAgICB0ZXh0SW5wdXQuc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUtYmxvY2snO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdXBkYXRlQnJlYWRjcnVtYigpO1xuICAgICAgICB9O1xuICAgICAgICBzb3VyY2VTZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgdG9nZ2xlSW5wdXQpO1xuXG4gICAgICAgIC8vIFRvZ2dsZSBjb2xvciB0cmFuc2Zvcm0gcGF0dGVyblxuICAgICAgICBjb25zdCB0b2dnbGVDb2xvclRyYW5zZm9ybSA9ICgpID0+IHtcbiAgICAgICAgICAgICBpZiAoY29sb3JUcmFuc2Zvcm1TZWxlY3QudmFsdWUgPT09ICdyZWdleCcpIHtcbiAgICAgICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuLnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWJsb2NrJztcbiAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICBjb2xvclRyYW5zZm9ybVBhdHRlcm4uc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgdXBkYXRlQnJlYWRjcnVtYigpO1xuICAgICAgICB9O1xuICAgICAgICBjb2xvclRyYW5zZm9ybVNlbGVjdC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB0b2dnbGVDb2xvclRyYW5zZm9ybSk7XG4gICAgICAgIGNvbG9yVHJhbnNmb3JtUGF0dGVybi5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIHVwZGF0ZUJyZWFkY3J1bWIpO1xuXG4gICAgICAgIC8vIFRvZ2dsZSBjb2xvciBpbnB1dFxuICAgICAgICBjb25zdCB0b2dnbGVDb2xvciA9ICgpID0+IHtcbiAgICAgICAgICAgIGlmIChyYW5kb21DaGVjay5jaGVja2VkKSB7XG4gICAgICAgICAgICAgICAgY29sb3JJbnB1dC5kaXNhYmxlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgY29sb3JJbnB1dC5zdHlsZS5vcGFjaXR5ID0gJzAuNSc7XG4gICAgICAgICAgICAgICAgY29sb3JGaWVsZFNlbGVjdC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbG9ySW5wdXQuZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBjb2xvcklucHV0LnN0eWxlLm9wYWNpdHkgPSAnMSc7XG4gICAgICAgICAgICAgICAgaWYgKGNvbG9ySW5wdXQudmFsdWUgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgY29sb3JGaWVsZFNlbGVjdC5zdHlsZS5kaXNwbGF5ID0gJ2lubGluZS1ibG9jayc7XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWZsZXgnO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yRmllbGRTZWxlY3Quc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm1Db250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHJhbmRvbUNoZWNrLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHRvZ2dsZUNvbG9yKTtcbiAgICAgICAgY29sb3JJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB0b2dnbGVDb2xvcik7XG4gICAgICAgIHRvZ2dsZUNvbG9yKCk7IC8vIGluaXRcblxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3NvcnQnIHx8IHR5cGUgPT09ICdncm91cFNvcnQnKSB7XG4gICAgICAgIGRpdi5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwiZmllbGQtc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgJHtGSUVMRF9PUFRJT05TfVxuICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwib3JkZXItc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImFzY1wiPmEgdG8geiAoYXNjKTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJkZXNjXCI+eiB0byBhIChkZXNjKTwvb3B0aW9uPlxuICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93LWFjdGlvbnNcIj5cbiAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInNtYWxsLWJ0biBidG4tZGVsXCIgc3R5bGU9XCJiYWNrZ3JvdW5kOiAjZmZjY2NjOyBjb2xvcjogZGFya3JlZDtcIj5EZWxldGU8L2J1dHRvbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICBgO1xuICAgIH1cblxuICAgIC8vIFBvcHVsYXRlIGRhdGEgaWYgcHJvdmlkZWQgKGZvciBlZGl0aW5nKVxuICAgIGlmIChkYXRhKSB7XG4gICAgICAgIGlmICh0eXBlID09PSAnZ3JvdXAnKSB7XG4gICAgICAgICAgICBjb25zdCBzb3VyY2VTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLnNvdXJjZS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC1maWVsZCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgdGV4dElucHV0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC10ZXh0JykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IHRyYW5zZm9ybVNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcudHJhbnNmb3JtLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgY29sb3JJbnB1dCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuY29sb3ItaW5wdXQnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IGNvbG9yRmllbGRTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLWZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgY29sb3JUcmFuc2Zvcm1TZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLXRyYW5zZm9ybS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IGNvbG9yVHJhbnNmb3JtUGF0dGVybiA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuY29sb3ItdHJhbnNmb3JtLXBhdHRlcm4nKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgcmFuZG9tQ2hlY2sgPSBkaXYucXVlcnlTZWxlY3RvcignLnJhbmRvbS1jb2xvci1jaGVjaycpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgICAgICBjb25zdCB3aW5kb3dNb2RlU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy53aW5kb3ctbW9kZS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcblxuICAgICAgICAgICAgaWYgKGRhdGEuc291cmNlKSBzb3VyY2VTZWxlY3QudmFsdWUgPSBkYXRhLnNvdXJjZTtcblxuICAgICAgICAgICAgLy8gVHJpZ2dlciB0b2dnbGUgdG8gc2hvdyBjb3JyZWN0IGlucHV0XG4gICAgICAgICAgICBzb3VyY2VTZWxlY3QuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScpKTtcblxuICAgICAgICAgICAgaWYgKGRhdGEuc291cmNlID09PSAnZmllbGQnKSB7XG4gICAgICAgICAgICAgICAgaWYgKGRhdGEudmFsdWUpIGZpZWxkU2VsZWN0LnZhbHVlID0gZGF0YS52YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKGRhdGEudmFsdWUpIHRleHRJbnB1dC52YWx1ZSA9IGRhdGEudmFsdWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChkYXRhLnRyYW5zZm9ybSkgdHJhbnNmb3JtU2VsZWN0LnZhbHVlID0gZGF0YS50cmFuc2Zvcm07XG4gICAgICAgICAgICBpZiAoZGF0YS50cmFuc2Zvcm1QYXR0ZXJuKSAoZGl2LnF1ZXJ5U2VsZWN0b3IoJy50cmFuc2Zvcm0tcGF0dGVybicpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gZGF0YS50cmFuc2Zvcm1QYXR0ZXJuO1xuICAgICAgICAgICAgaWYgKGRhdGEudHJhbnNmb3JtUmVwbGFjZW1lbnQpIChkaXYucXVlcnlTZWxlY3RvcignLnRyYW5zZm9ybS1yZXBsYWNlbWVudCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gZGF0YS50cmFuc2Zvcm1SZXBsYWNlbWVudDtcblxuICAgICAgICAgICAgLy8gVHJpZ2dlciB0b2dnbGUgZm9yIHJlZ2V4IFVJXG4gICAgICAgICAgICB0cmFuc2Zvcm1TZWxlY3QuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScpKTtcblxuICAgICAgICAgICAgaWYgKGRhdGEud2luZG93TW9kZSkgd2luZG93TW9kZVNlbGVjdC52YWx1ZSA9IGRhdGEud2luZG93TW9kZTtcblxuICAgICAgICAgICAgaWYgKGRhdGEuY29sb3IgJiYgZGF0YS5jb2xvciAhPT0gJ3JhbmRvbScpIHtcbiAgICAgICAgICAgICAgICByYW5kb21DaGVjay5jaGVja2VkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgY29sb3JJbnB1dC52YWx1ZSA9IGRhdGEuY29sb3I7XG4gICAgICAgICAgICAgICAgaWYgKGRhdGEuY29sb3IgPT09ICdmaWVsZCcgJiYgZGF0YS5jb2xvckZpZWxkKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yRmllbGRTZWxlY3QudmFsdWUgPSBkYXRhLmNvbG9yRmllbGQ7XG4gICAgICAgICAgICAgICAgICAgIGlmIChkYXRhLmNvbG9yVHJhbnNmb3JtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm1TZWxlY3QudmFsdWUgPSBkYXRhLmNvbG9yVHJhbnNmb3JtO1xuICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkYXRhLmNvbG9yVHJhbnNmb3JtUGF0dGVybikgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuLnZhbHVlID0gZGF0YS5jb2xvclRyYW5zZm9ybVBhdHRlcm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJhbmRvbUNoZWNrLmNoZWNrZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgIC8vIFRyaWdnZXIgdG9nZ2xlIGNvbG9yXG4gICAgICAgICAgICByYW5kb21DaGVjay5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJykpO1xuICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm1TZWxlY3QuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScpKTtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnc29ydCcgfHwgdHlwZSA9PT0gJ2dyb3VwU29ydCcpIHtcbiAgICAgICAgICAgICBpZiAoZGF0YS5maWVsZCkgKGRpdi5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlID0gZGF0YS5maWVsZDtcbiAgICAgICAgICAgICBpZiAoZGF0YS5vcmRlcikgKGRpdi5xdWVyeVNlbGVjdG9yKCcub3JkZXItc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlID0gZGF0YS5vcmRlcjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIExpc3RlbmVycyAoR2VuZXJhbClcbiAgICBkaXYucXVlcnlTZWxlY3RvcignLmJ0bi1kZWwnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGRpdi5yZW1vdmUoKTtcbiAgICAgICAgdXBkYXRlQnJlYWRjcnVtYigpO1xuICAgIH0pO1xuXG4gICAgLy8gQU5EIC8gT1IgbGlzdGVuZXJzIChWaXN1YWwgbWFpbmx5LCBvciBhcHBlbmRpbmcgbmV3IHJvd3MpXG4gICAgZGl2LnF1ZXJ5U2VsZWN0b3IoJy5idG4tYW5kJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBhZGRCdWlsZGVyUm93KHR5cGUpOyAvLyBKdXN0IGFkZCBhbm90aGVyIHJvd1xuICAgIH0pO1xuXG4gICAgZGl2LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0LCBzZWxlY3QnKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgZWwuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgdXBkYXRlQnJlYWRjcnVtYik7XG4gICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgdXBkYXRlQnJlYWRjcnVtYik7XG4gICAgfSk7XG5cbiAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZGl2KTtcbiAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG59XG5cbmZ1bmN0aW9uIGNsZWFyQnVpbGRlcigpIHtcbiAgICAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LW5hbWUnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSA9ICcnO1xuICAgIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtZGVzYycpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gJyc7XG5cbiAgICAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LWF1dG9ydW4nKSBhcyBIVE1MSW5wdXRFbGVtZW50KS5jaGVja2VkID0gZmFsc2U7XG4gICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1zZXBhcmF0ZS13aW5kb3cnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS5jaGVja2VkID0gZmFsc2U7XG5cbiAgICBjb25zdCBzb3J0R3JvdXBzQ2hlY2sgPSAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LXNvcnRncm91cHMtY2hlY2snKSBhcyBIVE1MSW5wdXRFbGVtZW50KTtcbiAgICBpZiAoc29ydEdyb3Vwc0NoZWNrKSB7XG4gICAgICAgIHNvcnRHcm91cHNDaGVjay5jaGVja2VkID0gZmFsc2U7XG4gICAgICAgIC8vIFRyaWdnZXIgY2hhbmdlIHRvIGhpZGUgY29udGFpbmVyXG4gICAgICAgIHNvcnRHcm91cHNDaGVjay5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJykpO1xuICAgIH1cblxuICAgIGNvbnN0IGxvYWRTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXRlZ3ktbG9hZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICBpZiAobG9hZFNlbGVjdCkgbG9hZFNlbGVjdC52YWx1ZSA9ICcnO1xuXG4gICAgWydmaWx0ZXItcm93cy1jb250YWluZXInLCAnZ3JvdXAtcm93cy1jb250YWluZXInLCAnc29ydC1yb3dzLWNvbnRhaW5lcicsICdncm91cC1zb3J0LXJvd3MtY29udGFpbmVyJ10uZm9yRWFjaChpZCA9PiB7XG4gICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpO1xuICAgICAgICBpZiAoZWwpIGVsLmlubmVySFRNTCA9ICcnO1xuICAgIH0pO1xuXG4gICAgY29uc3QgYnVpbGRlclJlc3VsdHMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1yZXN1bHRzJyk7XG4gICAgaWYgKGJ1aWxkZXJSZXN1bHRzKSBidWlsZGVyUmVzdWx0cy5pbm5lckhUTUwgPSAnJztcblxuICAgIGFkZEZpbHRlckdyb3VwUm93KCk7IC8vIFJlc2V0IHdpdGggb25lIGVtcHR5IGZpbHRlciBncm91cFxuICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbn1cblxuZnVuY3Rpb24gZXhwb3J0QnVpbGRlclN0cmF0ZWd5KCkge1xuICAgIGNvbnN0IHN0cmF0ID0gZ2V0QnVpbGRlclN0cmF0ZWd5KCk7XG4gICAgaWYgKCFzdHJhdCkge1xuICAgICAgICBhbGVydChcIlBsZWFzZSBkZWZpbmUgYSBzdHJhdGVneSB0byBleHBvcnQgKElEIGFuZCBMYWJlbCByZXF1aXJlZCkuXCIpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGxvZ0luZm8oXCJFeHBvcnRpbmcgc3RyYXRlZ3lcIiwgeyBpZDogc3RyYXQuaWQgfSk7XG4gICAgY29uc3QganNvbiA9IEpTT04uc3RyaW5naWZ5KHN0cmF0LCBudWxsLCAyKTtcbiAgICBjb25zdCBjb250ZW50ID0gYFxuICAgICAgICA8cD5Db3B5IHRoZSBKU09OIGJlbG93OjwvcD5cbiAgICAgICAgPHRleHRhcmVhIHN0eWxlPVwid2lkdGg6IDEwMCU7IGhlaWdodDogMzAwcHg7IGZvbnQtZmFtaWx5OiBtb25vc3BhY2U7XCI+JHtlc2NhcGVIdG1sKGpzb24pfTwvdGV4dGFyZWE+XG4gICAgYDtcbiAgICBzaG93TW9kYWwoXCJFeHBvcnQgU3RyYXRlZ3lcIiwgY29udGVudCk7XG59XG5cbmZ1bmN0aW9uIGltcG9ydEJ1aWxkZXJTdHJhdGVneSgpIHtcbiAgICBjb25zdCBjb250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgY29udGVudC5pbm5lckhUTUwgPSBgXG4gICAgICAgIDxwPlBhc3RlIFN0cmF0ZWd5IEpTT04gYmVsb3c6PC9wPlxuICAgICAgICA8dGV4dGFyZWEgaWQ9XCJpbXBvcnQtc3RyYXQtYXJlYVwiIHN0eWxlPVwid2lkdGg6IDEwMCU7IGhlaWdodDogMjAwcHg7IGZvbnQtZmFtaWx5OiBtb25vc3BhY2U7IG1hcmdpbi1ib3R0b206IDEwcHg7XCI+PC90ZXh0YXJlYT5cbiAgICAgICAgPGJ1dHRvbiBpZD1cImltcG9ydC1zdHJhdC1jb25maXJtXCIgY2xhc3M9XCJzdWNjZXNzLWJ0blwiPkxvYWQ8L2J1dHRvbj5cbiAgICBgO1xuXG4gICAgY29uc3QgYnRuID0gY29udGVudC5xdWVyeVNlbGVjdG9yKCcjaW1wb3J0LXN0cmF0LWNvbmZpcm0nKTtcbiAgICBidG4/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBjb25zdCB0eHQgPSAoY29udGVudC5xdWVyeVNlbGVjdG9yKCcjaW1wb3J0LXN0cmF0LWFyZWEnKSBhcyBIVE1MVGV4dEFyZWFFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGpzb24gPSBKU09OLnBhcnNlKHR4dCk7XG4gICAgICAgICAgICBpZiAoIWpzb24uaWQgfHwgIWpzb24ubGFiZWwpIHtcbiAgICAgICAgICAgICAgICBhbGVydChcIkludmFsaWQgc3RyYXRlZ3k6IElEIGFuZCBMYWJlbCBhcmUgcmVxdWlyZWQuXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxvZ0luZm8oXCJJbXBvcnRpbmcgc3RyYXRlZ3lcIiwgeyBpZDoganNvbi5pZCB9KTtcbiAgICAgICAgICAgIHBvcHVsYXRlQnVpbGRlckZyb21TdHJhdGVneShqc29uKTtcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5tb2RhbC1vdmVybGF5Jyk/LnJlbW92ZSgpO1xuICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgIGFsZXJ0KFwiSW52YWxpZCBKU09OOiBcIiArIGUpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBzaG93TW9kYWwoXCJJbXBvcnQgU3RyYXRlZ3lcIiwgY29udGVudCk7XG59XG5cbmZ1bmN0aW9uIGV4cG9ydEFsbFN0cmF0ZWdpZXMoKSB7XG4gICAgbG9nSW5mbyhcIkV4cG9ydGluZyBhbGwgc3RyYXRlZ2llc1wiLCB7IGNvdW50OiBsb2NhbEN1c3RvbVN0cmF0ZWdpZXMubGVuZ3RoIH0pO1xuICAgIGNvbnN0IGpzb24gPSBKU09OLnN0cmluZ2lmeShsb2NhbEN1c3RvbVN0cmF0ZWdpZXMsIG51bGwsIDIpO1xuICAgIGNvbnN0IGNvbnRlbnQgPSBgXG4gICAgICAgIDxwPkNvcHkgdGhlIEpTT04gYmVsb3cgKGNvbnRhaW5zICR7bG9jYWxDdXN0b21TdHJhdGVnaWVzLmxlbmd0aH0gc3RyYXRlZ2llcyk6PC9wPlxuICAgICAgICA8dGV4dGFyZWEgc3R5bGU9XCJ3aWR0aDogMTAwJTsgaGVpZ2h0OiAzMDBweDsgZm9udC1mYW1pbHk6IG1vbm9zcGFjZTtcIj4ke2VzY2FwZUh0bWwoanNvbil9PC90ZXh0YXJlYT5cbiAgICBgO1xuICAgIHNob3dNb2RhbChcIkV4cG9ydCBBbGwgU3RyYXRlZ2llc1wiLCBjb250ZW50KTtcbn1cblxuZnVuY3Rpb24gaW1wb3J0QWxsU3RyYXRlZ2llcygpIHtcbiAgICBjb25zdCBjb250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgY29udGVudC5pbm5lckhUTUwgPSBgXG4gICAgICAgIDxwPlBhc3RlIFN0cmF0ZWd5IExpc3QgSlNPTiBiZWxvdzo8L3A+XG4gICAgICAgIDxwIHN0eWxlPVwiZm9udC1zaXplOiAwLjllbTsgY29sb3I6ICM2NjY7XCI+Tm90ZTogU3RyYXRlZ2llcyB3aXRoIG1hdGNoaW5nIElEcyB3aWxsIGJlIG92ZXJ3cml0dGVuLjwvcD5cbiAgICAgICAgPHRleHRhcmVhIGlkPVwiaW1wb3J0LWFsbC1hcmVhXCIgc3R5bGU9XCJ3aWR0aDogMTAwJTsgaGVpZ2h0OiAyMDBweDsgZm9udC1mYW1pbHk6IG1vbm9zcGFjZTsgbWFyZ2luLWJvdHRvbTogMTBweDtcIj48L3RleHRhcmVhPlxuICAgICAgICA8YnV0dG9uIGlkPVwiaW1wb3J0LWFsbC1jb25maXJtXCIgY2xhc3M9XCJzdWNjZXNzLWJ0blwiPkltcG9ydCBBbGw8L2J1dHRvbj5cbiAgICBgO1xuXG4gICAgY29uc3QgYnRuID0gY29udGVudC5xdWVyeVNlbGVjdG9yKCcjaW1wb3J0LWFsbC1jb25maXJtJyk7XG4gICAgYnRuPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGFzeW5jICgpID0+IHtcbiAgICAgICAgY29uc3QgdHh0ID0gKGNvbnRlbnQucXVlcnlTZWxlY3RvcignI2ltcG9ydC1hbGwtYXJlYScpIGFzIEhUTUxUZXh0QXJlYUVsZW1lbnQpLnZhbHVlO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QganNvbiA9IEpTT04ucGFyc2UodHh0KTtcbiAgICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheShqc29uKSkge1xuICAgICAgICAgICAgICAgIGFsZXJ0KFwiSW52YWxpZCBmb3JtYXQ6IEV4cGVjdGVkIGFuIGFycmF5IG9mIHN0cmF0ZWdpZXMuXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gVmFsaWRhdGUgaXRlbXNcbiAgICAgICAgICAgIGNvbnN0IGludmFsaWQgPSBqc29uLmZpbmQocyA9PiAhcy5pZCB8fCAhcy5sYWJlbCk7XG4gICAgICAgICAgICBpZiAoaW52YWxpZCkge1xuICAgICAgICAgICAgICAgIGFsZXJ0KFwiSW52YWxpZCBzdHJhdGVneSBpbiBsaXN0OiBtaXNzaW5nIElEIG9yIExhYmVsLlwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE1lcmdlIGxvZ2ljIChVcHNlcnQpXG4gICAgICAgICAgICBjb25zdCBzdHJhdE1hcCA9IG5ldyBNYXAobG9jYWxDdXN0b21TdHJhdGVnaWVzLm1hcChzID0+IFtzLmlkLCBzXSkpO1xuXG4gICAgICAgICAgICBsZXQgY291bnQgPSAwO1xuICAgICAgICAgICAganNvbi5mb3JFYWNoKChzOiBDdXN0b21TdHJhdGVneSkgPT4ge1xuICAgICAgICAgICAgICAgIHN0cmF0TWFwLnNldChzLmlkLCBzKTtcbiAgICAgICAgICAgICAgICBjb3VudCsrO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGNvbnN0IG5ld1N0cmF0ZWdpZXMgPSBBcnJheS5mcm9tKHN0cmF0TWFwLnZhbHVlcygpKTtcblxuICAgICAgICAgICAgbG9nSW5mbyhcIkltcG9ydGluZyBhbGwgc3RyYXRlZ2llc1wiLCB7IGNvdW50OiBuZXdTdHJhdGVnaWVzLmxlbmd0aCB9KTtcblxuICAgICAgICAgICAgLy8gU2F2ZVxuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIHBheWxvYWQ6IHsgY3VzdG9tU3RyYXRlZ2llczogbmV3U3RyYXRlZ2llcyB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gVXBkYXRlIGxvY2FsIHN0YXRlXG4gICAgICAgICAgICBsb2NhbEN1c3RvbVN0cmF0ZWdpZXMgPSBuZXdTdHJhdGVnaWVzO1xuICAgICAgICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhsb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuXG4gICAgICAgICAgICByZW5kZXJTdHJhdGVneUxvYWRPcHRpb25zKCk7XG4gICAgICAgICAgICByZW5kZXJTdHJhdGVneUxpc3RUYWJsZSgpO1xuICAgICAgICAgICAgcmVuZGVyQWxnb3JpdGhtc1ZpZXcoKTtcblxuICAgICAgICAgICAgYWxlcnQoYEltcG9ydGVkICR7Y291bnR9IHN0cmF0ZWdpZXMuYCk7XG4gICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcubW9kYWwtb3ZlcmxheScpPy5yZW1vdmUoKTtcblxuICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgIGFsZXJ0KFwiSW52YWxpZCBKU09OOiBcIiArIGUpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBzaG93TW9kYWwoXCJJbXBvcnQgQWxsIFN0cmF0ZWdpZXNcIiwgY29udGVudCk7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUJyZWFkY3J1bWIoKSB7XG4gICAgY29uc3QgYnJlYWRjcnVtYiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdGVneS1icmVhZGNydW1iJyk7XG4gICAgaWYgKCFicmVhZGNydW1iKSByZXR1cm47XG5cbiAgICBsZXQgdGV4dCA9ICdBbGwnO1xuXG4gICAgLy8gRmlsdGVyc1xuICAgIGNvbnN0IGZpbHRlcnMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmlsdGVyLXJvd3MtY29udGFpbmVyJyk/LnF1ZXJ5U2VsZWN0b3JBbGwoJy5idWlsZGVyLXJvdycpO1xuICAgIGlmIChmaWx0ZXJzICYmIGZpbHRlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICBmaWx0ZXJzLmZvckVhY2gocm93ID0+IHtcbiAgICAgICAgICAgICBjb25zdCBmaWVsZCA9IChyb3cucXVlcnlTZWxlY3RvcignLmZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICBjb25zdCBvcCA9IChyb3cucXVlcnlTZWxlY3RvcignLm9wZXJhdG9yLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICBjb25zdCB2YWwgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgIGlmICh2YWwpIHRleHQgKz0gYCA+ICR7ZmllbGR9ICR7b3B9ICR7dmFsfWA7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIEdyb3Vwc1xuICAgIGNvbnN0IGdyb3VwcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdncm91cC1yb3dzLWNvbnRhaW5lcicpPy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKTtcbiAgICBpZiAoZ3JvdXBzICYmIGdyb3Vwcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGdyb3Vwcy5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgICAgICAgY29uc3Qgc291cmNlID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcuc291cmNlLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICBsZXQgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICBpZiAoc291cmNlID09PSAnZmllbGQnKSB7XG4gICAgICAgICAgICAgICAgIHZhbCA9IChyb3cucXVlcnlTZWxlY3RvcignLnZhbHVlLWlucHV0LWZpZWxkJykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgICAgICB0ZXh0ICs9IGAgPiBHcm91cCBieSBGaWVsZDogJHt2YWx9YDtcbiAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICB2YWwgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC10ZXh0JykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgICAgIHRleHQgKz0gYCA+IEdyb3VwIGJ5IE5hbWU6IFwiJHt2YWx9XCJgO1xuICAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gR3JvdXAgU29ydHNcbiAgICBjb25zdCBncm91cFNvcnRzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dyb3VwLXNvcnQtcm93cy1jb250YWluZXInKT8ucXVlcnlTZWxlY3RvckFsbCgnLmJ1aWxkZXItcm93Jyk7XG4gICAgaWYgKGdyb3VwU29ydHMgJiYgZ3JvdXBTb3J0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGdyb3VwU29ydHMuZm9yRWFjaChyb3cgPT4ge1xuICAgICAgICAgICAgY29uc3QgZmllbGQgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICBjb25zdCBvcmRlciA9IChyb3cucXVlcnlTZWxlY3RvcignLm9yZGVyLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgIHRleHQgKz0gYCA+IEdyb3VwIHNvcnQgYnkgJHtmaWVsZH0gKCR7b3JkZXJ9KWA7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFNvcnRzXG4gICAgY29uc3Qgc29ydHMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc29ydC1yb3dzLWNvbnRhaW5lcicpPy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKTtcbiAgICBpZiAoc29ydHMgJiYgc29ydHMubGVuZ3RoID4gMCkge1xuICAgICAgICBzb3J0cy5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgICAgICAgY29uc3QgZmllbGQgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgY29uc3Qgb3JkZXIgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5vcmRlci1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgdGV4dCArPSBgID4gU29ydCBieSAke2ZpZWxkfSAoJHtvcmRlcn0pYDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgYnJlYWRjcnVtYi50ZXh0Q29udGVudCA9IHRleHQ7XG59XG5cbmZ1bmN0aW9uIGdldEJ1aWxkZXJTdHJhdGVneShpZ25vcmVWYWxpZGF0aW9uOiBib29sZWFuID0gZmFsc2UpOiBDdXN0b21TdHJhdGVneSB8IG51bGwge1xuICAgIGNvbnN0IGlkSW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtbmFtZScpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgY29uc3QgbGFiZWxJbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1kZXNjJykgYXMgSFRNTElucHV0RWxlbWVudDtcblxuICAgIGxldCBpZCA9IGlkSW5wdXQgPyBpZElucHV0LnZhbHVlLnRyaW0oKSA6ICcnO1xuICAgIGxldCBsYWJlbCA9IGxhYmVsSW5wdXQgPyBsYWJlbElucHV0LnZhbHVlLnRyaW0oKSA6ICcnO1xuICAgIGNvbnN0IGZhbGxiYWNrID0gJ01pc2MnOyAvLyBGYWxsYmFjayByZW1vdmVkIGZyb20gVUksIGRlZmF1bHQgdG8gTWlzY1xuICAgIGNvbnN0IHNvcnRHcm91cHMgPSAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LXNvcnRncm91cHMtY2hlY2snKSBhcyBIVE1MSW5wdXRFbGVtZW50KS5jaGVja2VkO1xuXG4gICAgaWYgKCFpZ25vcmVWYWxpZGF0aW9uICYmICghaWQgfHwgIWxhYmVsKSkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAoaWdub3JlVmFsaWRhdGlvbikge1xuICAgICAgICBpZiAoIWlkKSBpZCA9ICd0ZW1wX3NpbV9pZCc7XG4gICAgICAgIGlmICghbGFiZWwpIGxhYmVsID0gJ1NpbXVsYXRpb24nO1xuICAgIH1cblxuICAgIGNvbnN0IGZpbHRlckdyb3VwczogUnVsZUNvbmRpdGlvbltdW10gPSBbXTtcbiAgICBjb25zdCBmaWx0ZXJDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmlsdGVyLXJvd3MtY29udGFpbmVyJyk7XG5cbiAgICAvLyBQYXJzZSBmaWx0ZXIgZ3JvdXBzXG4gICAgaWYgKGZpbHRlckNvbnRhaW5lcikge1xuICAgICAgICBjb25zdCBncm91cFJvd3MgPSBmaWx0ZXJDb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLmZpbHRlci1ncm91cC1yb3cnKTtcbiAgICAgICAgaWYgKGdyb3VwUm93cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBncm91cFJvd3MuZm9yRWFjaChncm91cFJvdyA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgY29uZGl0aW9uczogUnVsZUNvbmRpdGlvbltdID0gW107XG4gICAgICAgICAgICAgICAgZ3JvdXBSb3cucXVlcnlTZWxlY3RvckFsbCgnLmJ1aWxkZXItcm93JykuZm9yRWFjaChyb3cgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWVsZCA9IChyb3cucXVlcnlTZWxlY3RvcignLmZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgb3BlcmF0b3IgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5vcGVyYXRvci1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgYXMgYW55O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB2YWx1ZSA9IChyb3cucXVlcnlTZWxlY3RvcignLnZhbHVlLWlucHV0JykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIC8vIE9ubHkgYWRkIGlmIHZhbHVlIGlzIHByZXNlbnQgb3Igb3BlcmF0b3IgZG9lc24ndCByZXF1aXJlIGl0XG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZSB8fCBbJ2V4aXN0cycsICdkb2VzTm90RXhpc3QnLCAnaXNOdWxsJywgJ2lzTm90TnVsbCddLmluY2x1ZGVzKG9wZXJhdG9yKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uZGl0aW9ucy5wdXNoKHsgZmllbGQsIG9wZXJhdG9yLCB2YWx1ZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGlmIChjb25kaXRpb25zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVyR3JvdXBzLnB1c2goY29uZGl0aW9ucyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBGb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eSAvIHNpbXBsZSBzdHJhdGVnaWVzLCBwb3B1bGF0ZSBmaWx0ZXJzIHdpdGggdGhlIGZpcnN0IGdyb3VwXG4gICAgY29uc3QgZmlsdGVyczogUnVsZUNvbmRpdGlvbltdID0gZmlsdGVyR3JvdXBzLmxlbmd0aCA+IDAgPyBmaWx0ZXJHcm91cHNbMF0gOiBbXTtcblxuICAgIGNvbnN0IGdyb3VwaW5nUnVsZXM6IEdyb3VwaW5nUnVsZVtdID0gW107XG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dyb3VwLXJvd3MtY29udGFpbmVyJyk/LnF1ZXJ5U2VsZWN0b3JBbGwoJy5idWlsZGVyLXJvdycpLmZvckVhY2gocm93ID0+IHtcbiAgICAgICAgY29uc3Qgc291cmNlID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcuc291cmNlLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZSBhcyBcImZpZWxkXCIgfCBcImZpeGVkXCI7XG4gICAgICAgIGxldCB2YWx1ZSA9IFwiXCI7XG4gICAgICAgIGlmIChzb3VyY2UgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgIHZhbHVlID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQtZmllbGQnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZSA9IChyb3cucXVlcnlTZWxlY3RvcignLnZhbHVlLWlucHV0LXRleHQnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHRyYW5zZm9ybSA9IChyb3cucXVlcnlTZWxlY3RvcignLnRyYW5zZm9ybS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgYXMgYW55O1xuICAgICAgICBjb25zdCB0cmFuc2Zvcm1QYXR0ZXJuID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudHJhbnNmb3JtLXBhdHRlcm4nKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgY29uc3QgdHJhbnNmb3JtUmVwbGFjZW1lbnQgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy50cmFuc2Zvcm0tcmVwbGFjZW1lbnQnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgY29uc3Qgd2luZG93TW9kZSA9IChyb3cucXVlcnlTZWxlY3RvcignLndpbmRvdy1tb2RlLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZSBhcyBhbnk7XG5cbiAgICAgICAgY29uc3QgcmFuZG9tQ2hlY2sgPSByb3cucXVlcnlTZWxlY3RvcignLnJhbmRvbS1jb2xvci1jaGVjaycpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IGNvbG9ySW5wdXQgPSByb3cucXVlcnlTZWxlY3RvcignLmNvbG9yLWlucHV0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IGNvbG9yRmllbGRTZWxlY3QgPSByb3cucXVlcnlTZWxlY3RvcignLmNvbG9yLWZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICBjb25zdCBjb2xvclRyYW5zZm9ybVNlbGVjdCA9IHJvdy5xdWVyeVNlbGVjdG9yKCcuY29sb3ItdHJhbnNmb3JtLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICBjb25zdCBjb2xvclRyYW5zZm9ybVBhdHRlcm4gPSByb3cucXVlcnlTZWxlY3RvcignLmNvbG9yLXRyYW5zZm9ybS1wYXR0ZXJuJykgYXMgSFRNTElucHV0RWxlbWVudDtcblxuICAgICAgICBsZXQgY29sb3IgPSAncmFuZG9tJztcbiAgICAgICAgbGV0IGNvbG9yRmllbGQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgICAgbGV0IGNvbG9yVHJhbnNmb3JtOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICAgIGxldCBjb2xvclRyYW5zZm9ybVBhdHRlcm5WYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gICAgICAgIGlmICghcmFuZG9tQ2hlY2suY2hlY2tlZCkge1xuICAgICAgICAgICAgY29sb3IgPSBjb2xvcklucHV0LnZhbHVlO1xuICAgICAgICAgICAgaWYgKGNvbG9yID09PSAnZmllbGQnKSB7XG4gICAgICAgICAgICAgICAgY29sb3JGaWVsZCA9IGNvbG9yRmllbGRTZWxlY3QudmFsdWU7XG4gICAgICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm0gPSBjb2xvclRyYW5zZm9ybVNlbGVjdC52YWx1ZSBhcyBhbnk7XG4gICAgICAgICAgICAgICAgaWYgKGNvbG9yVHJhbnNmb3JtID09PSAncmVnZXgnKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtUGF0dGVyblZhbHVlID0gY29sb3JUcmFuc2Zvcm1QYXR0ZXJuLnZhbHVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgZ3JvdXBpbmdSdWxlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICBzb3VyY2UsXG4gICAgICAgICAgICAgICAgdmFsdWUsXG4gICAgICAgICAgICAgICAgY29sb3IsXG4gICAgICAgICAgICAgICAgY29sb3JGaWVsZCxcbiAgICAgICAgICAgICAgICBjb2xvclRyYW5zZm9ybTogY29sb3JUcmFuc2Zvcm0gYXMgYW55LFxuICAgICAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtUGF0dGVybjogY29sb3JUcmFuc2Zvcm1QYXR0ZXJuVmFsdWUsXG4gICAgICAgICAgICAgICAgdHJhbnNmb3JtLFxuICAgICAgICAgICAgICAgIHRyYW5zZm9ybVBhdHRlcm46ICh0cmFuc2Zvcm0gPT09ICdyZWdleCcgfHwgdHJhbnNmb3JtID09PSAncmVnZXhSZXBsYWNlJykgPyB0cmFuc2Zvcm1QYXR0ZXJuIDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgIHRyYW5zZm9ybVJlcGxhY2VtZW50OiB0cmFuc2Zvcm0gPT09ICdyZWdleFJlcGxhY2UnID8gdHJhbnNmb3JtUmVwbGFjZW1lbnQgOiB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgd2luZG93TW9kZVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IHNvcnRpbmdSdWxlczogU29ydGluZ1J1bGVbXSA9IFtdO1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzb3J0LXJvd3MtY29udGFpbmVyJyk/LnF1ZXJ5U2VsZWN0b3JBbGwoJy5idWlsZGVyLXJvdycpLmZvckVhY2gocm93ID0+IHtcbiAgICAgICAgY29uc3QgZmllbGQgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgIGNvbnN0IG9yZGVyID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcub3JkZXItc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlIGFzIGFueTtcbiAgICAgICAgc29ydGluZ1J1bGVzLnB1c2goeyBmaWVsZCwgb3JkZXIgfSk7XG4gICAgfSk7XG5cbiAgICBjb25zdCBncm91cFNvcnRpbmdSdWxlczogU29ydGluZ1J1bGVbXSA9IFtdO1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdncm91cC1zb3J0LXJvd3MtY29udGFpbmVyJyk/LnF1ZXJ5U2VsZWN0b3JBbGwoJy5idWlsZGVyLXJvdycpLmZvckVhY2gocm93ID0+IHtcbiAgICAgICAgY29uc3QgZmllbGQgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgIGNvbnN0IG9yZGVyID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcub3JkZXItc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlIGFzIGFueTtcbiAgICAgICAgZ3JvdXBTb3J0aW5nUnVsZXMucHVzaCh7IGZpZWxkLCBvcmRlciB9KTtcbiAgICB9KTtcbiAgICBjb25zdCBhcHBsaWVkR3JvdXBTb3J0aW5nUnVsZXMgPSBzb3J0R3JvdXBzID8gZ3JvdXBTb3J0aW5nUnVsZXMgOiBbXTtcblxuICAgIHJldHVybiB7XG4gICAgICAgIGlkLFxuICAgICAgICBsYWJlbCxcbiAgICAgICAgZmlsdGVycyxcbiAgICAgICAgZmlsdGVyR3JvdXBzLFxuICAgICAgICBncm91cGluZ1J1bGVzLFxuICAgICAgICBzb3J0aW5nUnVsZXMsXG4gICAgICAgIGdyb3VwU29ydGluZ1J1bGVzOiBhcHBsaWVkR3JvdXBTb3J0aW5nUnVsZXMsXG4gICAgICAgIGZhbGxiYWNrLFxuICAgICAgICBzb3J0R3JvdXBzXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gcnVuQnVpbGRlclNpbXVsYXRpb24oKSB7XG4gICAgLy8gUGFzcyB0cnVlIHRvIGlnbm9yZSB2YWxpZGF0aW9uIHNvIHdlIGNhbiBzaW11bGF0ZSB3aXRob3V0IElEL0xhYmVsXG4gICAgY29uc3Qgc3RyYXQgPSBnZXRCdWlsZGVyU3RyYXRlZ3kodHJ1ZSk7XG4gICAgY29uc3QgcmVzdWx0Q29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1aWxkZXItcmVzdWx0cycpO1xuICAgIGNvbnN0IG5ld1N0YXRlUGFuZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbmV3LXN0YXRlLXBhbmVsJyk7XG5cbiAgICBpZiAoIXN0cmF0KSByZXR1cm47IC8vIFNob3VsZCBub3QgaGFwcGVuIHdpdGggaWdub3JlVmFsaWRhdGlvbj10cnVlXG5cbiAgICBsb2dJbmZvKFwiUnVubmluZyBidWlsZGVyIHNpbXVsYXRpb25cIiwgeyBzdHJhdGVneTogc3RyYXQuaWQgfSk7XG5cbiAgICAvLyBGb3Igc2ltdWxhdGlvbiwgd2UgY2FuIG1vY2sgYW4gSUQvTGFiZWwgaWYgbWlzc2luZ1xuICAgIGNvbnN0IHNpbVN0cmF0OiBDdXN0b21TdHJhdGVneSA9IHN0cmF0O1xuXG4gICAgaWYgKCFyZXN1bHRDb250YWluZXIgfHwgIW5ld1N0YXRlUGFuZWwpIHJldHVybjtcblxuICAgIC8vIFNob3cgdGhlIHBhbmVsXG4gICAgbmV3U3RhdGVQYW5lbC5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXG4gICAgLy8gVXBkYXRlIGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyB0ZW1wb3JhcmlseSBmb3IgU2ltXG4gICAgY29uc3Qgb3JpZ2luYWxTdHJhdGVnaWVzID0gWy4uLmxvY2FsQ3VzdG9tU3RyYXRlZ2llc107XG5cbiAgICB0cnkge1xuICAgICAgICAvLyBSZXBsYWNlIG9yIGFkZFxuICAgICAgICBjb25zdCBleGlzdGluZ0lkeCA9IGxvY2FsQ3VzdG9tU3RyYXRlZ2llcy5maW5kSW5kZXgocyA9PiBzLmlkID09PSBzaW1TdHJhdC5pZCk7XG4gICAgICAgIGlmIChleGlzdGluZ0lkeCAhPT0gLTEpIHtcbiAgICAgICAgICAgIGxvY2FsQ3VzdG9tU3RyYXRlZ2llc1tleGlzdGluZ0lkeF0gPSBzaW1TdHJhdDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxvY2FsQ3VzdG9tU3RyYXRlZ2llcy5wdXNoKHNpbVN0cmF0KTtcbiAgICAgICAgfVxuICAgICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyk7XG5cbiAgICAgICAgLy8gUnVuIExvZ2ljXG4gICAgICAgIGxldCB0YWJzID0gZ2V0TWFwcGVkVGFicygpO1xuXG4gICAgICAgIGlmICh0YWJzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgcmVzdWx0Q29udGFpbmVyLmlubmVySFRNTCA9ICc8cD5ObyB0YWJzIGZvdW5kIHRvIHNpbXVsYXRlLjwvcD4nO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQXBwbHkgU2ltdWxhdGVkIFNlbGVjdGlvbiBPdmVycmlkZVxuICAgICAgICBpZiAoc2ltdWxhdGVkU2VsZWN0aW9uLnNpemUgPiAwKSB7XG4gICAgICAgICAgICB0YWJzID0gdGFicy5tYXAodCA9PiAoe1xuICAgICAgICAgICAgICAgIC4uLnQsXG4gICAgICAgICAgICAgICAgc2VsZWN0ZWQ6IHNpbXVsYXRlZFNlbGVjdGlvbi5oYXModC5pZClcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNvcnQgdXNpbmcgdGhpcyBzdHJhdGVneT9cbiAgICAgICAgLy8gc29ydFRhYnMgZXhwZWN0cyBTb3J0aW5nU3RyYXRlZ3lbXS5cbiAgICAgICAgLy8gSWYgd2UgdXNlIHRoaXMgc3RyYXRlZ3kgZm9yIHNvcnRpbmcuLi5cbiAgICAgICAgdGFicyA9IHNvcnRUYWJzKHRhYnMsIFtzaW1TdHJhdC5pZF0pO1xuXG4gICAgICAgIC8vIEdyb3VwIHVzaW5nIHRoaXMgc3RyYXRlZ3lcbiAgICAgICAgY29uc3QgZ3JvdXBzID0gZ3JvdXBUYWJzKHRhYnMsIFtzaW1TdHJhdC5pZF0pO1xuXG4gICAgICAgIC8vIENoZWNrIGlmIHdlIHNob3VsZCBzaG93IGEgZmFsbGJhY2sgcmVzdWx0IChlLmcuIFNvcnQgT25seSlcbiAgICAgICAgLy8gSWYgbm8gZ3JvdXBzIHdlcmUgY3JlYXRlZCwgYnV0IHdlIGhhdmUgdGFicywgYW5kIHRoZSBzdHJhdGVneSBpcyBub3QgYSBncm91cGluZyBzdHJhdGVneSxcbiAgICAgICAgLy8gd2Ugc2hvdyB0aGUgdGFicyBhcyBhIHNpbmdsZSBsaXN0LlxuICAgICAgICBpZiAoZ3JvdXBzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgY29uc3Qgc3RyYXREZWYgPSBnZXRTdHJhdGVnaWVzKGxvY2FsQ3VzdG9tU3RyYXRlZ2llcykuZmluZChzID0+IHMuaWQgPT09IHNpbVN0cmF0LmlkKTtcbiAgICAgICAgICAgIGlmIChzdHJhdERlZiAmJiAhc3RyYXREZWYuaXNHcm91cGluZykge1xuICAgICAgICAgICAgICAgIGdyb3Vwcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6ICdzaW0tc29ydGVkJyxcbiAgICAgICAgICAgICAgICAgICAgd2luZG93SWQ6IDAsXG4gICAgICAgICAgICAgICAgICAgIGxhYmVsOiAnU29ydGVkIFJlc3VsdHMgKE5vIEdyb3VwaW5nKScsXG4gICAgICAgICAgICAgICAgICAgIGNvbG9yOiAnZ3JleScsXG4gICAgICAgICAgICAgICAgICAgIHRhYnM6IHRhYnMsXG4gICAgICAgICAgICAgICAgICAgIHJlYXNvbjogJ1NvcnQgT25seSdcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJlbmRlciBSZXN1bHRzXG4gICAgICAgIGlmIChncm91cHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICByZXN1bHRDb250YWluZXIuaW5uZXJIVE1MID0gJzxwPk5vIGdyb3VwcyBjcmVhdGVkLjwvcD4nO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVzdWx0Q29udGFpbmVyLmlubmVySFRNTCA9IGdyb3Vwcy5tYXAoZ3JvdXAgPT4gYFxuICAgIDxkaXYgY2xhc3M9XCJncm91cC1yZXN1bHRcIiBzdHlsZT1cIm1hcmdpbi1ib3R0b206IDEwcHg7IGJvcmRlcjogMXB4IHNvbGlkICNkZGQ7IGJvcmRlci1yYWRpdXM6IDRweDsgb3ZlcmZsb3c6IGhpZGRlbjtcIj5cbiAgICAgIDxkaXYgY2xhc3M9XCJncm91cC1oZWFkZXJcIiBzdHlsZT1cImJvcmRlci1sZWZ0OiA1cHggc29saWQgJHtncm91cC5jb2xvcn07IHBhZGRpbmc6IDVweDsgYmFja2dyb3VuZDogI2Y4ZjlmYTsgZm9udC1zaXplOiAwLjllbTsgZm9udC13ZWlnaHQ6IGJvbGQ7IGRpc3BsYXk6IGZsZXg7IGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcIj5cbiAgICAgICAgPHNwYW4+JHtlc2NhcGVIdG1sKGdyb3VwLmxhYmVsIHx8ICdVbmdyb3VwZWQnKX08L3NwYW4+XG4gICAgICAgIDxzcGFuIGNsYXNzPVwiZ3JvdXAtbWV0YVwiIHN0eWxlPVwiZm9udC13ZWlnaHQ6IG5vcm1hbDsgZm9udC1zaXplOiAwLjhlbTsgY29sb3I6ICM2NjY7XCI+JHtncm91cC50YWJzLmxlbmd0aH08L3NwYW4+XG4gICAgICA8L2Rpdj5cbiAgICAgIDx1bCBjbGFzcz1cImdyb3VwLXRhYnNcIiBzdHlsZT1cImxpc3Qtc3R5bGU6IG5vbmU7IG1hcmdpbjogMDsgcGFkZGluZzogMDtcIj5cbiAgICAgICAgJHtncm91cC50YWJzLm1hcCh0YWIgPT4gYFxuICAgICAgICAgIDxsaSBjbGFzcz1cImdyb3VwLXRhYi1pdGVtXCIgc3R5bGU9XCJwYWRkaW5nOiA0cHggNXB4OyBib3JkZXItdG9wOiAxcHggc29saWQgI2VlZTsgZGlzcGxheTogZmxleDsgZ2FwOiA1cHg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGZvbnQtc2l6ZTogMC44NWVtO1wiPlxuICAgICAgICAgICAgPGRpdiBzdHlsZT1cIndpZHRoOiAxMnB4OyBoZWlnaHQ6IDEycHg7IGJhY2tncm91bmQ6ICNlZWU7IGJvcmRlci1yYWRpdXM6IDJweDsgZmxleC1zaHJpbms6IDA7XCI+XG4gICAgICAgICAgICAgICAgJHt0YWIuZmF2SWNvblVybCA/IGA8aW1nIHNyYz1cIiR7ZXNjYXBlSHRtbCh0YWIuZmF2SWNvblVybCl9XCIgc3R5bGU9XCJ3aWR0aDogMTAwJTsgaGVpZ2h0OiAxMDAlOyBvYmplY3QtZml0OiBjb3ZlcjtcIiBvbmVycm9yPVwidGhpcy5zdHlsZS5kaXNwbGF5PSdub25lJ1wiPmAgOiAnJ31cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJ0aXRsZS1jZWxsXCIgdGl0bGU9XCIke2VzY2FwZUh0bWwodGFiLnRpdGxlKX1cIiBzdHlsZT1cIndoaXRlLXNwYWNlOiBub3dyYXA7IG92ZXJmbG93OiBoaWRkZW47IHRleHQtb3ZlcmZsb3c6IGVsbGlwc2lzO1wiPiR7ZXNjYXBlSHRtbCh0YWIudGl0bGUpfTwvc3Bhbj5cbiAgICAgICAgICA8L2xpPlxuICAgICAgICBgKS5qb2luKCcnKX1cbiAgICAgIDwvdWw+XG4gICAgPC9kaXY+XG4gIGApLmpvaW4oJycpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIlNpbXVsYXRpb24gZmFpbGVkXCIsIGUpO1xuICAgICAgICByZXN1bHRDb250YWluZXIuaW5uZXJIVE1MID0gYDxwIHN0eWxlPVwiY29sb3I6IHJlZDtcIj5TaW11bGF0aW9uIGZhaWxlZDogJHtlfTwvcD5gO1xuICAgICAgICBhbGVydChcIlNpbXVsYXRpb24gZmFpbGVkOiBcIiArIGUpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICAgIC8vIFJlc3RvcmUgc3RyYXRlZ2llc1xuICAgICAgICBsb2NhbEN1c3RvbVN0cmF0ZWdpZXMgPSBvcmlnaW5hbFN0cmF0ZWdpZXM7XG4gICAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMobG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHNhdmVDdXN0b21TdHJhdGVneUZyb21CdWlsZGVyKHNob3dTdWNjZXNzID0gdHJ1ZSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IHN0cmF0ID0gZ2V0QnVpbGRlclN0cmF0ZWd5KCk7XG4gICAgaWYgKCFzdHJhdCkge1xuICAgICAgICBhbGVydChcIlBsZWFzZSBmaWxsIGluIElEIGFuZCBMYWJlbC5cIik7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHNhdmVTdHJhdGVneShzdHJhdCwgc2hvd1N1Y2Nlc3MpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBzYXZlU3RyYXRlZ3koc3RyYXQ6IEN1c3RvbVN0cmF0ZWd5LCBzaG93U3VjY2VzczogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIHRyeSB7XG4gICAgICAgIGxvZ0luZm8oXCJTYXZpbmcgc3RyYXRlZ3lcIiwgeyBpZDogc3RyYXQuaWQgfSk7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9hZFByZWZlcmVuY2VzJyB9KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgIGNvbnN0IHByZWZzID0gcmVzcG9uc2UuZGF0YSBhcyBQcmVmZXJlbmNlcztcbiAgICAgICAgICAgIGxldCBjdXJyZW50U3RyYXRlZ2llcyA9IHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW107XG5cbiAgICAgICAgICAgIC8vIEZpbmQgZXhpc3RpbmcgdG8gcHJlc2VydmUgcHJvcHMgKGxpa2UgYXV0b1J1bilcbiAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nID0gY3VycmVudFN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0LmlkKTtcbiAgICAgICAgICAgIGlmIChleGlzdGluZykge1xuICAgICAgICAgICAgICAgIHN0cmF0LmF1dG9SdW4gPSBleGlzdGluZy5hdXRvUnVuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBSZW1vdmUgZXhpc3RpbmcgaWYgc2FtZSBJRFxuICAgICAgICAgICAgY3VycmVudFN0cmF0ZWdpZXMgPSBjdXJyZW50U3RyYXRlZ2llcy5maWx0ZXIocyA9PiBzLmlkICE9PSBzdHJhdC5pZCk7XG4gICAgICAgICAgICBjdXJyZW50U3RyYXRlZ2llcy5wdXNoKHN0cmF0KTtcblxuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIHBheWxvYWQ6IHsgY3VzdG9tU3RyYXRlZ2llczogY3VycmVudFN0cmF0ZWdpZXMgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyA9IGN1cnJlbnRTdHJhdGVnaWVzO1xuICAgICAgICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhsb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuXG4gICAgICAgICAgICByZW5kZXJTdHJhdGVneUxvYWRPcHRpb25zKCk7XG4gICAgICAgICAgICByZW5kZXJTdHJhdGVneUxpc3RUYWJsZSgpO1xuICAgICAgICAgICAgcmVuZGVyQWxnb3JpdGhtc1ZpZXcoKTtcbiAgICAgICAgICAgIGlmIChzaG93U3VjY2VzcykgYWxlcnQoXCJTdHJhdGVneSBzYXZlZCFcIik7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHNhdmUgc3RyYXRlZ3lcIiwgZSk7XG4gICAgICAgIGFsZXJ0KFwiRXJyb3Igc2F2aW5nIHN0cmF0ZWd5XCIpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBydW5CdWlsZGVyTGl2ZSgpIHtcbiAgICBjb25zdCBzdHJhdCA9IGdldEJ1aWxkZXJTdHJhdGVneSgpO1xuICAgIGlmICghc3RyYXQpIHtcbiAgICAgICAgYWxlcnQoXCJQbGVhc2UgZmlsbCBpbiBJRCBhbmQgTGFiZWwgdG8gcnVuIGxpdmUuXCIpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbG9nSW5mbyhcIkFwcGx5aW5nIHN0cmF0ZWd5IGxpdmVcIiwgeyBpZDogc3RyYXQuaWQgfSk7XG5cbiAgICAvLyBTYXZlIHNpbGVudGx5IGZpcnN0IHRvIGVuc3VyZSBiYWNrZW5kIGhhcyB0aGUgZGVmaW5pdGlvblxuICAgIGNvbnN0IHNhdmVkID0gYXdhaXQgc2F2ZVN0cmF0ZWd5KHN0cmF0LCBmYWxzZSk7XG4gICAgaWYgKCFzYXZlZCkgcmV0dXJuO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICB0eXBlOiAnYXBwbHlHcm91cGluZycsXG4gICAgICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgICAgICAgc29ydGluZzogW3N0cmF0LmlkXVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2spIHtcbiAgICAgICAgICAgIGFsZXJ0KFwiQXBwbGllZCBzdWNjZXNzZnVsbHkhXCIpO1xuICAgICAgICAgICAgbG9hZFRhYnMoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGFsZXJ0KFwiRmFpbGVkIHRvIGFwcGx5OiBcIiArIChyZXNwb25zZS5lcnJvciB8fCAnVW5rbm93biBlcnJvcicpKTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkFwcGx5IGZhaWxlZFwiLCBlKTtcbiAgICAgICAgYWxlcnQoXCJBcHBseSBmYWlsZWQ6IFwiICsgZSk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBwb3B1bGF0ZUJ1aWxkZXJGcm9tU3RyYXRlZ3koc3RyYXQ6IEN1c3RvbVN0cmF0ZWd5KSB7XG4gICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1uYW1lJykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUgPSBzdHJhdC5pZDtcbiAgICAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LWRlc2MnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSA9IHN0cmF0LmxhYmVsO1xuXG4gICAgY29uc3Qgc29ydEdyb3Vwc0NoZWNrID0gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1zb3J0Z3JvdXBzLWNoZWNrJykgYXMgSFRNTElucHV0RWxlbWVudCk7XG4gICAgY29uc3QgaGFzR3JvdXBTb3J0ID0gISEoc3RyYXQuZ3JvdXBTb3J0aW5nUnVsZXMgJiYgc3RyYXQuZ3JvdXBTb3J0aW5nUnVsZXMubGVuZ3RoID4gMCkgfHwgISFzdHJhdC5zb3J0R3JvdXBzO1xuICAgIHNvcnRHcm91cHNDaGVjay5jaGVja2VkID0gaGFzR3JvdXBTb3J0O1xuICAgIHNvcnRHcm91cHNDaGVjay5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJykpO1xuXG4gICAgY29uc3QgYXV0b1J1bkNoZWNrID0gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1hdXRvcnVuJykgYXMgSFRNTElucHV0RWxlbWVudCk7XG4gICAgYXV0b1J1bkNoZWNrLmNoZWNrZWQgPSAhIXN0cmF0LmF1dG9SdW47XG5cbiAgICBbJ2ZpbHRlci1yb3dzLWNvbnRhaW5lcicsICdncm91cC1yb3dzLWNvbnRhaW5lcicsICdzb3J0LXJvd3MtY29udGFpbmVyJywgJ2dyb3VwLXNvcnQtcm93cy1jb250YWluZXInXS5mb3JFYWNoKGlkID0+IHtcbiAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCk7XG4gICAgICAgIGlmIChlbCkgZWwuaW5uZXJIVE1MID0gJyc7XG4gICAgfSk7XG5cbiAgICBpZiAoc3RyYXQuZmlsdGVyR3JvdXBzICYmIHN0cmF0LmZpbHRlckdyb3Vwcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHN0cmF0LmZpbHRlckdyb3Vwcy5mb3JFYWNoKGcgPT4gYWRkRmlsdGVyR3JvdXBSb3coZykpO1xuICAgIH0gZWxzZSBpZiAoc3RyYXQuZmlsdGVycyAmJiBzdHJhdC5maWx0ZXJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgYWRkRmlsdGVyR3JvdXBSb3coc3RyYXQuZmlsdGVycyk7XG4gICAgfVxuXG4gICAgc3RyYXQuZ3JvdXBpbmdSdWxlcz8uZm9yRWFjaChnID0+IGFkZEJ1aWxkZXJSb3coJ2dyb3VwJywgZykpO1xuICAgIHN0cmF0LnNvcnRpbmdSdWxlcz8uZm9yRWFjaChzID0+IGFkZEJ1aWxkZXJSb3coJ3NvcnQnLCBzKSk7XG4gICAgc3RyYXQuZ3JvdXBTb3J0aW5nUnVsZXM/LmZvckVhY2goZ3MgPT4gYWRkQnVpbGRlclJvdygnZ3JvdXBTb3J0JywgZ3MpKTtcblxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyN2aWV3LXN0cmF0ZWdpZXMnKT8uc2Nyb2xsSW50b1ZpZXcoeyBiZWhhdmlvcjogJ3Ntb290aCcgfSk7XG4gICAgdXBkYXRlQnJlYWRjcnVtYigpO1xufVxuXG5mdW5jdGlvbiByZW5kZXJTdHJhdGVneUxvYWRPcHRpb25zKCkge1xuICAgIGNvbnN0IHNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdGVneS1sb2FkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50IHwgbnVsbDtcbiAgICBpZiAoIXNlbGVjdCkgcmV0dXJuO1xuXG4gICAgY29uc3QgY3VzdG9tT3B0aW9ucyA9IGxvY2FsQ3VzdG9tU3RyYXRlZ2llc1xuICAgICAgICAuc2xpY2UoKVxuICAgICAgICAuc29ydCgoYSwgYikgPT4gYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpKVxuICAgICAgICAubWFwKHN0cmF0ZWd5ID0+IGBcbiAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCIke2VzY2FwZUh0bWwoc3RyYXRlZ3kuaWQpfVwiPiR7ZXNjYXBlSHRtbChzdHJhdGVneS5sYWJlbCl9ICgke2VzY2FwZUh0bWwoc3RyYXRlZ3kuaWQpfSk8L29wdGlvbj5cbiAgICAgICAgYCkuam9pbignJyk7XG5cbiAgICBjb25zdCBidWlsdEluT3B0aW9ucyA9IFNUUkFURUdJRVNcbiAgICAgICAgLmZpbHRlcihzID0+ICFsb2NhbEN1c3RvbVN0cmF0ZWdpZXMuc29tZShjcyA9PiBjcy5pZCA9PT0gcy5pZCkpXG4gICAgICAgIC5tYXAoc3RyYXRlZ3kgPT4gYFxuICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIiR7ZXNjYXBlSHRtbChzdHJhdGVneS5pZCBhcyBzdHJpbmcpfVwiPiR7ZXNjYXBlSHRtbChzdHJhdGVneS5sYWJlbCl9IChCdWlsdC1pbik8L29wdGlvbj5cbiAgICAgICAgYCkuam9pbignJyk7XG5cbiAgICBzZWxlY3QuaW5uZXJIVE1MID0gYDxvcHRpb24gdmFsdWU9XCJcIj5Mb2FkIHNhdmVkIHN0cmF0ZWd5Li4uPC9vcHRpb24+YCArXG4gICAgICAgIChjdXN0b21PcHRpb25zID8gYDxvcHRncm91cCBsYWJlbD1cIkN1c3RvbSBTdHJhdGVnaWVzXCI+JHtjdXN0b21PcHRpb25zfTwvb3B0Z3JvdXA+YCA6ICcnKSArXG4gICAgICAgIChidWlsdEluT3B0aW9ucyA/IGA8b3B0Z3JvdXAgbGFiZWw9XCJCdWlsdC1pbiBTdHJhdGVnaWVzXCI+JHtidWlsdEluT3B0aW9uc308L29wdGdyb3VwPmAgOiAnJyk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlclN0cmF0ZWd5TGlzdFRhYmxlKCkge1xuICAgIGNvbnN0IHRhYmxlQm9keSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdGVneS10YWJsZS1ib2R5Jyk7XG4gICAgaWYgKCF0YWJsZUJvZHkpIHJldHVybjtcblxuICAgIGNvbnN0IGN1c3RvbUlkcyA9IG5ldyBTZXQobG9jYWxDdXN0b21TdHJhdGVnaWVzLm1hcChzdHJhdGVneSA9PiBzdHJhdGVneS5pZCkpO1xuICAgIGNvbnN0IGJ1aWx0SW5Sb3dzID0gU1RSQVRFR0lFUy5tYXAoc3RyYXRlZ3kgPT4gKHtcbiAgICAgICAgLi4uc3RyYXRlZ3ksXG4gICAgICAgIHNvdXJjZUxhYmVsOiAnQnVpbHQtaW4nLFxuICAgICAgICBjb25maWdTdW1tYXJ5OiAnXHUyMDE0JyxcbiAgICAgICAgYXV0b1J1bkxhYmVsOiAnXHUyMDE0JyxcbiAgICAgICAgYWN0aW9uczogJydcbiAgICB9KSk7XG5cbiAgICBjb25zdCBjdXN0b21Sb3dzID0gbG9jYWxDdXN0b21TdHJhdGVnaWVzLm1hcChzdHJhdGVneSA9PiB7XG4gICAgICAgIGNvbnN0IG92ZXJyaWRlc0J1aWx0SW4gPSBjdXN0b21JZHMuaGFzKHN0cmF0ZWd5LmlkKSAmJiBTVFJBVEVHSUVTLnNvbWUoYnVpbHRJbiA9PiBidWlsdEluLmlkID09PSBzdHJhdGVneS5pZCk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBpZDogc3RyYXRlZ3kuaWQsXG4gICAgICAgICAgICBsYWJlbDogc3RyYXRlZ3kubGFiZWwsXG4gICAgICAgICAgICBpc0dyb3VwaW5nOiB0cnVlLFxuICAgICAgICAgICAgaXNTb3J0aW5nOiB0cnVlLFxuICAgICAgICAgICAgc291cmNlTGFiZWw6IG92ZXJyaWRlc0J1aWx0SW4gPyAnQ3VzdG9tIChvdmVycmlkZXMgYnVpbHQtaW4pJyA6ICdDdXN0b20nLFxuICAgICAgICAgICAgY29uZmlnU3VtbWFyeTogYEZpbHRlcnM6ICR7c3RyYXRlZ3kuZmlsdGVycz8ubGVuZ3RoIHx8IDB9LCBHcm91cHM6ICR7c3RyYXRlZ3kuZ3JvdXBpbmdSdWxlcz8ubGVuZ3RoIHx8IDB9LCBTb3J0czogJHtzdHJhdGVneS5zb3J0aW5nUnVsZXM/Lmxlbmd0aCB8fCAwfWAsXG4gICAgICAgICAgICBhdXRvUnVuTGFiZWw6IHN0cmF0ZWd5LmF1dG9SdW4gPyAnWWVzJyA6ICdObycsXG4gICAgICAgICAgICBhY3Rpb25zOiBgPGJ1dHRvbiBjbGFzcz1cImRlbGV0ZS1zdHJhdGVneS1yb3dcIiBkYXRhLWlkPVwiJHtlc2NhcGVIdG1sKHN0cmF0ZWd5LmlkKX1cIiBzdHlsZT1cImNvbG9yOiByZWQ7XCI+RGVsZXRlPC9idXR0b24+YFxuICAgICAgICB9O1xuICAgIH0pO1xuXG4gICAgY29uc3QgYWxsUm93cyA9IFsuLi5idWlsdEluUm93cywgLi4uY3VzdG9tUm93c107XG5cbiAgICBpZiAoYWxsUm93cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgdGFibGVCb2R5LmlubmVySFRNTCA9ICc8dHI+PHRkIGNvbHNwYW49XCI3XCIgc3R5bGU9XCJjb2xvcjogIzg4ODtcIj5ObyBzdHJhdGVnaWVzIGZvdW5kLjwvdGQ+PC90cj4nO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGFibGVCb2R5LmlubmVySFRNTCA9IGFsbFJvd3MubWFwKHJvdyA9PiB7XG4gICAgICAgIGNvbnN0IGNhcGFiaWxpdGllcyA9IFtyb3cuaXNHcm91cGluZyA/ICdHcm91cGluZycgOiBudWxsLCByb3cuaXNTb3J0aW5nID8gJ1NvcnRpbmcnIDogbnVsbF0uZmlsdGVyKEJvb2xlYW4pLmpvaW4oJywgJyk7XG4gICAgICAgIHJldHVybiBgXG4gICAgICAgIDx0cj5cbiAgICAgICAgICAgIDx0ZD4ke2VzY2FwZUh0bWwocm93LmxhYmVsKX08L3RkPlxuICAgICAgICAgICAgPHRkPiR7ZXNjYXBlSHRtbChTdHJpbmcocm93LmlkKSl9PC90ZD5cbiAgICAgICAgICAgIDx0ZD4ke2VzY2FwZUh0bWwocm93LnNvdXJjZUxhYmVsKX08L3RkPlxuICAgICAgICAgICAgPHRkPiR7ZXNjYXBlSHRtbChjYXBhYmlsaXRpZXMpfTwvdGQ+XG4gICAgICAgICAgICA8dGQ+JHtlc2NhcGVIdG1sKHJvdy5jb25maWdTdW1tYXJ5KX08L3RkPlxuICAgICAgICAgICAgPHRkPiR7ZXNjYXBlSHRtbChyb3cuYXV0b1J1bkxhYmVsKX08L3RkPlxuICAgICAgICAgICAgPHRkPiR7cm93LmFjdGlvbnN9PC90ZD5cbiAgICAgICAgPC90cj5cbiAgICAgICAgYDtcbiAgICB9KS5qb2luKCcnKTtcblxuICAgIHRhYmxlQm9keS5xdWVyeVNlbGVjdG9yQWxsKCcuZGVsZXRlLXN0cmF0ZWd5LXJvdycpLmZvckVhY2goYnRuID0+IHtcbiAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGlkID0gKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0LmlkO1xuICAgICAgICAgICAgaWYgKGlkICYmIGNvbmZpcm0oYERlbGV0ZSBzdHJhdGVneSBcIiR7aWR9XCI/YCkpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBkZWxldGVDdXN0b21TdHJhdGVneShpZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBkZWxldGVDdXN0b21TdHJhdGVneShpZDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgbG9nSW5mbyhcIkRlbGV0aW5nIHN0cmF0ZWd5XCIsIHsgaWQgfSk7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9hZFByZWZlcmVuY2VzJyB9KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgIGNvbnN0IHByZWZzID0gcmVzcG9uc2UuZGF0YSBhcyBQcmVmZXJlbmNlcztcbiAgICAgICAgICAgIGNvbnN0IG5ld1N0cmF0ZWdpZXMgPSAocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSkuZmlsdGVyKHMgPT4gcy5pZCAhPT0gaWQpO1xuXG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3NhdmVQcmVmZXJlbmNlcycsXG4gICAgICAgICAgICAgICAgcGF5bG9hZDogeyBjdXN0b21TdHJhdGVnaWVzOiBuZXdTdHJhdGVnaWVzIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBsb2NhbEN1c3RvbVN0cmF0ZWdpZXMgPSBuZXdTdHJhdGVnaWVzO1xuICAgICAgICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhsb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMb2FkT3B0aW9ucygpO1xuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMaXN0VGFibGUoKTtcbiAgICAgICAgICAgIHJlbmRlckFsZ29yaXRobXNWaWV3KCk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gZGVsZXRlIHN0cmF0ZWd5XCIsIGUpO1xuICAgIH1cbn1cblxuLy8gLi4uIEdlbmVyYSBtYW5hZ2VtZW50IC4uLiAoa2VwdCBhcyBpcylcbmZ1bmN0aW9uIHJlbmRlckN1c3RvbUdlbmVyYUxpc3QoY3VzdG9tR2VuZXJhOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KSB7XG4gICAgY29uc3QgbGlzdENvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjdXN0b20tZ2VuZXJhLWxpc3QnKTtcbiAgICBpZiAoIWxpc3RDb250YWluZXIpIHJldHVybjtcblxuICAgIGlmIChPYmplY3Qua2V5cyhjdXN0b21HZW5lcmEpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBsaXN0Q29udGFpbmVyLmlubmVySFRNTCA9ICc8cCBzdHlsZT1cImNvbG9yOiAjODg4OyBmb250LXN0eWxlOiBpdGFsaWM7XCI+Tm8gY3VzdG9tIGVudHJpZXMuPC9wPic7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsaXN0Q29udGFpbmVyLmlubmVySFRNTCA9IE9iamVjdC5lbnRyaWVzKGN1c3RvbUdlbmVyYSkubWFwKChbZG9tYWluLCBjYXRlZ29yeV0pID0+IGBcbiAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjsgYWxpZ24taXRlbXM6IGNlbnRlcjsgcGFkZGluZzogNXB4OyBib3JkZXItYm90dG9tOiAxcHggc29saWQgI2YwZjBmMDtcIj5cbiAgICAgICAgICAgIDxzcGFuPjxiPiR7ZXNjYXBlSHRtbChkb21haW4pfTwvYj46ICR7ZXNjYXBlSHRtbChjYXRlZ29yeSl9PC9zcGFuPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImRlbGV0ZS1nZW5lcmEtYnRuXCIgZGF0YS1kb21haW49XCIke2VzY2FwZUh0bWwoZG9tYWluKX1cIiBzdHlsZT1cImJhY2tncm91bmQ6IG5vbmU7IGJvcmRlcjogbm9uZTsgY29sb3I6IHJlZDsgY3Vyc29yOiBwb2ludGVyO1wiPiZ0aW1lczs8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG4gICAgYCkuam9pbignJyk7XG5cbiAgICAvLyBSZS1hdHRhY2ggbGlzdGVuZXJzIGZvciBkZWxldGUgYnV0dG9uc1xuICAgIGxpc3RDb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLmRlbGV0ZS1nZW5lcmEtYnRuJykuZm9yRWFjaChidG4gPT4ge1xuICAgICAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgZG9tYWluID0gKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0LmRvbWFpbjtcbiAgICAgICAgICAgIGlmIChkb21haW4pIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBkZWxldGVDdXN0b21HZW5lcmEoZG9tYWluKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGFkZEN1c3RvbUdlbmVyYSgpIHtcbiAgICBjb25zdCBkb21haW5JbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduZXctZ2VuZXJhLWRvbWFpbicpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgY29uc3QgY2F0ZWdvcnlJbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduZXctZ2VuZXJhLWNhdGVnb3J5JykgYXMgSFRNTElucHV0RWxlbWVudDtcblxuICAgIGlmICghZG9tYWluSW5wdXQgfHwgIWNhdGVnb3J5SW5wdXQpIHJldHVybjtcblxuICAgIGNvbnN0IGRvbWFpbiA9IGRvbWFpbklucHV0LnZhbHVlLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IGNhdGVnb3J5ID0gY2F0ZWdvcnlJbnB1dC52YWx1ZS50cmltKCk7XG5cbiAgICBpZiAoIWRvbWFpbiB8fCAhY2F0ZWdvcnkpIHtcbiAgICAgICAgYWxlcnQoXCJQbGVhc2UgZW50ZXIgYm90aCBkb21haW4gYW5kIGNhdGVnb3J5LlwiKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxvZ0luZm8oXCJBZGRpbmcgY3VzdG9tIGdlbmVyYVwiLCB7IGRvbWFpbiwgY2F0ZWdvcnkgfSk7XG5cbiAgICB0cnkge1xuICAgICAgICAvLyBGZXRjaCBjdXJyZW50IHRvIG1lcmdlXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9hZFByZWZlcmVuY2VzJyB9KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgIGNvbnN0IHByZWZzID0gcmVzcG9uc2UuZGF0YSBhcyBQcmVmZXJlbmNlcztcbiAgICAgICAgICAgIGNvbnN0IG5ld0N1c3RvbUdlbmVyYSA9IHsgLi4uKHByZWZzLmN1c3RvbUdlbmVyYSB8fCB7fSksIFtkb21haW5dOiBjYXRlZ29yeSB9O1xuXG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3NhdmVQcmVmZXJlbmNlcycsXG4gICAgICAgICAgICAgICAgcGF5bG9hZDogeyBjdXN0b21HZW5lcmE6IG5ld0N1c3RvbUdlbmVyYSB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgZG9tYWluSW5wdXQudmFsdWUgPSAnJztcbiAgICAgICAgICAgIGNhdGVnb3J5SW5wdXQudmFsdWUgPSAnJztcbiAgICAgICAgICAgIGxvYWRDdXN0b21HZW5lcmEoKTtcbiAgICAgICAgICAgIGxvYWRUYWJzKCk7IC8vIFJlZnJlc2ggdGFicyB0byBhcHBseSBuZXcgY2xhc3NpZmljYXRpb24gaWYgcmVsZXZhbnRcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBhZGQgY3VzdG9tIGdlbmVyYVwiLCBlKTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRlbGV0ZUN1c3RvbUdlbmVyYShkb21haW46IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICAgIGxvZ0luZm8oXCJEZWxldGluZyBjdXN0b20gZ2VuZXJhXCIsIHsgZG9tYWluIH0pO1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvYWRQcmVmZXJlbmNlcycgfSk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmcyA9IHJlc3BvbnNlLmRhdGEgYXMgUHJlZmVyZW5jZXM7XG4gICAgICAgICAgICBjb25zdCBuZXdDdXN0b21HZW5lcmEgPSB7IC4uLihwcmVmcy5jdXN0b21HZW5lcmEgfHwge30pIH07XG4gICAgICAgICAgICBkZWxldGUgbmV3Q3VzdG9tR2VuZXJhW2RvbWFpbl07XG5cbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnc2F2ZVByZWZlcmVuY2VzJyxcbiAgICAgICAgICAgICAgICBwYXlsb2FkOiB7IGN1c3RvbUdlbmVyYTogbmV3Q3VzdG9tR2VuZXJhIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBsb2FkQ3VzdG9tR2VuZXJhKCk7XG4gICAgICAgICAgICBsb2FkVGFicygpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGRlbGV0ZSBjdXN0b20gZ2VuZXJhXCIsIGUpO1xuICAgIH1cbn1cblxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZXZlbnQpID0+IHtcbiAgICBjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgIGlmICh0YXJnZXQgJiYgdGFyZ2V0LmlkID09PSAnYWRkLWdlbmVyYS1idG4nKSB7XG4gICAgICAgIGFkZEN1c3RvbUdlbmVyYSgpO1xuICAgIH1cbn0pO1xuXG5hc3luYyBmdW5jdGlvbiBsb2FkVGFicygpIHtcbiAgbG9nSW5mbyhcIkxvYWRpbmcgdGFicyBmb3IgRGV2VG9vbHNcIik7XG4gIGNvbnN0IHRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7fSk7XG4gIGN1cnJlbnRUYWJzID0gdGFicztcblxuICBjb25zdCB0b3RhbFRhYnNFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd0b3RhbFRhYnMnKTtcbiAgaWYgKHRvdGFsVGFic0VsKSB7XG4gICAgdG90YWxUYWJzRWwudGV4dENvbnRlbnQgPSB0YWJzLmxlbmd0aC50b1N0cmluZygpO1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgbWFwIG9mIHRhYiBJRCB0byB0aXRsZSBmb3IgcGFyZW50IGxvb2t1cFxuICB0YWJUaXRsZXMuY2xlYXIoKTtcbiAgdGFicy5mb3JFYWNoKHRhYiA9PiB7XG4gICAgaWYgKHRhYi5pZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICB0YWJUaXRsZXMuc2V0KHRhYi5pZCwgdGFiLnRpdGxlIHx8ICdVbnRpdGxlZCcpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gQ29udmVydCB0byBUYWJNZXRhZGF0YSBmb3IgY29udGV4dCBhbmFseXNpc1xuICBjb25zdCBtYXBwZWRUYWJzOiBUYWJNZXRhZGF0YVtdID0gZ2V0TWFwcGVkVGFicygpO1xuXG4gIC8vIEFuYWx5emUgY29udGV4dFxuICB0cnkge1xuICAgICAgY3VycmVudENvbnRleHRNYXAgPSBhd2FpdCBhbmFseXplVGFiQ29udGV4dChtYXBwZWRUYWJzKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gYW5hbHl6ZSBjb250ZXh0XCIsIGVycm9yKTtcbiAgICAgIGN1cnJlbnRDb250ZXh0TWFwLmNsZWFyKCk7XG4gIH1cblxuICByZW5kZXJUYWJsZSgpO1xufVxuXG5mdW5jdGlvbiBnZXRNYXBwZWRUYWJzKCk6IFRhYk1ldGFkYXRhW10ge1xuICByZXR1cm4gY3VycmVudFRhYnNcbiAgICAubWFwKHRhYiA9PiB7XG4gICAgICAgIGNvbnN0IG1ldGFkYXRhID0gbWFwQ2hyb21lVGFiKHRhYik7XG4gICAgICAgIGlmICghbWV0YWRhdGEpIHJldHVybiBudWxsO1xuXG4gICAgICAgIGNvbnN0IGNvbnRleHRSZXN1bHQgPSBjdXJyZW50Q29udGV4dE1hcC5nZXQobWV0YWRhdGEuaWQpO1xuICAgICAgICBpZiAoY29udGV4dFJlc3VsdCkge1xuICAgICAgICAgICAgbWV0YWRhdGEuY29udGV4dCA9IGNvbnRleHRSZXN1bHQuY29udGV4dDtcbiAgICAgICAgICAgIG1ldGFkYXRhLmNvbnRleHREYXRhID0gY29udGV4dFJlc3VsdC5kYXRhO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtZXRhZGF0YTtcbiAgICB9KVxuICAgIC5maWx0ZXIoKHQpOiB0IGlzIFRhYk1ldGFkYXRhID0+IHQgIT09IG51bGwpO1xufVxuXG5mdW5jdGlvbiBoYW5kbGVTb3J0KGtleTogc3RyaW5nKSB7XG4gIGlmIChzb3J0S2V5ID09PSBrZXkpIHtcbiAgICBzb3J0RGlyZWN0aW9uID0gc29ydERpcmVjdGlvbiA9PT0gJ2FzYycgPyAnZGVzYycgOiAnYXNjJztcbiAgfSBlbHNlIHtcbiAgICBzb3J0S2V5ID0ga2V5O1xuICAgIHNvcnREaXJlY3Rpb24gPSAnYXNjJztcbiAgfVxuICB1cGRhdGVIZWFkZXJTdHlsZXMoKTtcbiAgcmVuZGVyVGFibGUoKTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlSGVhZGVyU3R5bGVzKCkge1xuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCd0aC5zb3J0YWJsZScpLmZvckVhY2godGggPT4ge1xuICAgIHRoLmNsYXNzTGlzdC5yZW1vdmUoJ3NvcnQtYXNjJywgJ3NvcnQtZGVzYycpO1xuICAgIGlmICh0aC5nZXRBdHRyaWJ1dGUoJ2RhdGEta2V5JykgPT09IHNvcnRLZXkpIHtcbiAgICAgIHRoLmNsYXNzTGlzdC5hZGQoc29ydERpcmVjdGlvbiA9PT0gJ2FzYycgPyAnc29ydC1hc2MnIDogJ3NvcnQtZGVzYycpO1xuICAgIH1cbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGdldFNvcnRWYWx1ZSh0YWI6IGNocm9tZS50YWJzLlRhYiwga2V5OiBzdHJpbmcpOiBhbnkge1xuICBzd2l0Y2ggKGtleSkge1xuICAgIGNhc2UgJ3BhcmVudFRpdGxlJzpcbiAgICAgIHJldHVybiB0YWIub3BlbmVyVGFiSWQgPyAodGFiVGl0bGVzLmdldCh0YWIub3BlbmVyVGFiSWQpIHx8ICcnKSA6ICcnO1xuICAgIGNhc2UgJ2dlbnJlJzpcbiAgICAgIHJldHVybiAodGFiLmlkICYmIGN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpPy5kYXRhPy5nZW5yZSkgfHwgJyc7XG4gICAgY2FzZSAnY29udGV4dCc6XG4gICAgICByZXR1cm4gKHRhYi5pZCAmJiBjdXJyZW50Q29udGV4dE1hcC5nZXQodGFiLmlkKT8uY29udGV4dCkgfHwgJyc7XG4gICAgY2FzZSAnc2l0ZU5hbWUnOlxuICAgICAgcmV0dXJuICh0YWIuaWQgJiYgY3VycmVudENvbnRleHRNYXAuZ2V0KHRhYi5pZCk/LmRhdGE/LnNpdGVOYW1lKSB8fCAnJztcbiAgICBjYXNlICdwbGF0Zm9ybSc6XG4gICAgICByZXR1cm4gKHRhYi5pZCAmJiBjdXJyZW50Q29udGV4dE1hcC5nZXQodGFiLmlkKT8uZGF0YT8ucGxhdGZvcm0pIHx8ICcnO1xuICAgIGNhc2UgJ29iamVjdFR5cGUnOlxuICAgICAgcmV0dXJuICh0YWIuaWQgJiYgY3VycmVudENvbnRleHRNYXAuZ2V0KHRhYi5pZCk/LmRhdGE/Lm9iamVjdFR5cGUpIHx8ICcnO1xuICAgIGNhc2UgJ2V4dHJhY3RlZFRpdGxlJzpcbiAgICAgIHJldHVybiAodGFiLmlkICYmIGN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpPy5kYXRhPy50aXRsZSkgfHwgJyc7XG4gICAgY2FzZSAnYXV0aG9yT3JDcmVhdG9yJzpcbiAgICAgIHJldHVybiAodGFiLmlkICYmIGN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpPy5kYXRhPy5hdXRob3JPckNyZWF0b3IpIHx8ICcnO1xuICAgIGNhc2UgJ3B1Ymxpc2hlZEF0JzpcbiAgICAgIHJldHVybiAodGFiLmlkICYmIGN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpPy5kYXRhPy5wdWJsaXNoZWRBdCkgfHwgJyc7XG4gICAgY2FzZSAnYWN0aXZlJzpcbiAgICAgIHJldHVybiB0YWIuYWN0aXZlID8gMSA6IDA7XG4gICAgY2FzZSAncGlubmVkJzpcbiAgICAgIHJldHVybiB0YWIucGlubmVkID8gMSA6IDA7XG4gICAgY2FzZSAnaWQnOlxuICAgICAgcmV0dXJuIHRhYi5pZCA/PyAtMTtcbiAgICBjYXNlICdpbmRleCc6XG4gICAgICByZXR1cm4gdGFiLmluZGV4O1xuICAgIGNhc2UgJ3dpbmRvd0lkJzpcbiAgICAgIHJldHVybiB0YWIud2luZG93SWQ7XG4gICAgY2FzZSAnZ3JvdXBJZCc6XG4gICAgICByZXR1cm4gdGFiLmdyb3VwSWQ7XG4gICAgY2FzZSAnb3BlbmVyVGFiSWQnOlxuICAgICAgcmV0dXJuIHRhYi5vcGVuZXJUYWJJZCA/PyAtMTtcbiAgICBjYXNlICdsYXN0QWNjZXNzZWQnOlxuICAgICAgLy8gbGFzdEFjY2Vzc2VkIGlzIGEgdmFsaWQgcHJvcGVydHkgb2YgY2hyb21lLnRhYnMuVGFiIGluIG1vZGVybiBkZWZpbml0aW9uc1xuICAgICAgcmV0dXJuICh0YWIgYXMgY2hyb21lLnRhYnMuVGFiICYgeyBsYXN0QWNjZXNzZWQ/OiBudW1iZXIgfSkubGFzdEFjY2Vzc2VkIHx8IDA7XG4gICAgY2FzZSAndGl0bGUnOlxuICAgICAgcmV0dXJuICh0YWIudGl0bGUgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgY2FzZSAndXJsJzpcbiAgICAgIHJldHVybiAodGFiLnVybCB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgICBjYXNlICdzdGF0dXMnOlxuICAgICAgcmV0dXJuICh0YWIuc3RhdHVzIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gJyc7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVuZGVyVGFibGUoKSB7XG4gIGNvbnN0IHRib2R5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI3RhYnNUYWJsZSB0Ym9keScpO1xuICBpZiAoIXRib2R5KSByZXR1cm47XG5cbiAgLy8gMS4gRmlsdGVyXG4gIGxldCB0YWJzRGlzcGxheSA9IGN1cnJlbnRUYWJzLmZpbHRlcih0YWIgPT4ge1xuICAgICAgLy8gR2xvYmFsIFNlYXJjaFxuICAgICAgaWYgKGdsb2JhbFNlYXJjaFF1ZXJ5KSB7XG4gICAgICAgICAgY29uc3QgcSA9IGdsb2JhbFNlYXJjaFF1ZXJ5LnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgY29uc3Qgc2VhcmNoYWJsZVRleHQgPSBgJHt0YWIudGl0bGV9ICR7dGFiLnVybH0gJHt0YWIuaWR9YC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgIGlmICghc2VhcmNoYWJsZVRleHQuaW5jbHVkZXMocSkpIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgLy8gQ29sdW1uIEZpbHRlcnNcbiAgICAgIGZvciAoY29uc3QgW2tleSwgZmlsdGVyXSBvZiBPYmplY3QuZW50cmllcyhjb2x1bW5GaWx0ZXJzKSkge1xuICAgICAgICAgIGlmICghZmlsdGVyKSBjb250aW51ZTtcbiAgICAgICAgICBjb25zdCB2YWwgPSBTdHJpbmcoZ2V0U29ydFZhbHVlKHRhYiwga2V5KSkudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICBpZiAoIXZhbC5pbmNsdWRlcyhmaWx0ZXIudG9Mb3dlckNhc2UoKSkpIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRydWU7XG4gIH0pO1xuXG4gIC8vIDIuIFNvcnRcbiAgaWYgKHNvcnRLZXkpIHtcbiAgICB0YWJzRGlzcGxheS5zb3J0KChhLCBiKSA9PiB7XG4gICAgICBsZXQgdmFsQTogYW55ID0gZ2V0U29ydFZhbHVlKGEsIHNvcnRLZXkhKTtcbiAgICAgIGxldCB2YWxCOiBhbnkgPSBnZXRTb3J0VmFsdWUoYiwgc29ydEtleSEpO1xuXG4gICAgICBpZiAodmFsQSA8IHZhbEIpIHJldHVybiBzb3J0RGlyZWN0aW9uID09PSAnYXNjJyA/IC0xIDogMTtcbiAgICAgIGlmICh2YWxBID4gdmFsQikgcmV0dXJuIHNvcnREaXJlY3Rpb24gPT09ICdhc2MnID8gMSA6IC0xO1xuICAgICAgcmV0dXJuIDA7XG4gICAgfSk7XG4gIH1cblxuICB0Ym9keS5pbm5lckhUTUwgPSAnJzsgLy8gQ2xlYXIgZXhpc3Rpbmcgcm93c1xuXG4gIC8vIDMuIFJlbmRlclxuICBjb25zdCB2aXNpYmxlQ29scyA9IGNvbHVtbnMuZmlsdGVyKGMgPT4gYy52aXNpYmxlKTtcblxuICB0YWJzRGlzcGxheS5mb3JFYWNoKHRhYiA9PiB7XG4gICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndHInKTtcblxuICAgIHZpc2libGVDb2xzLmZvckVhY2goY29sID0+IHtcbiAgICAgICAgY29uc3QgdGQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0ZCcpO1xuICAgICAgICBpZiAoY29sLmtleSA9PT0gJ3RpdGxlJykgdGQuY2xhc3NMaXN0LmFkZCgndGl0bGUtY2VsbCcpO1xuICAgICAgICBpZiAoY29sLmtleSA9PT0gJ3VybCcpIHRkLmNsYXNzTGlzdC5hZGQoJ3VybC1jZWxsJyk7XG5cbiAgICAgICAgY29uc3QgdmFsID0gZ2V0Q2VsbFZhbHVlKHRhYiwgY29sLmtleSk7XG5cbiAgICAgICAgaWYgKHZhbCBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSB7XG4gICAgICAgICAgICB0ZC5hcHBlbmRDaGlsZCh2YWwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGQuaW5uZXJIVE1MID0gdmFsO1xuICAgICAgICAgICAgdGQudGl0bGUgPSBzdHJpcEh0bWwoU3RyaW5nKHZhbCkpO1xuICAgICAgICB9XG4gICAgICAgIHJvdy5hcHBlbmRDaGlsZCh0ZCk7XG4gICAgfSk7XG5cbiAgICB0Ym9keS5hcHBlbmRDaGlsZChyb3cpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gc3RyaXBIdG1sKGh0bWw6IHN0cmluZykge1xuICAgIGxldCB0bXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiRElWXCIpO1xuICAgIHRtcC5pbm5lckhUTUwgPSBodG1sO1xuICAgIHJldHVybiB0bXAudGV4dENvbnRlbnQgfHwgdG1wLmlubmVyVGV4dCB8fCBcIlwiO1xufVxuXG5cbmZ1bmN0aW9uIGdldENlbGxWYWx1ZSh0YWI6IGNocm9tZS50YWJzLlRhYiwga2V5OiBzdHJpbmcpOiBzdHJpbmcgfCBIVE1MRWxlbWVudCB7XG4gICAgY29uc3QgZXNjYXBlID0gZXNjYXBlSHRtbDtcblxuICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICAgIGNhc2UgJ2lkJzogcmV0dXJuIFN0cmluZyh0YWIuaWQgPz8gJ04vQScpO1xuICAgICAgICBjYXNlICdpbmRleCc6IHJldHVybiBTdHJpbmcodGFiLmluZGV4KTtcbiAgICAgICAgY2FzZSAnd2luZG93SWQnOiByZXR1cm4gU3RyaW5nKHRhYi53aW5kb3dJZCk7XG4gICAgICAgIGNhc2UgJ2dyb3VwSWQnOiByZXR1cm4gU3RyaW5nKHRhYi5ncm91cElkKTtcbiAgICAgICAgY2FzZSAndGl0bGUnOiByZXR1cm4gZXNjYXBlKHRhYi50aXRsZSB8fCAnJyk7XG4gICAgICAgIGNhc2UgJ3VybCc6IHJldHVybiBlc2NhcGUodGFiLnVybCB8fCAnJyk7XG4gICAgICAgIGNhc2UgJ3N0YXR1cyc6IHJldHVybiBlc2NhcGUodGFiLnN0YXR1cyB8fCAnJyk7XG4gICAgICAgIGNhc2UgJ2FjdGl2ZSc6IHJldHVybiB0YWIuYWN0aXZlID8gJ1llcycgOiAnTm8nO1xuICAgICAgICBjYXNlICdwaW5uZWQnOiByZXR1cm4gdGFiLnBpbm5lZCA/ICdZZXMnIDogJ05vJztcbiAgICAgICAgY2FzZSAnb3BlbmVyVGFiSWQnOiByZXR1cm4gU3RyaW5nKHRhYi5vcGVuZXJUYWJJZCA/PyAnLScpO1xuICAgICAgICBjYXNlICdwYXJlbnRUaXRsZSc6XG4gICAgICAgICAgICAgcmV0dXJuIGVzY2FwZSh0YWIub3BlbmVyVGFiSWQgPyAodGFiVGl0bGVzLmdldCh0YWIub3BlbmVyVGFiSWQpIHx8ICdVbmtub3duJykgOiAnLScpO1xuICAgICAgICBjYXNlICdnZW5yZSc6XG4gICAgICAgICAgICAgcmV0dXJuIGVzY2FwZSgodGFiLmlkICYmIGN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpPy5kYXRhPy5nZW5yZSkgfHwgJy0nKTtcbiAgICAgICAgY2FzZSAnY29udGV4dCc6IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRleHRSZXN1bHQgPSB0YWIuaWQgPyBjdXJyZW50Q29udGV4dE1hcC5nZXQodGFiLmlkKSA6IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGlmICghY29udGV4dFJlc3VsdCkgcmV0dXJuICdOL0EnO1xuXG4gICAgICAgICAgICBsZXQgY2VsbFN0eWxlID0gJyc7XG4gICAgICAgICAgICBsZXQgYWlDb250ZXh0ID0gJyc7XG5cbiAgICAgICAgICAgIGlmIChjb250ZXh0UmVzdWx0LnN0YXR1cyA9PT0gJ1JFU1RSSUNURUQnKSB7XG4gICAgICAgICAgICAgICAgYWlDb250ZXh0ID0gJ1VuZXh0cmFjdGFibGUgKHJlc3RyaWN0ZWQpJztcbiAgICAgICAgICAgICAgICBjZWxsU3R5bGUgPSAnY29sb3I6IGdyYXk7IGZvbnQtc3R5bGU6IGl0YWxpYzsnO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjb250ZXh0UmVzdWx0LmVycm9yKSB7XG4gICAgICAgICAgICAgICAgYWlDb250ZXh0ID0gYEVycm9yICgke2NvbnRleHRSZXN1bHQuZXJyb3J9KWA7XG4gICAgICAgICAgICAgICAgY2VsbFN0eWxlID0gJ2NvbG9yOiByZWQ7JztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY29udGV4dFJlc3VsdC5zb3VyY2UgPT09ICdFeHRyYWN0aW9uJykge1xuICAgICAgICAgICAgICAgIGFpQ29udGV4dCA9IGAke2NvbnRleHRSZXN1bHQuY29udGV4dH0gKEV4dHJhY3RlZClgO1xuICAgICAgICAgICAgICAgIGNlbGxTdHlsZSA9ICdjb2xvcjogZ3JlZW47IGZvbnQtd2VpZ2h0OiBib2xkOyc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICBhaUNvbnRleHQgPSBgJHtjb250ZXh0UmVzdWx0LmNvbnRleHR9YDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICBjb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcbiAgICAgICAgICAgIGNvbnRhaW5lci5zdHlsZS5mbGV4RGlyZWN0aW9uID0gJ2NvbHVtbic7XG4gICAgICAgICAgICBjb250YWluZXIuc3R5bGUuZ2FwID0gJzVweCc7XG5cbiAgICAgICAgICAgIGNvbnN0IHN1bW1hcnlEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIHN1bW1hcnlEaXYuc3R5bGUuY3NzVGV4dCA9IGNlbGxTdHlsZTtcbiAgICAgICAgICAgIHN1bW1hcnlEaXYudGV4dENvbnRlbnQgPSBhaUNvbnRleHQ7XG4gICAgICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoc3VtbWFyeURpdik7XG5cbiAgICAgICAgICAgIGlmIChjb250ZXh0UmVzdWx0LmRhdGEpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkZXRhaWxzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncHJlJyk7XG4gICAgICAgICAgICAgICAgZGV0YWlscy5zdHlsZS5jc3NUZXh0ID0gJ21heC1oZWlnaHQ6IDMwMHB4OyBvdmVyZmxvdzogYXV0bzsgZm9udC1zaXplOiAxMXB4OyB0ZXh0LWFsaWduOiBsZWZ0OyBiYWNrZ3JvdW5kOiAjZjVmNWY1OyBwYWRkaW5nOiA1cHg7IGJvcmRlcjogMXB4IHNvbGlkICNkZGQ7IG1hcmdpbjogMDsgd2hpdGUtc3BhY2U6IHByZS13cmFwOyBmb250LWZhbWlseTogbW9ub3NwYWNlOyc7XG4gICAgICAgICAgICAgICAgZGV0YWlscy50ZXh0Q29udGVudCA9IEpTT04uc3RyaW5naWZ5KGNvbnRleHRSZXN1bHQuZGF0YSwgbnVsbCwgMik7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGRldGFpbHMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gY29udGFpbmVyO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgJ2xhc3RBY2Nlc3NlZCc6XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGUoKHRhYiBhcyBhbnkpLmxhc3RBY2Nlc3NlZCB8fCAwKS50b0xvY2FsZVN0cmluZygpO1xuICAgICAgICBjYXNlICdhY3Rpb25zJzoge1xuICAgICAgICAgICAgY29uc3Qgd3JhcHBlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgd3JhcHBlci5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImdvdG8tdGFiLWJ0blwiIGRhdGEtdGFiLWlkPVwiJHt0YWIuaWR9XCIgZGF0YS13aW5kb3ctaWQ9XCIke3RhYi53aW5kb3dJZH1cIj5HbzwvYnV0dG9uPlxuICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJjbG9zZS10YWItYnRuXCIgZGF0YS10YWItaWQ9XCIke3RhYi5pZH1cIiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6ICNkYzM1NDU7IG1hcmdpbi1sZWZ0OiAycHg7XCI+WDwvYnV0dG9uPlxuICAgICAgICAgICAgYDtcbiAgICAgICAgICAgIHJldHVybiB3cmFwcGVyO1xuICAgICAgICB9XG4gICAgICAgIGRlZmF1bHQ6IHJldHVybiAnJztcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHJlbmRlckFsZ29yaXRobXNWaWV3KCkge1xuICAvLyBVc2UgdXBkYXRlZCBzdHJhdGVnaWVzIGxpc3QgaW5jbHVkaW5nIGN1c3RvbSBvbmVzXG4gIHJlbmRlclN0cmF0ZWd5Q29uZmlnKCk7XG5cbiAgY29uc3QgZ3JvdXBpbmdSZWYgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JvdXBpbmctcmVmJyk7XG4gIGNvbnN0IHNvcnRpbmdSZWYgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc29ydGluZy1yZWYnKTtcblxuICBpZiAoZ3JvdXBpbmdSZWYpIHtcbiAgICAgIC8vIFJlLXJlbmRlciBiZWNhdXNlIHN0cmF0ZWd5IGxpc3QgbWlnaHQgY2hhbmdlXG4gICAgICBjb25zdCBhbGxTdHJhdGVnaWVzOiBTdHJhdGVneURlZmluaXRpb25bXSA9IGdldFN0cmF0ZWdpZXMobG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcbiAgICAgIGNvbnN0IGdyb3VwaW5ncyA9IGFsbFN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gcy5pc0dyb3VwaW5nKTtcblxuICAgICAgZ3JvdXBpbmdSZWYuaW5uZXJIVE1MID0gZ3JvdXBpbmdzLm1hcChnID0+IHtcbiAgICAgICAgIGNvbnN0IGlzQ3VzdG9tID0gbG9jYWxDdXN0b21TdHJhdGVnaWVzLnNvbWUocyA9PiBzLmlkID09PSBnLmlkKTtcbiAgICAgICAgIGxldCBkZXNjID0gXCJCdWlsdC1pbiBzdHJhdGVneVwiO1xuICAgICAgICAgaWYgKGlzQ3VzdG9tKSBkZXNjID0gXCJDdXN0b20gc3RyYXRlZ3kgZGVmaW5lZCBieSBydWxlcy5cIjtcbiAgICAgICAgIGVsc2UgaWYgKGcuaWQgPT09ICdkb21haW4nKSBkZXNjID0gJ0dyb3VwcyB0YWJzIGJ5IHRoZWlyIGRvbWFpbiBuYW1lLic7XG4gICAgICAgICBlbHNlIGlmIChnLmlkID09PSAndG9waWMnKSBkZXNjID0gJ0dyb3VwcyBiYXNlZCBvbiBrZXl3b3JkcyBpbiB0aGUgdGl0bGUuJztcblxuICAgICAgICAgcmV0dXJuIGBcbiAgICAgICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktaXRlbVwiPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInN0cmF0ZWd5LW5hbWVcIj4ke2cubGFiZWx9ICgke2cuaWR9KSAke2lzQ3VzdG9tID8gJzxzcGFuIHN0eWxlPVwiY29sb3I6IGJsdWU7IGZvbnQtc2l6ZTogMC44ZW07XCI+Q3VzdG9tPC9zcGFuPicgOiAnJ308L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1kZXNjXCI+JHtkZXNjfTwvZGl2PlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInN0cmF0ZWd5LXZpZXctYnRuXCIgZGF0YS10eXBlPVwiZ3JvdXBpbmdcIiBkYXRhLW5hbWU9XCIke2cuaWR9XCI+VmlldyBMb2dpYzwvYnV0dG9uPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICBgO1xuICAgICAgfSkuam9pbignJyk7XG4gIH1cblxuICBpZiAoc29ydGluZ1JlZikge1xuICAgIC8vIFJlLXJlbmRlciBzb3J0aW5nIHN0cmF0ZWdpZXMgdG9vXG4gICAgY29uc3QgYWxsU3RyYXRlZ2llczogU3RyYXRlZ3lEZWZpbml0aW9uW10gPSBnZXRTdHJhdGVnaWVzKGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgY29uc3Qgc29ydGluZ3MgPSBhbGxTdHJhdGVnaWVzLmZpbHRlcihzID0+IHMuaXNTb3J0aW5nKTtcblxuICAgIHNvcnRpbmdSZWYuaW5uZXJIVE1MID0gc29ydGluZ3MubWFwKHMgPT4ge1xuICAgICAgICBsZXQgZGVzYyA9IFwiQnVpbHQtaW4gc29ydGluZ1wiO1xuICAgICAgICBpZiAocy5pZCA9PT0gJ3JlY2VuY3knKSBkZXNjID0gJ1NvcnRzIGJ5IGxhc3QgYWNjZXNzZWQgdGltZSAobW9zdCByZWNlbnQgZmlyc3QpLic7XG4gICAgICAgIGVsc2UgaWYgKHMuaWQgPT09ICduZXN0aW5nJykgZGVzYyA9ICdTb3J0cyBiYXNlZCBvbiBoaWVyYXJjaHkgKHJvb3RzIHZzIGNoaWxkcmVuKS4nO1xuICAgICAgICBlbHNlIGlmIChzLmlkID09PSAncGlubmVkJykgZGVzYyA9ICdLZWVwcyBwaW5uZWQgdGFicyBhdCB0aGUgYmVnaW5uaW5nIG9mIHRoZSBsaXN0Lic7XG5cbiAgICAgICAgcmV0dXJuIGBcbiAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1pdGVtXCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1uYW1lXCI+JHtzLmxhYmVsfTwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktZGVzY1wiPiR7ZGVzY308L2Rpdj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInN0cmF0ZWd5LXZpZXctYnRuXCIgZGF0YS10eXBlPVwic29ydGluZ1wiIGRhdGEtbmFtZT1cIiR7cy5pZH1cIj5WaWV3IExvZ2ljPC9idXR0b24+XG4gICAgICA8L2Rpdj5cbiAgICBgO1xuICAgIH0pLmpvaW4oJycpO1xuICB9XG5cbiAgY29uc3QgcmVnaXN0cnlSZWYgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncmVnaXN0cnktcmVmJyk7XG4gIGlmIChyZWdpc3RyeVJlZiAmJiByZWdpc3RyeVJlZi5jaGlsZHJlbi5sZW5ndGggPT09IDApIHtcbiAgICAgIHJlZ2lzdHJ5UmVmLmlubmVySFRNTCA9IGBcbiAgICAgICAgPGRpdiBjbGFzcz1cInN0cmF0ZWd5LWl0ZW1cIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1uYW1lXCI+R2VuZXJhIFJlZ2lzdHJ5PC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktZGVzY1wiPlN0YXRpYyBsb29rdXAgdGFibGUgZm9yIGRvbWFpbiBjbGFzc2lmaWNhdGlvbiAoYXBwcm94ICR7T2JqZWN0LmtleXMoR0VORVJBX1JFR0lTVFJZKS5sZW5ndGh9IGVudHJpZXMpLjwvZGl2PlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInN0cmF0ZWd5LXZpZXctYnRuXCIgZGF0YS10eXBlPVwicmVnaXN0cnlcIiBkYXRhLW5hbWU9XCJnZW5lcmFcIj5WaWV3IFRhYmxlPC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuICAgICAgYDtcbiAgfVxufVxuXG5mdW5jdGlvbiByZW5kZXJTdHJhdGVneUNvbmZpZygpIHtcbiAgY29uc3QgZ3JvdXBpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1ncm91cGluZy1saXN0Jyk7XG4gIGNvbnN0IHNvcnRpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1zb3J0aW5nLWxpc3QnKTtcblxuICAvLyBVc2UgZHluYW1pYyBzdHJhdGVneSBsaXN0XG4gIGNvbnN0IHN0cmF0ZWdpZXM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0gZ2V0U3RyYXRlZ2llcyhsb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuXG4gIGlmIChncm91cGluZ0xpc3QpIHtcbiAgICAgIGNvbnN0IGdyb3VwaW5nU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gcy5pc0dyb3VwaW5nKTtcbiAgICAgIC8vIFdlIHNob3VsZCBwcmVzZXJ2ZSBjaGVja2VkIHN0YXRlIGlmIHJlLXJlbmRlcmluZywgYnV0IGZvciBub3cganVzdCBkZWZhdWx0aW5nIGlzIG9rYXkgb3IgcmVhZGluZyBjdXJyZW50IERPTVxuICAgICAgLy8gU2ltcGxpZmljYXRpb246IGp1c3QgcmUtcmVuZGVyLlxuICAgICAgcmVuZGVyU3RyYXRlZ3lMaXN0KGdyb3VwaW5nTGlzdCwgZ3JvdXBpbmdTdHJhdGVnaWVzLCBbJ2RvbWFpbicsICd0b3BpYyddKTtcbiAgfVxuXG4gIGlmIChzb3J0aW5nTGlzdCkge1xuICAgICAgY29uc3Qgc29ydGluZ1N0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IHMuaXNTb3J0aW5nKTtcbiAgICAgIHJlbmRlclN0cmF0ZWd5TGlzdChzb3J0aW5nTGlzdCwgc29ydGluZ1N0cmF0ZWdpZXMsIFsncGlubmVkJywgJ3JlY2VuY3knXSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVuZGVyU3RyYXRlZ3lMaXN0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHN0cmF0ZWdpZXM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdLCBkZWZhdWx0RW5hYmxlZDogc3RyaW5nW10pIHtcbiAgICBjb250YWluZXIuaW5uZXJIVE1MID0gJyc7XG5cbiAgICAvLyBTb3J0IGVuYWJsZWQgYnkgdGhlaXIgaW5kZXggaW4gZGVmYXVsdEVuYWJsZWRcbiAgICBjb25zdCBlbmFibGVkID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiBkZWZhdWx0RW5hYmxlZC5pbmNsdWRlcyhzLmlkIGFzIHN0cmluZykpO1xuICAgIC8vIFNhZmUgaW5kZXhvZiBjaGVjayBzaW5jZSBpZHMgYXJlIHN0cmluZ3MgaW4gZGVmYXVsdEVuYWJsZWRcbiAgICBlbmFibGVkLnNvcnQoKGEsIGIpID0+IGRlZmF1bHRFbmFibGVkLmluZGV4T2YoYS5pZCBhcyBzdHJpbmcpIC0gZGVmYXVsdEVuYWJsZWQuaW5kZXhPZihiLmlkIGFzIHN0cmluZykpO1xuXG4gICAgY29uc3QgZGlzYWJsZWQgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+ICFkZWZhdWx0RW5hYmxlZC5pbmNsdWRlcyhzLmlkIGFzIHN0cmluZykpO1xuXG4gICAgLy8gSW5pdGlhbCByZW5kZXIgb3JkZXI6IEVuYWJsZWQgKG9yZGVyZWQpIHRoZW4gRGlzYWJsZWRcbiAgICBjb25zdCBvcmRlcmVkID0gWy4uLmVuYWJsZWQsIC4uLmRpc2FibGVkXTtcblxuICAgIG9yZGVyZWQuZm9yRWFjaChzdHJhdGVneSA9PiB7XG4gICAgICAgIGNvbnN0IGlzQ2hlY2tlZCA9IGRlZmF1bHRFbmFibGVkLmluY2x1ZGVzKHN0cmF0ZWd5LmlkKTtcbiAgICAgICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIHJvdy5jbGFzc05hbWUgPSBgc3RyYXRlZ3ktcm93ICR7aXNDaGVja2VkID8gJycgOiAnZGlzYWJsZWQnfWA7XG4gICAgICAgIHJvdy5kYXRhc2V0LmlkID0gc3RyYXRlZ3kuaWQ7XG4gICAgICAgIHJvdy5kcmFnZ2FibGUgPSB0cnVlO1xuXG4gICAgICAgIHJvdy5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZHJhZy1oYW5kbGVcIj5cdTI2MzA8L2Rpdj5cbiAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiAke2lzQ2hlY2tlZCA/ICdjaGVja2VkJyA6ICcnfT5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwic3RyYXRlZ3ktbGFiZWxcIj4ke3N0cmF0ZWd5LmxhYmVsfTwvc3Bhbj5cbiAgICAgICAgYDtcblxuICAgICAgICAvLyBBZGQgbGlzdGVuZXJzXG4gICAgICAgIGNvbnN0IGNoZWNrYm94ID0gcm93LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJjaGVja2JveFwiXScpO1xuICAgICAgICBjaGVja2JveD8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKGUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNoZWNrZWQgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZDtcbiAgICAgICAgICAgIHJvdy5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsICFjaGVja2VkKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgYWRkRG5ETGlzdGVuZXJzKHJvdywgY29udGFpbmVyKTtcblxuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQocm93KTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gYWRkRG5ETGlzdGVuZXJzKHJvdzogSFRNTEVsZW1lbnQsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgcm93LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdzdGFydCcsIChlKSA9PiB7XG4gICAgcm93LmNsYXNzTGlzdC5hZGQoJ2RyYWdnaW5nJyk7XG4gICAgaWYgKGUuZGF0YVRyYW5zZmVyKSB7XG4gICAgICAgIGUuZGF0YVRyYW5zZmVyLmVmZmVjdEFsbG93ZWQgPSAnbW92ZSc7XG4gICAgICAgIC8vIFNldCBhIHRyYW5zcGFyZW50IGltYWdlIG9yIHNpbWlsYXIgaWYgZGVzaXJlZCwgYnV0IGRlZmF1bHQgaXMgdXN1YWxseSBmaW5lXG4gICAgfVxuICB9KTtcblxuICByb3cuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ2VuZCcsICgpID0+IHtcbiAgICByb3cuY2xhc3NMaXN0LnJlbW92ZSgnZHJhZ2dpbmcnKTtcbiAgfSk7XG5cbiAgLy8gVGhlIGNvbnRhaW5lciBoYW5kbGVzIHRoZSBkcm9wIHpvbmUgbG9naWMgdmlhIGRyYWdvdmVyXG4gIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdkcmFnb3ZlcicsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IGFmdGVyRWxlbWVudCA9IGdldERyYWdBZnRlckVsZW1lbnQoY29udGFpbmVyLCBlLmNsaWVudFksICcuc3RyYXRlZ3ktcm93Om5vdCguZHJhZ2dpbmcpJyk7XG4gICAgY29uc3QgZHJhZ2dhYmxlID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5kcmFnZ2luZycpO1xuICAgIGlmIChkcmFnZ2FibGUpIHtcbiAgICAgIGlmIChhZnRlckVsZW1lbnQgPT0gbnVsbCkge1xuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZHJhZ2dhYmxlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnRhaW5lci5pbnNlcnRCZWZvcmUoZHJhZ2dhYmxlLCBhZnRlckVsZW1lbnQpO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG59XG5cbmZ1bmN0aW9uIHNob3dNb2RhbCh0aXRsZTogc3RyaW5nLCBjb250ZW50OiBIVE1MRWxlbWVudCB8IHN0cmluZykge1xuICAgIGNvbnN0IG1vZGFsT3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIG1vZGFsT3ZlcmxheS5jbGFzc05hbWUgPSAnbW9kYWwtb3ZlcmxheSc7XG4gICAgbW9kYWxPdmVybGF5LmlubmVySFRNTCA9IGBcbiAgICAgICAgPGRpdiBjbGFzcz1cIm1vZGFsXCI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwibW9kYWwtaGVhZGVyXCI+XG4gICAgICAgICAgICAgICAgPGgzPiR7ZXNjYXBlSHRtbCh0aXRsZSl9PC9oMz5cbiAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwibW9kYWwtY2xvc2VcIj4mdGltZXM7PC9idXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1jb250ZW50XCI+PC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgIGA7XG5cbiAgICBjb25zdCBjb250ZW50Q29udGFpbmVyID0gbW9kYWxPdmVybGF5LnF1ZXJ5U2VsZWN0b3IoJy5tb2RhbC1jb250ZW50JykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgaWYgKHR5cGVvZiBjb250ZW50ID09PSAnc3RyaW5nJykge1xuICAgICAgICBjb250ZW50Q29udGFpbmVyLmlubmVySFRNTCA9IGNvbnRlbnQ7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZChjb250ZW50KTtcbiAgICB9XG5cbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG1vZGFsT3ZlcmxheSk7XG5cbiAgICBjb25zdCBjbG9zZUJ0biA9IG1vZGFsT3ZlcmxheS5xdWVyeVNlbGVjdG9yKCcubW9kYWwtY2xvc2UnKTtcbiAgICBjbG9zZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQobW9kYWxPdmVybGF5KTtcbiAgICB9KTtcblxuICAgIG1vZGFsT3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgIGlmIChlLnRhcmdldCA9PT0gbW9kYWxPdmVybGF5KSB7XG4gICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZChtb2RhbE92ZXJsYXkpO1xuICAgICAgICB9XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIHNob3dTdHJhdGVneURldGFpbHModHlwZTogc3RyaW5nLCBuYW1lOiBzdHJpbmcpIHtcbiAgICBsZXQgY29udGVudCA9IFwiXCI7XG4gICAgbGV0IHRpdGxlID0gYCR7bmFtZX0gKCR7dHlwZX0pYDtcblxuICAgIGlmICh0eXBlID09PSAnZ3JvdXBpbmcnKSB7XG4gICAgICAgIGlmIChuYW1lID09PSAnZG9tYWluJykge1xuICAgICAgICAgICAgY29udGVudCA9IGBcbjxoMz5Mb2dpYzogRG9tYWluIEV4dHJhY3Rpb248L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoZG9tYWluRnJvbVVybC50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG48aDM+TG9naWM6IEdyb3VwaW5nIEtleTwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChncm91cGluZ0tleS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG4gICAgICAgICAgICBgO1xuICAgICAgICB9IGVsc2UgaWYgKG5hbWUgPT09ICd0b3BpYycpIHtcbiAgICAgICAgICAgIGNvbnRlbnQgPSBgXG48aDM+TG9naWM6IFNlbWFudGljIEJ1Y2tldGluZzwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChzZW1hbnRpY0J1Y2tldC50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG48aDM+TG9naWM6IEdyb3VwaW5nIEtleTwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChncm91cGluZ0tleS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG4gICAgICAgICAgICBgO1xuICAgICAgICB9IGVsc2UgaWYgKG5hbWUgPT09ICdsaW5lYWdlJykge1xuICAgICAgICAgICAgY29udGVudCA9IGBcbjxoMz5Mb2dpYzogTmF2aWdhdGlvbiBLZXk8L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwobmF2aWdhdGlvbktleS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG48aDM+TG9naWM6IEdyb3VwaW5nIEtleTwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChncm91cGluZ0tleS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG4gICAgICAgICAgICBgO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIGN1c3RvbSBzdHJhdGVneSBkZXRhaWxzXG4gICAgICAgICAgICBjb25zdCBjdXN0b20gPSBsb2NhbEN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IG5hbWUpO1xuICAgICAgICAgICAgaWYgKGN1c3RvbSkge1xuICAgICAgICAgICAgICAgIGNvbnRlbnQgPSBgXG48aDM+Q3VzdG9tIFN0cmF0ZWd5OiAke2VzY2FwZUh0bWwoY3VzdG9tLmxhYmVsKX08L2gzPlxuPHA+PGI+Q29uZmlndXJhdGlvbjo8L2I+PC9wPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoSlNPTi5zdHJpbmdpZnkoY3VzdG9tLCBudWxsLCAyKSl9PC9jb2RlPjwvcHJlPlxuPGgzPkxvZ2ljOiBHcm91cGluZyBLZXk8L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoZ3JvdXBpbmdLZXkudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPlxuICAgICAgICAgICAgICAgIGA7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnRlbnQgPSBgXG48aDM+TG9naWM6IEdyb3VwaW5nIEtleTwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChncm91cGluZ0tleS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG4gICAgICAgICAgICAgICAgYDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3NvcnRpbmcnKSB7XG4gICAgICAgIGNvbnRlbnQgPSBgXG48aDM+TG9naWM6IENvbXBhcmlzb24gRnVuY3Rpb248L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoY29tcGFyZUJ5LnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5cbiAgICAgICAgYDtcblxuICAgICAgICBpZiAobmFtZSA9PT0gJ3JlY2VuY3knKSB7XG4gICAgICAgICAgICAgY29udGVudCArPSBgPGgzPkxvZ2ljOiBSZWNlbmN5IFNjb3JlPC9oMz48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChyZWNlbmN5U2NvcmUudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPmA7XG4gICAgICAgIH0gZWxzZSBpZiAobmFtZSA9PT0gJ25lc3RpbmcnKSB7XG4gICAgICAgICAgICAgY29udGVudCArPSBgPGgzPkxvZ2ljOiBIaWVyYXJjaHkgU2NvcmU8L2gzPjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKGhpZXJhcmNoeVNjb3JlLnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5gO1xuICAgICAgICB9IGVsc2UgaWYgKG5hbWUgPT09ICdwaW5uZWQnKSB7XG4gICAgICAgICAgICAgY29udGVudCArPSBgPGgzPkxvZ2ljOiBQaW5uZWQgU2NvcmU8L2gzPjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKHBpbm5lZFNjb3JlLnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5gO1xuICAgICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAncmVnaXN0cnknICYmIG5hbWUgPT09ICdnZW5lcmEnKSB7XG4gICAgICAgIGNvbnN0IGpzb24gPSBKU09OLnN0cmluZ2lmeShHRU5FUkFfUkVHSVNUUlksIG51bGwsIDIpO1xuICAgICAgICBjb250ZW50ID0gYFxuPGgzPkdlbmVyYSBSZWdpc3RyeSBEYXRhPC9oMz5cbjxwPk1hcHBpbmcgb2YgZG9tYWluIG5hbWVzIHRvIGNhdGVnb3JpZXMuPC9wPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoanNvbil9PC9jb2RlPjwvcHJlPlxuICAgICAgICBgO1xuICAgIH1cblxuICAgIHNob3dNb2RhbCh0aXRsZSwgY29udGVudCk7XG59XG5cbmZ1bmN0aW9uIGdldEVuYWJsZWRTdHJhdGVnaWVzRnJvbVVJKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBTb3J0aW5nU3RyYXRlZ3lbXSB7XG4gICAgcmV0dXJuIEFycmF5LmZyb20oY29udGFpbmVyLmNoaWxkcmVuKVxuICAgICAgICAuZmlsdGVyKHJvdyA9PiAocm93LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJjaGVja2JveFwiXScpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQpXG4gICAgICAgIC5tYXAocm93ID0+IChyb3cgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQuaWQgYXMgU29ydGluZ1N0cmF0ZWd5KTtcbn1cblxuZnVuY3Rpb24gcnVuU2ltdWxhdGlvbigpIHtcbiAgY29uc3QgZ3JvdXBpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1ncm91cGluZy1saXN0Jyk7XG4gIGNvbnN0IHNvcnRpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1zb3J0aW5nLWxpc3QnKTtcbiAgY29uc3QgcmVzdWx0Q29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbVJlc3VsdHMnKTtcblxuICBpZiAoIWdyb3VwaW5nTGlzdCB8fCAhc29ydGluZ0xpc3QgfHwgIXJlc3VsdENvbnRhaW5lcikgcmV0dXJuO1xuXG4gIGNvbnN0IGdyb3VwaW5nU3RyYXRzID0gZ2V0RW5hYmxlZFN0cmF0ZWdpZXNGcm9tVUkoZ3JvdXBpbmdMaXN0KTtcbiAgY29uc3Qgc29ydGluZ1N0cmF0cyA9IGdldEVuYWJsZWRTdHJhdGVnaWVzRnJvbVVJKHNvcnRpbmdMaXN0KTtcblxuICAvLyBQcmVwYXJlIGRhdGFcbiAgbGV0IHRhYnMgPSBnZXRNYXBwZWRUYWJzKCk7XG5cbiAgLy8gMS4gU29ydFxuICBpZiAoc29ydGluZ1N0cmF0cy5sZW5ndGggPiAwKSB7XG4gICAgdGFicyA9IHNvcnRUYWJzKHRhYnMsIHNvcnRpbmdTdHJhdHMpO1xuICB9XG5cbiAgLy8gMi4gR3JvdXBcbiAgY29uc3QgZ3JvdXBzID0gZ3JvdXBUYWJzKHRhYnMsIGdyb3VwaW5nU3RyYXRzKTtcblxuICAvLyAzLiBSZW5kZXJcbiAgaWYgKGdyb3Vwcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJlc3VsdENvbnRhaW5lci5pbm5lckhUTUwgPSAnPHA+Tm8gZ3JvdXBzIGNyZWF0ZWQgKGFyZSB0aGVyZSBhbnkgdGFicz8pLjwvcD4nO1xuICAgICAgcmV0dXJuO1xuICB9XG5cbiAgcmVzdWx0Q29udGFpbmVyLmlubmVySFRNTCA9IGdyb3Vwcy5tYXAoZ3JvdXAgPT4gYFxuICAgIDxkaXYgY2xhc3M9XCJncm91cC1yZXN1bHRcIj5cbiAgICAgIDxkaXYgY2xhc3M9XCJncm91cC1oZWFkZXJcIiBzdHlsZT1cImJvcmRlci1sZWZ0OiA1cHggc29saWQgJHtncm91cC5jb2xvcn1cIj5cbiAgICAgICAgPHNwYW4+JHtlc2NhcGVIdG1sKGdyb3VwLmxhYmVsIHx8ICdVbmdyb3VwZWQnKX08L3NwYW4+XG4gICAgICAgIDxzcGFuIGNsYXNzPVwiZ3JvdXAtbWV0YVwiPiR7Z3JvdXAudGFicy5sZW5ndGh9IHRhYnMgJmJ1bGw7IFJlYXNvbjogJHtlc2NhcGVIdG1sKGdyb3VwLnJlYXNvbil9PC9zcGFuPlxuICAgICAgPC9kaXY+XG4gICAgICA8dWwgY2xhc3M9XCJncm91cC10YWJzXCI+XG4gICAgICAgICR7Z3JvdXAudGFicy5tYXAodGFiID0+IGBcbiAgICAgICAgICA8bGkgY2xhc3M9XCJncm91cC10YWItaXRlbVwiPlxuICAgICAgICAgICAgJHt0YWIuZmF2SWNvblVybCA/IGA8aW1nIHNyYz1cIiR7ZXNjYXBlSHRtbCh0YWIuZmF2SWNvblVybCl9XCIgY2xhc3M9XCJ0YWItaWNvblwiIG9uZXJyb3I9XCJ0aGlzLnN0eWxlLmRpc3BsYXk9J25vbmUnXCI+YCA6ICc8ZGl2IGNsYXNzPVwidGFiLWljb25cIj48L2Rpdj4nfVxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJ0aXRsZS1jZWxsXCIgdGl0bGU9XCIke2VzY2FwZUh0bWwodGFiLnRpdGxlKX1cIj4ke2VzY2FwZUh0bWwodGFiLnRpdGxlKX08L3NwYW4+XG4gICAgICAgICAgICA8c3BhbiBzdHlsZT1cImNvbG9yOiAjOTk5OyBmb250LXNpemU6IDAuOGVtOyBtYXJnaW4tbGVmdDogYXV0bztcIj4ke2VzY2FwZUh0bWwobmV3IFVSTCh0YWIudXJsKS5ob3N0bmFtZSl9PC9zcGFuPlxuICAgICAgICAgIDwvbGk+XG4gICAgICAgIGApLmpvaW4oJycpfVxuICAgICAgPC91bD5cbiAgICA8L2Rpdj5cbiAgYCkuam9pbignJyk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGFwcGx5VG9Ccm93c2VyKCkge1xuICAgIGNvbnN0IGdyb3VwaW5nTGlzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaW0tZ3JvdXBpbmctbGlzdCcpO1xuICAgIGNvbnN0IHNvcnRpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1zb3J0aW5nLWxpc3QnKTtcblxuICAgIGlmICghZ3JvdXBpbmdMaXN0IHx8ICFzb3J0aW5nTGlzdCkgcmV0dXJuO1xuXG4gICAgY29uc3QgZ3JvdXBpbmdTdHJhdHMgPSBnZXRFbmFibGVkU3RyYXRlZ2llc0Zyb21VSShncm91cGluZ0xpc3QpO1xuICAgIGNvbnN0IHNvcnRpbmdTdHJhdHMgPSBnZXRFbmFibGVkU3RyYXRlZ2llc0Zyb21VSShzb3J0aW5nTGlzdCk7XG5cbiAgICAvLyBDb21iaW5lIHN0cmF0ZWdpZXMuXG4gICAgLy8gV2UgcHJpb3JpdGl6ZSBncm91cGluZyBzdHJhdGVnaWVzIGZpcnN0LCB0aGVuIHNvcnRpbmcgc3RyYXRlZ2llcyxcbiAgICAvLyBhcyB0aGUgYmFja2VuZCBmaWx0ZXJzIHRoZW0gd2hlbiBwZXJmb3JtaW5nIGFjdGlvbnMuXG4gICAgY29uc3QgYWxsU3RyYXRlZ2llcyA9IFsuLi5ncm91cGluZ1N0cmF0cywgLi4uc29ydGluZ1N0cmF0c107XG5cbiAgICB0cnkge1xuICAgICAgICAvLyAxLiBTYXZlIFByZWZlcmVuY2VzXG4gICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgcGF5bG9hZDogeyBzb3J0aW5nOiBhbGxTdHJhdGVnaWVzIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gMi4gVHJpZ2dlciBBcHBseSBHcm91cGluZyAod2hpY2ggdXNlcyB0aGUgbmV3IHByZWZlcmVuY2VzKVxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgIHR5cGU6ICdhcHBseUdyb3VwaW5nJyxcbiAgICAgICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICAgICAgICBzb3J0aW5nOiBhbGxTdHJhdGVnaWVzIC8vIFBhc3MgZXhwbGljaXRseSB0byBlbnN1cmUgaW1tZWRpYXRlIGVmZmVjdFxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2spIHtcbiAgICAgICAgICAgIGFsZXJ0KFwiQXBwbGllZCBzdWNjZXNzZnVsbHkhXCIpO1xuICAgICAgICAgICAgbG9hZFRhYnMoKTsgLy8gUmVmcmVzaCBkYXRhXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhbGVydChcIkZhaWxlZCB0byBhcHBseTogXCIgKyAocmVzcG9uc2UuZXJyb3IgfHwgJ1Vua25vd24gZXJyb3InKSk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJBcHBseSBmYWlsZWRcIiwgZSk7XG4gICAgICAgIGFsZXJ0KFwiQXBwbHkgZmFpbGVkOiBcIiArIGUpO1xuICAgIH1cbn1cblxuXG5hc3luYyBmdW5jdGlvbiByZW5kZXJMaXZlVmlldygpIHtcbiAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbGl2ZS12aWV3LWNvbnRhaW5lcicpO1xuICAgIGlmICghY29udGFpbmVyKSByZXR1cm47XG5cbiAgICB0cnkge1xuICAgICAgICBjb25zdCB0YWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICAgICAgICBjb25zdCBncm91cHMgPSBhd2FpdCBjaHJvbWUudGFiR3JvdXBzLnF1ZXJ5KHt9KTtcbiAgICAgICAgY29uc3QgZ3JvdXBNYXAgPSBuZXcgTWFwKGdyb3Vwcy5tYXAoZyA9PiBbZy5pZCwgZ10pKTtcblxuICAgICAgICBjb25zdCB3aW5kb3dzID0gbmV3IFNldCh0YWJzLm1hcCh0ID0+IHQud2luZG93SWQpKTtcbiAgICAgICAgY29uc3Qgd2luZG93SWRzID0gQXJyYXkuZnJvbSh3aW5kb3dzKS5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG5cbiAgICAgICAgbGV0IGh0bWwgPSAnPGRpdiBzdHlsZT1cImZvbnQtc2l6ZTogMC45ZW07IGNvbG9yOiAjNjY2OyBtYXJnaW4tYm90dG9tOiAxMHB4O1wiPlNlbGVjdCBpdGVtcyBiZWxvdyB0byBzaW11bGF0ZSBzcGVjaWZpYyBzZWxlY3Rpb24gc3RhdGVzLjwvZGl2Pic7XG5cbiAgICAgICAgZm9yIChjb25zdCB3aW5JZCBvZiB3aW5kb3dJZHMpIHtcbiAgICAgICAgICAgIGNvbnN0IHdpblRhYnMgPSB0YWJzLmZpbHRlcih0ID0+IHQud2luZG93SWQgPT09IHdpbklkKTtcbiAgICAgICAgICAgIGNvbnN0IHdpblNlbGVjdGVkID0gd2luVGFicy5ldmVyeSh0ID0+IHQuaWQgJiYgc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKSk7XG5cbiAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJzZWxlY3RhYmxlLWl0ZW0gJHt3aW5TZWxlY3RlZCA/ICdzZWxlY3RlZCcgOiAnJ31cIiBkYXRhLXR5cGU9XCJ3aW5kb3dcIiBkYXRhLWlkPVwiJHt3aW5JZH1cIiBzdHlsZT1cIm1hcmdpbi1ib3R0b206IDE1cHg7IGJvcmRlci1yYWRpdXM6IDRweDsgcGFkZGluZzogNXB4O1wiPmA7XG4gICAgICAgICAgICBodG1sICs9IGA8ZGl2IHN0eWxlPVwiZm9udC13ZWlnaHQ6IGJvbGQ7XCI+V2luZG93ICR7d2luSWR9PC9kaXY+YDtcblxuICAgICAgICAgICAgLy8gT3JnYW5pemUgYnkgZ3JvdXBcbiAgICAgICAgICAgIGNvbnN0IHdpbkdyb3VwcyA9IG5ldyBNYXA8bnVtYmVyLCBjaHJvbWUudGFicy5UYWJbXT4oKTtcbiAgICAgICAgICAgIGNvbnN0IHVuZ3JvdXBlZDogY2hyb21lLnRhYnMuVGFiW10gPSBbXTtcblxuICAgICAgICAgICAgd2luVGFicy5mb3JFYWNoKHQgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh0Lmdyb3VwSWQgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghd2luR3JvdXBzLmhhcyh0Lmdyb3VwSWQpKSB3aW5Hcm91cHMuc2V0KHQuZ3JvdXBJZCwgW10pO1xuICAgICAgICAgICAgICAgICAgICB3aW5Hcm91cHMuZ2V0KHQuZ3JvdXBJZCkhLnB1c2godCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdW5ncm91cGVkLnB1c2godCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFJlbmRlciBVbmdyb3VwZWRcbiAgICAgICAgICAgIGlmICh1bmdyb3VwZWQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICBodG1sICs9IGA8ZGl2IHN0eWxlPVwibWFyZ2luLWxlZnQ6IDEwcHg7IG1hcmdpbi10b3A6IDVweDtcIj5gO1xuICAgICAgICAgICAgICAgICBodG1sICs9IGA8ZGl2IHN0eWxlPVwiZm9udC1zaXplOiAwLjllbTsgY29sb3I6ICM1NTU7XCI+VW5ncm91cGVkICgke3VuZ3JvdXBlZC5sZW5ndGh9KTwvZGl2PmA7XG4gICAgICAgICAgICAgICAgIHVuZ3JvdXBlZC5mb3JFYWNoKHQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNTZWxlY3RlZCA9IHQuaWQgJiYgc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJzZWxlY3RhYmxlLWl0ZW0gJHtpc1NlbGVjdGVkID8gJ3NlbGVjdGVkJyA6ICcnfVwiIGRhdGEtdHlwZT1cInRhYlwiIGRhdGEtaWQ9XCIke3QuaWR9XCIgc3R5bGU9XCJtYXJnaW4tbGVmdDogMTBweDsgcGFkZGluZzogMnB4IDVweDsgYm9yZGVyLXJhZGl1czogM3B4OyBjdXJzb3I6IHBvaW50ZXI7IGNvbG9yOiAjMzMzOyB3aGl0ZS1zcGFjZTogbm93cmFwOyBvdmVyZmxvdzogaGlkZGVuOyB0ZXh0LW92ZXJmbG93OiBlbGxpcHNpcztcIj4tICR7ZXNjYXBlSHRtbCh0LnRpdGxlIHx8ICdVbnRpdGxlZCcpfTwvZGl2PmA7XG4gICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICBodG1sICs9IGA8L2Rpdj5gO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBSZW5kZXIgR3JvdXBzXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtncm91cElkLCBnVGFic10gb2Ygd2luR3JvdXBzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBJbmZvID0gZ3JvdXBNYXAuZ2V0KGdyb3VwSWQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbG9yID0gZ3JvdXBJbmZvPy5jb2xvciB8fCAnZ3JleSc7XG4gICAgICAgICAgICAgICAgY29uc3QgdGl0bGUgPSBncm91cEluZm8/LnRpdGxlIHx8ICdVbnRpdGxlZCBHcm91cCc7XG4gICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBTZWxlY3RlZCA9IGdUYWJzLmV2ZXJ5KHQgPT4gdC5pZCAmJiBzaW11bGF0ZWRTZWxlY3Rpb24uaGFzKHQuaWQpKTtcblxuICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJzZWxlY3RhYmxlLWl0ZW0gJHtncm91cFNlbGVjdGVkID8gJ3NlbGVjdGVkJyA6ICcnfVwiIGRhdGEtdHlwZT1cImdyb3VwXCIgZGF0YS1pZD1cIiR7Z3JvdXBJZH1cIiBzdHlsZT1cIm1hcmdpbi1sZWZ0OiAxMHB4OyBtYXJnaW4tdG9wOiA1cHg7IGJvcmRlci1sZWZ0OiAzcHggc29saWQgJHtjb2xvcn07IHBhZGRpbmctbGVmdDogNXB4OyBwYWRkaW5nOiA1cHg7IGJvcmRlci1yYWRpdXM6IDNweDtcIj5gO1xuICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgc3R5bGU9XCJmb250LXdlaWdodDogYm9sZDsgZm9udC1zaXplOiAwLjllbTtcIj4ke2VzY2FwZUh0bWwodGl0bGUpfSAoJHtnVGFicy5sZW5ndGh9KTwvZGl2PmA7XG4gICAgICAgICAgICAgICAgZ1RhYnMuZm9yRWFjaCh0ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzU2VsZWN0ZWQgPSB0LmlkICYmIHNpbXVsYXRlZFNlbGVjdGlvbi5oYXModC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwic2VsZWN0YWJsZS1pdGVtICR7aXNTZWxlY3RlZCA/ICdzZWxlY3RlZCcgOiAnJ31cIiBkYXRhLXR5cGU9XCJ0YWJcIiBkYXRhLWlkPVwiJHt0LmlkfVwiIHN0eWxlPVwibWFyZ2luLWxlZnQ6IDEwcHg7IHBhZGRpbmc6IDJweCA1cHg7IGJvcmRlci1yYWRpdXM6IDNweDsgY3Vyc29yOiBwb2ludGVyOyBjb2xvcjogIzMzMzsgd2hpdGUtc3BhY2U6IG5vd3JhcDsgb3ZlcmZsb3c6IGhpZGRlbjsgdGV4dC1vdmVyZmxvdzogZWxsaXBzaXM7XCI+LSAke2VzY2FwZUh0bWwodC50aXRsZSB8fCAnVW50aXRsZWQnKX08L2Rpdj5gO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGh0bWwgKz0gYDwvZGl2PmA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGh0bWwgKz0gYDwvZGl2PmA7XG4gICAgICAgIH1cblxuICAgICAgICBjb250YWluZXIuaW5uZXJIVE1MID0gaHRtbDtcblxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29udGFpbmVyLmlubmVySFRNTCA9IGA8cCBzdHlsZT1cImNvbG9yOnJlZFwiPkVycm9yIGxvYWRpbmcgbGl2ZSB2aWV3OiAke2V9PC9wPmA7XG4gICAgfVxufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tIExPRyBWSUVXRVIgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5sZXQgY3VycmVudExvZ3M6IExvZ0VudHJ5W10gPSBbXTtcblxuYXN5bmMgZnVuY3Rpb24gbG9hZExvZ3MoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdnZXRMb2dzJyB9KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgIGN1cnJlbnRMb2dzID0gcmVzcG9uc2UuZGF0YTtcbiAgICAgICAgICAgIHJlbmRlckxvZ3MoKTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIGxvZ3NcIiwgZSk7XG4gICAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBjbGVhclJlbW90ZUxvZ3MoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnY2xlYXJMb2dzJyB9KTtcbiAgICAgICAgbG9hZExvZ3MoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gY2xlYXIgbG9nc1wiLCBlKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHJlbmRlckxvZ3MoKSB7XG4gICAgY29uc3QgdGJvZHkgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9ncy10YWJsZS1ib2R5Jyk7XG4gICAgY29uc3QgbGV2ZWxGaWx0ZXIgPSAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvZy1sZXZlbC1maWx0ZXInKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgY29uc3Qgc2VhcmNoVGV4dCA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9nLXNlYXJjaCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlLnRvTG93ZXJDYXNlKCk7XG5cbiAgICBpZiAoIXRib2R5KSByZXR1cm47XG5cbiAgICB0Ym9keS5pbm5lckhUTUwgPSAnJztcblxuICAgIGNvbnN0IGZpbHRlcmVkID0gY3VycmVudExvZ3MuZmlsdGVyKGVudHJ5ID0+IHtcbiAgICAgICAgaWYgKGxldmVsRmlsdGVyICE9PSAnYWxsJyAmJiBlbnRyeS5sZXZlbCAhPT0gbGV2ZWxGaWx0ZXIpIHJldHVybiBmYWxzZTtcbiAgICAgICAgaWYgKHNlYXJjaFRleHQpIHtcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSBgJHtlbnRyeS5tZXNzYWdlfSAke0pTT04uc3RyaW5naWZ5KGVudHJ5LmNvbnRleHQgfHwge30pfWAudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIGlmICghdGV4dC5pbmNsdWRlcyhzZWFyY2hUZXh0KSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH0pO1xuXG4gICAgaWYgKGZpbHRlcmVkLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICB0Ym9keS5pbm5lckhUTUwgPSAnPHRyPjx0ZCBjb2xzcGFuPVwiNFwiIHN0eWxlPVwicGFkZGluZzogMTBweDsgdGV4dC1hbGlnbjogY2VudGVyOyBjb2xvcjogIzg4ODtcIj5ObyBsb2dzIGZvdW5kLjwvdGQ+PC90cj4nO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZmlsdGVyZWQuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICAgIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RyJyk7XG5cbiAgICAgICAgLy8gQ29sb3IgY29kZSBsZXZlbFxuICAgICAgICBsZXQgY29sb3IgPSAnIzMzMyc7XG4gICAgICAgIGlmIChlbnRyeS5sZXZlbCA9PT0gJ2Vycm9yJyB8fCBlbnRyeS5sZXZlbCA9PT0gJ2NyaXRpY2FsJykgY29sb3IgPSAncmVkJztcbiAgICAgICAgZWxzZSBpZiAoZW50cnkubGV2ZWwgPT09ICd3YXJuJykgY29sb3IgPSAnb3JhbmdlJztcbiAgICAgICAgZWxzZSBpZiAoZW50cnkubGV2ZWwgPT09ICdkZWJ1ZycpIGNvbG9yID0gJ2JsdWUnO1xuXG4gICAgICAgIHJvdy5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICA8dGQgc3R5bGU9XCJwYWRkaW5nOiA4cHg7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAjZWVlOyB3aGl0ZS1zcGFjZTogbm93cmFwO1wiPiR7bmV3IERhdGUoZW50cnkudGltZXN0YW1wKS50b0xvY2FsZVRpbWVTdHJpbmcoKX0gKCR7ZW50cnkudGltZXN0YW1wfSk8L3RkPlxuICAgICAgICAgICAgPHRkIHN0eWxlPVwicGFkZGluZzogOHB4OyBib3JkZXItYm90dG9tOiAxcHggc29saWQgI2VlZTsgY29sb3I6ICR7Y29sb3J9OyBmb250LXdlaWdodDogYm9sZDtcIj4ke2VudHJ5LmxldmVsLnRvVXBwZXJDYXNlKCl9PC90ZD5cbiAgICAgICAgICAgIDx0ZCBzdHlsZT1cInBhZGRpbmc6IDhweDsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICNlZWU7XCI+JHtlc2NhcGVIdG1sKGVudHJ5Lm1lc3NhZ2UpfTwvdGQ+XG4gICAgICAgICAgICA8dGQgc3R5bGU9XCJwYWRkaW5nOiA4cHg7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAjZWVlO1wiPlxuICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cIm1heC1oZWlnaHQ6IDEwMHB4OyBvdmVyZmxvdy15OiBhdXRvO1wiPlxuICAgICAgICAgICAgICAgICAgJHtlbnRyeS5jb250ZXh0ID8gYDxwcmUgc3R5bGU9XCJtYXJnaW46IDA7XCI+JHtlc2NhcGVIdG1sKEpTT04uc3RyaW5naWZ5KGVudHJ5LmNvbnRleHQsIG51bGwsIDIpKX08L3ByZT5gIDogJy0nfVxuICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L3RkPlxuICAgICAgICBgO1xuICAgICAgICB0Ym9keS5hcHBlbmRDaGlsZChyb3cpO1xuICAgIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBsb2FkR2xvYmFsTG9nTGV2ZWwoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2FkUHJlZmVyZW5jZXMnIH0pO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgICAgICAgY29uc3QgcHJlZnMgPSByZXNwb25zZS5kYXRhIGFzIFByZWZlcmVuY2VzO1xuICAgICAgICAgICAgY29uc3Qgc2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dsb2JhbC1sb2ctbGV2ZWwnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgIGlmIChzZWxlY3QpIHtcbiAgICAgICAgICAgICAgICBzZWxlY3QudmFsdWUgPSBwcmVmcy5sb2dMZXZlbCB8fCAnaW5mbyc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBwcmVmcyBmb3IgbG9nc1wiLCBlKTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHVwZGF0ZUdsb2JhbExvZ0xldmVsKCkge1xuICAgIGNvbnN0IHNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnbG9iYWwtbG9nLWxldmVsJykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgaWYgKCFzZWxlY3QpIHJldHVybjtcbiAgICBjb25zdCBsZXZlbCA9IHNlbGVjdC52YWx1ZSBhcyBMb2dMZXZlbDtcblxuICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgcGF5bG9hZDogeyBsb2dMZXZlbDogbGV2ZWwgfVxuICAgICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gc2F2ZSBsb2cgbGV2ZWxcIiwgZSk7XG4gICAgfVxufVxuIl0sCiAgIm1h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LElBQUksS0FBSyxVQUFVLE1BQU0sV0FBVyxDQUFDLENBQUMsQ0FBQyxHQUFHLFlBQVk7QUFDbkYsVUFBSSxDQUFDLEtBQUssU0FBUyxVQUFVLEVBQUcsUUFBTztBQUFBLElBQzNDO0FBQ0EsV0FBTztBQUFBLEVBQ1gsQ0FBQztBQUVELE1BQUksU0FBUyxXQUFXLEdBQUc7QUFDdkIsVUFBTSxZQUFZO0FBQ2xCO0FBQUEsRUFDSjtBQUVBLFdBQVMsUUFBUSxXQUFTO0FBQ3RCLFVBQU0sTUFBTSxTQUFTLGNBQWMsSUFBSTtBQUd2QyxRQUFJLFFBQVE7QUFDWixRQUFJLE1BQU0sVUFBVSxXQUFXLE1BQU0sVUFBVSxXQUFZLFNBQVE7QUFBQSxhQUMxRCxNQUFNLFVBQVUsT0FBUSxTQUFRO0FBQUEsYUFDaEMsTUFBTSxVQUFVLFFBQVMsU0FBUTtBQUUxQyxRQUFJLFlBQVk7QUFBQSw0RkFDb0UsSUFBSSxLQUFLLE1BQU0sU0FBUyxFQUFFLG1CQUFtQixDQUFDLEtBQUssTUFBTSxTQUFTO0FBQUEsNkVBQ2pGLEtBQUsseUJBQXlCLE1BQU0sTUFBTSxZQUFZLENBQUM7QUFBQSx1RUFDN0QsV0FBVyxNQUFNLE9BQU8sQ0FBQztBQUFBO0FBQUE7QUFBQSxvQkFHNUUsTUFBTSxVQUFVLDJCQUEyQixXQUFXLEtBQUssVUFBVSxNQUFNLFNBQVMsTUFBTSxDQUFDLENBQUMsQ0FBQyxXQUFXLEdBQUc7QUFBQTtBQUFBO0FBQUE7QUFJdkgsVUFBTSxZQUFZLEdBQUc7QUFBQSxFQUN6QixDQUFDO0FBQ0w7QUFFQSxlQUFlLHFCQUFxQjtBQUNoQyxNQUFJO0FBQ0EsVUFBTSxXQUFXLE1BQU0sT0FBTyxRQUFRLFlBQVksRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQzdFLFFBQUksWUFBWSxTQUFTLE1BQU0sU0FBUyxNQUFNO0FBQzFDLFlBQU0sUUFBUSxTQUFTO0FBQ3ZCLFlBQU0sU0FBUyxTQUFTLGVBQWUsa0JBQWtCO0FBQ3pELFVBQUksUUFBUTtBQUNSLGVBQU8sUUFBUSxNQUFNLFlBQVk7QUFBQSxNQUNyQztBQUFBLElBQ0o7QUFBQSxFQUNKLFNBQVMsR0FBRztBQUNSLFlBQVEsTUFBTSxpQ0FBaUMsQ0FBQztBQUFBLEVBQ3BEO0FBQ0o7QUFFQSxlQUFlLHVCQUF1QjtBQUNsQyxRQUFNLFNBQVMsU0FBUyxlQUFlLGtCQUFrQjtBQUN6RCxNQUFJLENBQUMsT0FBUTtBQUNiLFFBQU0sUUFBUSxPQUFPO0FBRXJCLE1BQUk7QUFDQSxVQUFNLE9BQU8sUUFBUSxZQUFZO0FBQUEsTUFDN0IsTUFBTTtBQUFBLE1BQ04sU0FBUyxFQUFFLFVBQVUsTUFBTTtBQUFBLElBQy9CLENBQUM7QUFBQSxFQUNMLFNBQVMsR0FBRztBQUNSLFlBQVEsTUFBTSw0QkFBNEIsQ0FBQztBQUFBLEVBQy9DO0FBQ0o7IiwKICAibmFtZXMiOiBbInBhcnRzIiwgImN1c3RvbVN0cmF0ZWdpZXMiLCAiZ3JvdXBUYWJzIl0KfQo=
