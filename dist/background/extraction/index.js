import { normalizeUrl } from "./logic.js";
import { logDebug } from "../logger.js";
export const extractPageContext = async (tabId) => {
    try {
        const tab = await chrome.tabs.get(tabId);
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
        const baseline = buildBaselineContext(tab);
        // 1. Inject the bundled script
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['dist/extraction/content.js']
            });
        }
        catch (injectError) {
            const message = injectError?.message || String(injectError);
            return {
                data: baseline,
                error: message,
                status: classifyInjectionError(message, tab.url)
            };
        }
        // 2. Read the result from global variable
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                const res = window.__EXTRACTED_CONTEXT__;
                // We don't delete it immediately to allow inspection or re-reads if needed,
                // but cleaning up is good. Let's keep it for now as per original or delete?
                // Original deleted it. Let's delete it.
                delete window.__EXTRACTED_CONTEXT__;
                return res;
            }
        });
        if (results && results.length > 0 && results[0].result) {
            const merged = mergeBaselineContext(results[0].result, baseline);
            return { data: merged, status: 'OK' };
        }
        return {
            data: baseline,
            error: "Script executed but returned no data",
            status: 'NO_RESPONSE'
        };
    }
    catch (e) {
        logDebug(`Extraction failed for tab ${tabId}`, { error: String(e) });
        return {
            data: null,
            error: String(e),
            status: 'INJECTION_FAILED'
        };
    }
};
const buildBaselineContext = (tab) => {
    const url = tab.url || "";
    let hostname = "";
    try {
        hostname = new URL(url).hostname.replace(/^www\./, '');
    }
    catch (e) {
        hostname = "";
    }
    const objectType = url.includes('/login') || url.includes('/signin') ? 'login' : 'unknown';
    return {
        canonicalUrl: url || null,
        normalizedUrl: normalizeUrl(url),
        siteName: hostname || null,
        platform: hostname || null,
        objectType,
        objectId: url || null,
        title: tab.title || null,
        description: null,
        authorOrCreator: null,
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
            title: tab.title ? 'tab' : 'url'
        },
        confidence: {}
    };
};
const mergeBaselineContext = (data, baseline) => {
    const sources = { ...(data.sources || {}) };
    if (!data.title && baseline.title) {
        data.title = baseline.title;
        sources.title = baseline.sources.title;
    }
    if (!data.siteName && baseline.siteName) {
        data.siteName = baseline.siteName;
        sources.siteName = baseline.sources.siteName;
    }
    if (!data.canonicalUrl && baseline.canonicalUrl) {
        data.canonicalUrl = baseline.canonicalUrl;
        sources.canonicalUrl = baseline.sources.canonicalUrl;
    }
    if (!data.normalizedUrl && baseline.normalizedUrl) {
        data.normalizedUrl = baseline.normalizedUrl;
        sources.normalizedUrl = baseline.sources.normalizedUrl;
    }
    if (!data.platform && baseline.platform) {
        data.platform = baseline.platform;
        sources.platform = baseline.sources.platform;
    }
    if (!data.objectType && baseline.objectType) {
        data.objectType = baseline.objectType;
        sources.objectType = baseline.sources.objectType;
    }
    if (!data.objectId && baseline.objectId) {
        data.objectId = baseline.objectId;
    }
    data.sources = sources;
    return data;
};
const classifyInjectionError = (message, url) => {
    if (url.startsWith('chrome://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('chrome-error://')) {
        return 'RESTRICTED';
    }
    if (message.includes('Extension manifest must request permission') || message.includes('Cannot access contents of url')) {
        return 'NO_HOST_PERMISSION';
    }
    if (message.includes('Frame with ID') || message.includes('frame is showing error page')) {
        return 'FRAME_ACCESS_DENIED';
    }
    return 'INJECTION_FAILED';
};
