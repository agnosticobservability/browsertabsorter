import { TabMetadata, PageContext } from "../shared/types.js";
import { logDebug, logError } from "../shared/logger.js";
import { extractPageContext } from "./extraction/index.js";

export interface ContextResult {
  context: string;
  source: 'AI' | 'Heuristic' | 'Extraction';
  data?: PageContext;
  error?: string;
  status?: string;
}

interface CacheEntry {
  result: ContextResult;
  timestamp: number;
}

const contextCache = new Map<string, CacheEntry>();
const CACHE_TTL_SUCCESS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_TTL_ERROR = 5 * 60 * 1000; // 5 minutes

export const analyzeTabContext = async (
  tabs: TabMetadata[],
  onProgress?: (completed: number, total: number) => void
): Promise<Map<number, ContextResult>> => {
  const contextMap = new Map<number, ContextResult>();
  let completed = 0;
  const total = tabs.length;

  const promises = tabs.map(async (tab) => {
    try {
      const cacheKey = `${tab.id}::${tab.url}`;
      const cached = contextCache.get(cacheKey);

      if (cached) {
        const isError = cached.result.status === 'ERROR' || !!cached.result.error;
        const ttl = isError ? CACHE_TTL_ERROR : CACHE_TTL_SUCCESS;

        if (Date.now() - cached.timestamp < ttl) {
          contextMap.set(tab.id, cached.result);
          return;
        } else {
          contextCache.delete(cacheKey);
        }
      }

      const result = await fetchContextForTab(tab);

      // Cache with expiration logic
      contextCache.set(cacheKey, {
        result,
        timestamp: Date.now()
      });

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

const fetchContextForTab = async (tab: TabMetadata): Promise<ContextResult> => {
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

  // 4. Fallback to AI (LLM) - REMOVED
  // The HuggingFace API endpoint is 410 Gone and/or requires authentication which we do not have.
  // The code has been removed to prevent errors.

  if (context !== "Uncategorized" && source !== "Extraction") {
    error = undefined;
    status = undefined;
  }

  return { context, source, data: data || undefined, error, status };
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
