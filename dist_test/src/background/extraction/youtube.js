"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapGenreToColor = exports.determineChannelGenre = exports.extractYouTubeData = exports.heuristicGenre = void 0;
const logger_js_1 = require("../../shared/logger.js");
const storage_js_1 = require("../storage.js");
// Genre Taxonomy
const GENRE_COLORS = {
    "Gaming": "purple",
    "Music": "blue",
    "Education": "green",
    "News": "red",
    "Tech": "cyan",
    "Sports": "orange",
    "Entertainment": "pink",
    "People & Blogs": "yellow",
    "Comedy": "yellow",
    "Other": "grey",
    "Unknown": "grey"
};
const GENRE_KEYWORDS = {
    "Gaming": ["game", "gaming", "playthrough", "gameplay", "stream", "esports", "minecraft", "roblox", "fortnite", "nintendo", "playstation", "xbox", "ign", "gamespot", "lets play"],
    "Music": ["music", "song", "lyrics", "official video", "vevo", "records", "band", "concert", "album", "cover", "remix", "soundtrack"],
    "Education": ["tutorial", "how to", "learn", "course", "lesson", "school", "university", "math", "science", "history", "physics", "chemistry", "biology", "lecture", "ted", "academy", "explained"],
    "News": ["news", "report", "update", "politics", "live", "breaking", "daily", "cnn", "bbc", "fox", "nbc", "abc", "cbs", "weather"],
    "Tech": ["tech", "technology", "review", "unboxing", "gadget", "software", "coding", "programming", "iphone", "samsung", "apple", "google", "microsoft", "linux", "hardware", "pc", "laptop"],
    "Sports": ["sports", "football", "soccer", "basketball", "nba", "nfl", "mlb", "fifa", "uefa", "highlight", "match", "game", "athlete"],
    "Comedy": ["comedy", "funny", "joke", "prank", "standup", "skit", "parody", "laugh", "meme"],
    "People & Blogs": ["vlog", "life", "daily", "blog", "family", "lifestyle", "story", "react"],
    "Entertainment": ["movie", "film", "trailer", "clip", "show", "series", "tv", "celebrity", "gossip", "drama"]
};
// YouTube Topic IDs (Wikipedia URLs suffix) to Genre
const TOPIC_MAPPING = {
    "Music": "Music",
    "Gaming": "Gaming",
    "Sports": "Sports",
    "Entertainment": "Entertainment",
    "Lifestyle_(sociology)": "People & Blogs",
    "Society": "News",
    "Politics": "News",
    "Technology": "Tech",
    "Knowledge": "Education"
};
const heuristicGenre = (text) => {
    const lower = text.toLowerCase();
    for (const [genre, keywords] of Object.entries(GENRE_KEYWORDS)) {
        if (keywords.some(k => lower.includes(k))) {
            return genre;
        }
    }
    return null;
};
exports.heuristicGenre = heuristicGenre;
const extractYouTubeData = async (tab) => {
    const info = { channelId: null, channelHandle: null, channelName: null };
    const url = tab.url;
    try {
        const urlObj = new URL(url);
        const path = urlObj.pathname;
        // 1. URL-based extraction
        if (path.startsWith('/channel/')) {
            info.channelId = path.split('/')[2];
        }
        else if (path.startsWith('/@')) {
            info.channelHandle = path.split('/')[1].split('/')[0];
        }
        else if (path.startsWith('/c/') || path.startsWith('/user/')) {
            info.channelHandle = path.split('/')[2];
        }
        // 2. Page Content extraction (if needed)
        if (!info.channelId && !info.channelHandle && (path.includes('/watch') || path.includes('/shorts/'))) {
            if (tab.id) {
                try {
                    const results = await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: () => {
                            const link = document.querySelector('a[href^="/channel/"], a[href^="/@"]');
                            const owner = document.querySelector('#owner #channel-name a');
                            // Try standard selectors
                            let href = link?.getAttribute('href') || owner?.getAttribute('href');
                            let name = owner?.innerText;
                            if (!name) {
                                const nameMeta = document.querySelector('meta[itemprop="name"], meta[name="title"]');
                                if (nameMeta)
                                    name = nameMeta.getAttribute('content');
                            }
                            return { href, name };
                        }
                    });
                    if (results && results[0] && results[0].result) {
                        const { href, name } = results[0].result;
                        if (href) {
                            if (href.includes('/channel/'))
                                info.channelId = href.split('/channel/')[1];
                            else if (href.includes('/@'))
                                info.channelHandle = '@' + href.split('/@')[1].split('/')[0];
                        }
                        if (name)
                            info.channelName = name;
                    }
                }
                catch (e) {
                    // Ignore scripting errors (e.g. if tab is restricted)
                    (0, logger_js_1.logDebug)("Script injection skipped/failed", { tabId: tab.id, error: String(e) });
                }
            }
        }
        return info;
    }
    catch (e) {
        (0, logger_js_1.logError)("Error extracting YouTube data", { error: String(e) });
        return info;
    }
};
exports.extractYouTubeData = extractYouTubeData;
const determineChannelGenre = async (info, apiKey) => {
    const keyPart = info.channelId || info.channelHandle;
    if (!keyPart)
        return { genre: "Unknown", source: "unknown" };
    const cacheKey = `yt_genre_${keyPart}`;
    // 1. Check Cache
    try {
        const entry = await (0, storage_js_1.getStoredValue)(cacheKey);
        if (entry) {
            // Cache valid for 30 days
            if (Date.now() - entry.updatedAt < 30 * 24 * 60 * 60 * 1000) {
                return { genre: entry.genre, source: entry.source };
            }
        }
    }
    catch (e) {
        (0, logger_js_1.logError)("Cache read failed", { error: String(e) });
    }
    let genre = "Unknown";
    let source = "unknown";
    // 2. API Lookup
    if (apiKey && info.channelId) {
        try {
            const url = `https://www.googleapis.com/youtube/v3/channels?part=topicDetails,snippet&id=${info.channelId}&key=${apiKey}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data.items && data.items.length > 0) {
                    const item = data.items[0];
                    // Try topicDetails
                    if (item.topicDetails && item.topicDetails.topicCategories) {
                        const topics = item.topicDetails.topicCategories;
                        for (const topicUrl of topics) {
                            const topicName = topicUrl.split('/').pop();
                            if (topicName && TOPIC_MAPPING[topicName]) {
                                genre = TOPIC_MAPPING[topicName];
                                source = "api";
                                break;
                            }
                        }
                    }
                    // If no topic matched, try snippet
                    if (genre === "Unknown" && item.snippet) {
                        const text = `${item.snippet.title} ${item.snippet.description}`;
                        const g = (0, exports.heuristicGenre)(text);
                        if (g) {
                            genre = g;
                            source = "api";
                        }
                    }
                }
            }
        }
        catch (e) {
            (0, logger_js_1.logError)("YouTube API call failed", { error: String(e) });
        }
    }
    // 3. Heuristic Fallback
    if (genre === "Unknown") {
        const text = `${info.channelName || ""} ${info.channelHandle || ""}`;
        const g = (0, exports.heuristicGenre)(text);
        if (g) {
            genre = g;
            source = "heuristic";
        }
    }
    // 4. Update Cache
    if (genre !== "Unknown") {
        try {
            await (0, storage_js_1.setStoredValue)(cacheKey, {
                genre,
                source,
                updatedAt: Date.now()
            });
        }
        catch (e) {
            (0, logger_js_1.logError)("Cache write failed", { error: String(e) });
        }
    }
    return { genre, source };
};
exports.determineChannelGenre = determineChannelGenre;
const mapGenreToColor = (genre) => {
    if (!genre || !GENRE_COLORS[genre])
        return "grey";
    return GENRE_COLORS[genre];
};
exports.mapGenreToColor = mapGenreToColor;
