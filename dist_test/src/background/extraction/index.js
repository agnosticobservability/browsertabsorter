"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPageContext = void 0;
const logic_js_1 = require("./logic.js");
const generaRegistry_js_1 = require("./generaRegistry.js");
const logger_js_1 = require("../../shared/logger.js");
const preferences_js_1 = require("../preferences.js");
// Simple concurrency control
let activeFetches = 0;
const MAX_CONCURRENT_FETCHES = 5; // Conservative limit to avoid rate limiting
const FETCH_QUEUE = [];
const fetchWithTimeout = async (url, timeout = 2000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { signal: controller.signal });
        return response;
    }
    finally {
        clearTimeout(id);
    }
};
const enqueueFetch = async (fn) => {
    if (activeFetches >= MAX_CONCURRENT_FETCHES) {
        await new Promise(resolve => FETCH_QUEUE.push(resolve));
    }
    activeFetches++;
    try {
        return await fn();
    }
    finally {
        activeFetches--;
        if (FETCH_QUEUE.length > 0) {
            const next = FETCH_QUEUE.shift();
            if (next)
                next();
        }
    }
};
const extractPageContext = async (tab) => {
    try {
        if (!tab || !tab.url) {
            return { data: null, error: "Tab not found or no URL", status: 'NO_RESPONSE' };
        }
        if (tab.url.startsWith('chrome://') ||
            tab.url.startsWith('edge://') ||
            tab.url.startsWith('about:') ||
            tab.url.startsWith('chrome-extension://') ||
            tab.url.startsWith('chrome-error://')) {
            return { data: null, error: "Restricted URL scheme", status: 'RESTRICTED' };
        }
        const prefs = await (0, preferences_js_1.loadPreferences)();
        let baseline = buildBaselineContext(tab, prefs.customGenera);
        // Fetch and enrich for YouTube if author is missing and it is a video
        const targetUrl = tab.url;
        const urlObj = new URL(targetUrl);
        const hostname = urlObj.hostname.replace(/^www\./, '');
        if ((hostname.endsWith('youtube.com') || hostname.endsWith('youtu.be')) && (!baseline.authorOrCreator || baseline.genre === 'Video')) {
            try {
                // We use a queue to prevent flooding requests
                await enqueueFetch(async () => {
                    const response = await fetchWithTimeout(targetUrl);
                    if (response.ok) {
                        const html = await response.text();
                        const channel = (0, logic_js_1.extractYouTubeChannelFromHtml)(html);
                        if (channel) {
                            baseline.authorOrCreator = channel;
                        }
                        const genre = (0, logic_js_1.extractYouTubeGenreFromHtml)(html);
                        if (genre) {
                            baseline.genre = genre;
                        }
                    }
                });
            }
            catch (fetchErr) {
                (0, logger_js_1.logDebug)("Failed to fetch YouTube page content", { error: String(fetchErr) });
            }
        }
        return {
            data: baseline,
            status: 'OK'
        };
    }
    catch (e) {
        (0, logger_js_1.logDebug)(`Extraction failed for tab ${tab.id}`, { error: String(e) });
        return {
            data: null,
            error: String(e),
            status: 'INJECTION_FAILED'
        };
    }
};
exports.extractPageContext = extractPageContext;
const buildBaselineContext = (tab, customGenera) => {
    const url = tab.url || "";
    let hostname = "";
    try {
        hostname = new URL(url).hostname.replace(/^www\./, '');
    }
    catch (e) {
        hostname = "";
    }
    // Determine Object Type first
    let objectType = 'unknown';
    let authorOrCreator = null;
    if (url.includes('/login') || url.includes('/signin')) {
        objectType = 'login';
    }
    else if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
        const { videoId } = (0, logic_js_1.parseYouTubeUrl)(url);
        if (videoId)
            objectType = 'video';
        // Try to guess channel from URL if possible
        if (url.includes('/@')) {
            const parts = url.split('/@');
            if (parts.length > 1) {
                const handle = parts[1].split('/')[0];
                authorOrCreator = '@' + handle;
            }
        }
        else if (url.includes('/c/')) {
            const parts = url.split('/c/');
            if (parts.length > 1) {
                authorOrCreator = decodeURIComponent(parts[1].split('/')[0]);
            }
        }
        else if (url.includes('/user/')) {
            const parts = url.split('/user/');
            if (parts.length > 1) {
                authorOrCreator = decodeURIComponent(parts[1].split('/')[0]);
            }
        }
    }
    else if (hostname === 'github.com' && url.includes('/pull/')) {
        objectType = 'ticket';
    }
    else if (hostname === 'github.com' && !url.includes('/pull/') && url.split('/').length >= 5) {
        // rough check for repo
        objectType = 'repo';
    }
    // Determine Genre
    // Priority 1: Site-specific extraction (derived from objectType)
    let genre;
    if (objectType === 'video')
        genre = 'Video';
    else if (objectType === 'repo' || objectType === 'ticket')
        genre = 'Development';
    // Priority 2: Fallback to Registry
    if (!genre) {
        genre = (0, generaRegistry_js_1.getGenera)(hostname, customGenera) || undefined;
    }
    return {
        canonicalUrl: url || null,
        normalizedUrl: (0, logic_js_1.normalizeUrl)(url),
        siteName: hostname || null,
        platform: hostname || null,
        objectType,
        objectId: url || null,
        title: tab.title || null,
        genre,
        description: null,
        authorOrCreator: authorOrCreator,
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
            canonicalUrl: 'url',
            normalizedUrl: 'url',
            siteName: 'url',
            platform: 'url',
            objectType: 'url',
            title: tab.title ? 'tab' : 'url',
            genre: 'registry'
        },
        confidence: {}
    };
};
