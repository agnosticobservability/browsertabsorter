import { logDebug, logError } from "./logger.js";
import { extractPageContext } from "./extraction/index.js";
const HF_API_URL = "https://api-inference.huggingface.co/models/facebook/bart-large-mnli";
// We will categorize tabs into these contexts:
const CONTEXT_LABELS = [
    "Work", "Personal", "Social", "News", "Development", "Shopping", "Entertainment", "Finance",
    "Education", "Travel", "Health", "Sports", "Technology", "Science", "Gaming", "Music", "Art"
];
export const analyzeTabContext = async (tabs) => {
    const contextMap = new Map();
    const promises = tabs.map(async (tab) => {
        try {
            const result = await fetchContextForTab(tab);
            contextMap.set(tab.id, result);
        }
        catch (error) {
            logError(`Failed to analyze context for tab ${tab.id}`, { error: String(error) });
            contextMap.set(tab.id, { context: "Uncategorized", source: 'Heuristic', error: String(error) });
        }
    });
    await Promise.all(promises);
    return contextMap;
};
const fetchContextForTab = async (tab) => {
    // 1. Run Generic Extraction (Always)
    let data = null;
    let extractionError;
    const extractionRes = await extractPageContext(tab.id, tab.url);
    if (extractionRes.success && extractionRes.data) {
        data = extractionRes.data;
    }
    else {
        extractionError = extractionRes.error;
        // If restricted, fail fast
        if (extractionRes.status === 'RESTRICTED' || extractionRes.status === 'NO_PERMISSION') {
            return { context: "Unextractable (restricted page)", source: 'Error', error: extractionRes.error };
        }
        // Other errors (INJECTION_FAILED, NO_RESPONSE) -> Continue to Heuristic Fallback
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
        // If we have data but no specific category mapping, should we say 'Extraction'?
        // If we leave it Uncategorized, fallback logic kicks in.
        // If fallback logic (URL regex) finds something, it becomes 'Heuristic'.
        // But we still HAVE the data.
    }
    // 3. Fallback to Local Heuristic (URL Regex)
    if (context === "Uncategorized") {
        const h = await localHeuristic(tab);
        if (h.context !== "Uncategorized") {
            context = h.context;
            // source remains 'Heuristic'
        }
    }
    // 4. Fallback to AI (LLM)
    if (context === "Uncategorized") {
        const textToClassify = `${tab.title} ${tab.url}`;
        const payload = {
            inputs: textToClassify,
            parameters: { candidate_labels: CONTEXT_LABELS }
        };
        try {
            const response = await fetch(HF_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                const result = await response.json();
                if (result && result.labels && result.labels.length > 0) {
                    context = result.labels[0];
                    source = 'AI';
                }
            }
        }
        catch (e) {
            logDebug("LLM API error", { error: String(e) });
        }
    }
    // If still Uncategorized, and we had an extraction error, maybe mention it in context?
    // User wants: "Only show Fallback (Category) if extraction failed AND include failure reason."
    // If we have data, we just show category (even if Uncategorized).
    return { context, source, data: data || undefined, error: extractionError };
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
