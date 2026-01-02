import { logDebug, logError } from "./logger.js";
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
            // Even if fetchContextForTab fails completely (including fallback), we try a safe sync fallback or just uncategorized
            contextMap.set(tab.id, { context: "Uncategorized", source: 'Heuristic' });
        }
    });
    await Promise.all(promises);
    return contextMap;
};
const fetchContextForTab = async (tab) => {
    const textToClassify = `${tab.title} ${tab.url}`;
    // Payload for Zero-Shot Classification
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
        if (!response.ok) {
            logDebug("LLM API failed, falling back to heuristic", { status: response.status });
            return await localHeuristic(tab);
        }
        const result = await response.json();
        if (result && result.labels && result.labels.length > 0) {
            return { context: result.labels[0], source: 'AI' };
        }
        return await localHeuristic(tab);
    }
    catch (e) {
        logDebug("LLM API error, falling back to heuristic", { error: String(e) });
        return await localHeuristic(tab);
    }
};
const analyzeYoutubeContext = async (tab) => {
    if (!tab.url.includes("youtube.com/watch"))
        return null;
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                // Try multiple selectors for robustness
                const title = document.querySelector("h1.ytd-video-primary-info-renderer")?.innerText
                    || document.querySelector("#title h1")?.innerText
                    || document.title;
                const channel = document.querySelector("#upload-info #channel-name a")?.innerText
                    || document.querySelector("ytd-channel-name a")?.innerText
                    || document.querySelector(".ytd-channel-name a")?.innerText
                    || "";
                const date = document.querySelector("#info-strings yt-formatted-string")?.innerText
                    || document.querySelector("#date yt-formatted-string")?.innerText
                    || "";
                return {
                    title,
                    channel,
                    date
                };
            }
        });
        if (results && results.length > 0 && results[0].result) {
            const data = results[0].result;
            // Clean up
            const cleanData = {
                platform: "YouTube",
                channel: data.channel.trim(),
                title: data.title.trim(),
                date: data.date.trim()
            };
            // Return JSON string
            return { context: JSON.stringify(cleanData), source: 'Heuristic' };
        }
    }
    catch (e) {
        logDebug("Failed to extract YouTube context", { error: String(e) });
    }
    return null;
};
const localHeuristic = async (tab) => {
    const url = tab.url.toLowerCase();
    // YouTube Extraction
    const ytContext = await analyzeYoutubeContext(tab);
    if (ytContext)
        return ytContext;
    let context = "Uncategorized";
    if (url.includes("github") || url.includes("stackoverflow") || url.includes("localhost") || url.includes("jira") || url.includes("gitlab"))
        context = "Development";
    else if (url.includes("google") && (url.includes("docs") || url.includes("sheets") || url.includes("slides")))
        context = "Work";
    else if (url.includes("linkedin") || url.includes("slack") || url.includes("zoom") || url.includes("teams"))
        context = "Work";
    else if (url.includes("netflix") || url.includes("spotify") || url.includes("hulu") || url.includes("disney"))
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
