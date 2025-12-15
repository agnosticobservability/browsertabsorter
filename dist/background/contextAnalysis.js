import { logDebug, logError } from "./logger.js";
const HF_API_URL = "https://api-inference.huggingface.co/models/facebook/bart-large-mnli";
// This is a free model endpoint. While it usually requires a token for higher rate limits,
// it often allows some unauthenticated requests or we can ask the user for a token later.
// For the purpose of this task, we will try to use it without a token, or fallback to a heuristic.
// The user asked for a "free llm api".
// We will categorize tabs into these contexts:
const CONTEXT_LABELS = ["Work", "Personal", "Social", "News", "Development", "Shopping", "Entertainment", "Finance"];
export const analyzeTabContext = async (tabs) => {
    const contextMap = new Map();
    // We process tabs in batches to avoid overwhelming the API if we were doing bulk updates,
    // but for now let's just do them one by one or in small groups.
    // Since we don't have a reliable free API key, we will try a heuristic first for common sites,
    // and then maybe use the LLM for the rest if possible.
    // However, the user EXPLICITLY asked to "use a free llm api".
    // So we should try to call the API.
    const promises = tabs.map(async (tab) => {
        try {
            const context = await fetchContextForTab(tab);
            contextMap.set(tab.id, context);
        }
        catch (error) {
            logError(`Failed to analyze context for tab ${tab.id}`, { error: String(error) });
            contextMap.set(tab.id, "Uncategorized");
        }
    });
    await Promise.all(promises);
    return contextMap;
};
const fetchContextForTab = async (tab) => {
    // Simple caching could be added here but keeping it simple for now.
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
                // "Authorization": `Bearer ${API_TOKEN}` // If we had one
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            // Fallback to local heuristic if API fails (e.g. rate limit or auth required)
            logDebug("LLM API failed, falling back to heuristic", { status: response.status });
            return localHeuristic(tab);
        }
        const result = await response.json();
        // specific format for zero-shot classification:
        // { sequence: "...", labels: ["Work", ...], scores: [0.9, ...] }
        if (result && result.labels && result.labels.length > 0) {
            return result.labels[0];
        }
        return "Uncategorized";
    }
    catch (e) {
        logDebug("LLM API error, falling back to heuristic", { error: String(e) });
        return localHeuristic(tab);
    }
};
const localHeuristic = (tab) => {
    const url = tab.url.toLowerCase();
    const title = tab.title.toLowerCase();
    if (url.includes("github") || url.includes("stackoverflow") || url.includes("localhost"))
        return "Development";
    if (url.includes("google") && (url.includes("docs") || url.includes("sheets")))
        return "Work";
    if (url.includes("linkedin") || url.includes("slack"))
        return "Work";
    if (url.includes("youtube") || url.includes("netflix") || url.includes("spotify"))
        return "Entertainment";
    if (url.includes("twitter") || url.includes("facebook") || url.includes("instagram") || url.includes("reddit"))
        return "Social";
    if (url.includes("amazon") || url.includes("ebay"))
        return "Shopping";
    if (url.includes("cnn") || url.includes("bbc") || url.includes("nytimes"))
        return "News";
    return "Uncategorized";
};
