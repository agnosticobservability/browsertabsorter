"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeTabContext = void 0;
const logger_js_1 = require("./logger.js");
const index_js_1 = require("./extraction/index.js");
const analyzeTabContext = async (tabs) => {
    const contextMap = new Map();
    const promises = tabs.map(async (tab) => {
        try {
            const result = await fetchContextForTab(tab);
            contextMap.set(tab.id, result);
        }
        catch (error) {
            (0, logger_js_1.logError)(`Failed to analyze context for tab ${tab.id}`, { error: String(error) });
            // Even if fetchContextForTab fails completely, we try a safe sync fallback
            contextMap.set(tab.id, { context: "Uncategorized", source: 'Heuristic', error: String(error), status: 'ERROR' });
        }
    });
    await Promise.all(promises);
    return contextMap;
};
exports.analyzeTabContext = analyzeTabContext;
const fetchContextForTab = async (tab) => {
    // 1. Run Generic Extraction (Always)
    let data = null;
    let error;
    let status;
    try {
        const extraction = await (0, index_js_1.extractPageContext)(tab.id);
        data = extraction.data;
        error = extraction.error;
        status = extraction.status;
    }
    catch (e) {
        (0, logger_js_1.logDebug)(`Extraction failed for tab ${tab.id}`, { error: String(e) });
        error = String(e);
        status = 'ERROR';
    }
    let context = "Uncategorized";
    let source = 'Heuristic';
    // 2. Try to Determine Category from Extraction Data
    if (data) {
        if (data.platform === 'YouTube' || data.platform === 'Netflix' || data.platform === 'Spotify' || data.platform === 'Twitch') {
            context = "Entertainment";
            source = 'Extraction';
        }
        else if (data.platform === 'GitHub' || data.platform === 'Stack Overflow' || data.platform === 'Jira' || data.platform === 'GitLab') {
            context = "Development";
            source = 'Extraction';
        }
        else if (data.platform === 'Google' && (data.normalizedUrl.includes('docs') || data.normalizedUrl.includes('sheets') || data.normalizedUrl.includes('slides'))) {
            context = "Work";
            source = 'Extraction';
        }
        else {
            // If we have successful extraction data but no specific rule matched,
            // use the Object Type or generic "General Web" to indicate extraction worked.
            // We prefer specific categories, but "Article" or "Video" are better than "Uncategorized".
            if (data.objectType && data.objectType !== 'unknown') {
                // Map object types to categories if possible
                if (data.objectType === 'video')
                    context = 'Entertainment';
                else if (data.objectType === 'article')
                    context = 'News'; // Loose mapping, but better than nothing
                else
                    context = data.objectType.charAt(0).toUpperCase() + data.objectType.slice(1);
            }
            else {
                context = "General Web";
            }
            source = 'Extraction';
        }
    }
    // 3. Fallback to Local Heuristic (URL Regex)
    if (context === "Uncategorized") {
        const h = await localHeuristic(tab);
        if (h.context !== "Uncategorized") {
            context = h.context;
            // source remains 'Heuristic' (or maybe we should say 'Heuristic' is the source?)
            // The localHeuristic function returns { source: 'Heuristic' }
        }
    }
    // 4. Fallback to AI (LLM) - REMOVED
    // The HuggingFace API endpoint is 410 Gone and/or requires authentication which we do not have.
    // The code has been removed to prevent errors.
    if (context !== "Uncategorized" && source !== "Extraction") {
        error = undefined;
        status = undefined;
    }
    return { context, source, data: data || undefined, error, status };
};
const localHeuristic = async (tab) => {
    const url = tab.url.toLowerCase();
    let context = "Uncategorized";
    if (url.includes("github") || url.includes("stackoverflow") || url.includes("localhost") || url.includes("jira") || url.includes("gitlab"))
        context = "Development";
    else if (url.includes("google") && (url.includes("docs") || url.includes("sheets") || url.includes("slides")))
        context = "Work";
    else if (url.includes("linkedin") || url.includes("slack") || url.includes("zoom") || url.includes("teams"))
        context = "Work";
    else if (url.includes("netflix") || url.includes("spotify") || url.includes("hulu") || url.includes("disney") || url.includes("youtube"))
        context = "Entertainment";
    else if (url.includes("twitter") || url.includes("facebook") || url.includes("instagram") || url.includes("reddit") || url.includes("tiktok") || url.includes("pinterest"))
        context = "Social";
    else if (url.includes("amazon") || url.includes("ebay") || url.includes("walmart") || url.includes("target") || url.includes("shopify"))
        context = "Shopping";
    else if (url.includes("cnn") || url.includes("bbc") || url.includes("nytimes") || url.includes("washingtonpost") || url.includes("foxnews"))
        context = "News";
    else if (url.includes("coursera") || url.includes("udemy") || url.includes("edx") || url.includes("khanacademy") || url.includes("canvas"))
        context = "Education";
    else if (url.includes("expedia") || url.includes("booking") || url.includes("airbnb") || url.includes("tripadvisor") || url.includes("kayak"))
        context = "Travel";
    else if (url.includes("webmd") || url.includes("mayoclinic") || url.includes("nih.gov") || url.includes("health"))
        context = "Health";
    else if (url.includes("espn") || url.includes("nba") || url.includes("nfl") || url.includes("mlb") || url.includes("fifa"))
        context = "Sports";
    else if (url.includes("techcrunch") || url.includes("wired") || url.includes("theverge") || url.includes("arstechnica"))
        context = "Technology";
    else if (url.includes("science") || url.includes("nature.com") || url.includes("nasa.gov"))
        context = "Science";
    else if (url.includes("twitch") || url.includes("steam") || url.includes("roblox") || url.includes("ign") || url.includes("gamespot"))
        context = "Gaming";
    else if (url.includes("soundcloud") || url.includes("bandcamp") || url.includes("last.fm"))
        context = "Music";
    else if (url.includes("deviantart") || url.includes("behance") || url.includes("dribbble") || url.includes("artstation"))
        context = "Art";
    return { context, source: 'Heuristic' };
};
