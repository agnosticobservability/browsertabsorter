import { TabMetadata, PageContext, Preferences, AIPreferences } from "../shared/types.js";
import { logDebug, logError } from "../shared/logger.js";
import { extractPageContext } from "./extraction/index.js";
import { loadPreferences } from "./preferences.js";

export interface ContextResult {
  context: string;
  source: 'AI' | 'Heuristic' | 'Extraction';
  data?: PageContext;
  error?: string;
  status?: string;
}

const contextCache = new Map<string, ContextResult>();

export const analyzeTabContext = async (
  tabs: TabMetadata[],
  onProgress?: (completed: number, total: number) => void
): Promise<Map<number, ContextResult>> => {
  const contextMap = new Map<number, ContextResult>();
  let completed = 0;
  const total = tabs.length;

  // Load preferences once
  let preferences: Preferences | undefined;
  try {
      preferences = await loadPreferences();
  } catch (e) {
      logError("Failed to load preferences during context analysis", { error: String(e) });
  }

  const promises = tabs.map(async (tab) => {
    try {
      const cacheKey = `${tab.id}::${tab.url}`;
      if (contextCache.has(cacheKey)) {
        contextMap.set(tab.id, contextCache.get(cacheKey)!);
        return;
      }

      const result = await fetchContextForTab(tab, preferences);

      // Only cache valid results to allow retrying on transient errors?
      // Actually, if we cache error, we stop retrying.
      // Let's cache everything for now to prevent spamming if it keeps failing.
      contextCache.set(cacheKey, result);

      contextMap.set(tab.id, result);
    } catch (error) {
      logError(`Failed to analyze context for tab ${tab.id}`, { error: String(error) });
      // Even if fetchContextForTab fails completely, we try a safe sync fallback
      contextMap.set(tab.id, { context: "Uncategorized", source: 'Heuristic', error: String(error), status: 'ERROR' });
    } finally {
      completed++;
      if (onProgress) onProgress(completed, total);
    }
  });

  await Promise.all(promises);
  return contextMap;
};

const fetchContextForTab = async (tab: TabMetadata, prefs?: Preferences): Promise<ContextResult> => {
  // 1. Run Generic Extraction (Always)
  let data: PageContext | null = null;
  let error: string | undefined;
  let status: string | undefined;

  try {
      const extraction = await extractPageContext(tab);
      data = extraction.data;
      error = extraction.error;
      status = extraction.status;
  } catch (e) {
      logDebug(`Extraction failed for tab ${tab.id}`, { error: String(e) });
      error = String(e);
      status = 'ERROR';
  }

  let context = "Uncategorized";
  let source: ContextResult['source'] = 'Heuristic';

  // 2. Try to Determine Category from Extraction Data
  if (data) {
      if (data.platform === 'YouTube' || data.platform === 'Netflix' || data.platform === 'Spotify' || data.platform === 'Twitch') {
          context = "Entertainment";
          source = 'Extraction';
      } else if (data.platform === 'GitHub' || data.platform === 'Stack Overflow' || data.platform === 'Jira' || data.platform === 'GitLab') {
          context = "Development";
          source = 'Extraction';
      } else if (data.platform === 'Google' && (data.normalizedUrl.includes('docs') || data.normalizedUrl.includes('sheets') || data.normalizedUrl.includes('slides'))) {
          context = "Work";
          source = 'Extraction';
      } else {
        // If we have successful extraction data but no specific rule matched,
        // use the Object Type or generic "General Web" to indicate extraction worked.
        // We prefer specific categories, but "Article" or "Video" are better than "Uncategorized".
        if (data.objectType && data.objectType !== 'unknown') {
             // Map object types to categories if possible
             if (data.objectType === 'video') context = 'Entertainment';
             else if (data.objectType === 'article') context = 'News'; // Loose mapping, but better than nothing
             else context = data.objectType.charAt(0).toUpperCase() + data.objectType.slice(1);
        } else {
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

  // 4. Fallback to AI (LLM)
  if (context === "Uncategorized" && prefs?.ai?.enabled) {
      const aiResult = await fetchContextFromAI(tab, prefs.ai, data);
      if (aiResult.context && aiResult.context !== "Uncategorized") {
          context = aiResult.context;
          source = 'AI';
          // Clean up error if success
          error = undefined;
          status = undefined;
      } else if (aiResult.error) {
          // Keep the error for debugging if AI failed but don't change context
          logDebug("AI Analysis failed", { error: aiResult.error });
      }
  }

  if (context !== "Uncategorized" && source !== "Extraction") {
    error = undefined;
    status = undefined;
  }

  return { context, source, data: data || undefined, error, status };
};

export const fetchContextFromAI = async (tab: TabMetadata, aiPrefs: AIPreferences, contextData?: PageContext | null): Promise<ContextResult> => {
    if (!aiPrefs.enabled) return { context: "Uncategorized", source: 'AI', status: 'DISABLED' };

    // Check key only for OpenAI, Custom might not need it
    if (aiPrefs.provider === 'openai' && !aiPrefs.apiKey) {
        return { context: "Uncategorized", source: 'AI', error: "Missing API Key", status: 'ERROR' };
    }

    const endpoint = aiPrefs.provider === 'custom'
        ? aiPrefs.endpoint
        : 'https://api.openai.com/v1/chat/completions';

    if (!endpoint) {
         return { context: "Uncategorized", source: 'AI', error: "Missing Endpoint", status: 'ERROR' };
    }

    const model = aiPrefs.model || 'gpt-4o-mini';

    const systemPrompt = `You are a web page classifier. Analyze the following page information and categorize it into exactly ONE of these categories: Development, Work, Entertainment, News, Shopping, Social, Education, Travel, Health, Sports, Technology, Science, Gaming, Music, Art, Finance, Government, Reference. If uncertain, choose the best fit or 'General'. Reply ONLY with the category name.`;

    const description = contextData?.description || tab.contextData?.description || '';
    const userPrompt = `Title: ${tab.title}\nURL: ${tab.url}\nDescription: ${description}`;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': aiPrefs.apiKey ? `Bearer ${aiPrefs.apiKey}` : undefined
            } as any,
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.3,
                max_tokens: 10
            })
        });

        if (!response.ok) {
            const errText = await response.text();
             return { context: "Uncategorized", source: 'AI', error: `API Error ${response.status}: ${errText}`, status: 'ERROR' };
        }

        const json = await response.json();
        const content = json.choices?.[0]?.message?.content?.trim();

        if (content) {
            // Basic sanitization: remove punctuation, keep letters
            const category = content.replace(/[^a-zA-Z]/g, '');
            return { context: category, source: 'AI' };
        } else {
             return { context: "Uncategorized", source: 'AI', error: "Empty response", status: 'ERROR' };
        }
    } catch (e) {
         return { context: "Uncategorized", source: 'AI', error: String(e), status: 'ERROR' };
    }
};

const localHeuristic = async (tab: TabMetadata): Promise<ContextResult> => {
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

  return { context, source: 'Heuristic' };
};
