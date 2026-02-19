import { TabMetadata, PageContext } from "../shared/types.js";
import { logDebug, logError } from "../shared/logger.js";
import { extractPageContext } from "./extraction/index.js";
import { getCategoryFromUrl } from "./categoryRules.js";
import { determineCategoryFromContext } from "./categorizationRules.js";

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
  // We use this to decide when to invalidate cache
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
    context = determineCategoryFromContext(data);
    source = 'Extraction';
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
  const context = getCategoryFromUrl(tab.url);
  return { context, source: 'Heuristic' };
};
