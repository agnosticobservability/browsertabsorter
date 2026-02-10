import { PageContext, TabMetadata } from "../../shared/types.js";
import { normalizeUrl, parseYouTubeUrl, extractYouTubeChannelFromHtml } from "./logic.js";
import { getGenera } from "./generaRegistry.js";
import { logDebug } from "../../shared/logger.js";
import { loadPreferences } from "../preferences.js";
import { extractYouTubeData, determineChannelGenre } from "./youtube.js";

interface ExtractionResponse {
  data: PageContext | null;
  error?: string;
  status:
    | 'OK'
    | 'RESTRICTED'
    | 'INJECTION_FAILED'
    | 'NO_RESPONSE'
    | 'NO_HOST_PERMISSION'
    | 'FRAME_ACCESS_DENIED';
}

// Simple concurrency control
let activeFetches = 0;
const MAX_CONCURRENT_FETCHES = 5; // Conservative limit to avoid rate limiting
const FETCH_QUEUE: (() => void)[] = [];

const fetchWithTimeout = async (url: string, timeout = 2000): Promise<Response> => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { signal: controller.signal });
        return response;
    } finally {
        clearTimeout(id);
    }
};

const enqueueFetch = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (activeFetches >= MAX_CONCURRENT_FETCHES) {
        await new Promise<void>(resolve => FETCH_QUEUE.push(resolve));
    }
    activeFetches++;
    try {
        return await fn();
    } finally {
        activeFetches--;
        if (FETCH_QUEUE.length > 0) {
            const next = FETCH_QUEUE.shift();
            if (next) next();
        }
    }
};

export const extractPageContext = async (tab: TabMetadata | chrome.tabs.Tab): Promise<ExtractionResponse> => {
  try {
    if (!tab || !tab.url) {
        return { data: null, error: "Tab not found or no URL", status: 'NO_RESPONSE' };
    }

    if (
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('edge://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('chrome-error://')
    ) {
        return { data: null, error: "Restricted URL scheme", status: 'RESTRICTED' };
    }

    const prefs = await loadPreferences();
    let baseline = buildBaselineContext(tab as chrome.tabs.Tab, prefs.customGenera);

    // Fetch and enrich for YouTube
    const targetUrl = tab.url;
    const urlObj = new URL(targetUrl);
    const hostname = urlObj.hostname.replace(/^www\./, '');
    const isYouTube = hostname.endsWith('youtube.com') || hostname.endsWith('youtu.be');

    if (isYouTube) {
        if (prefs.enableYouTubeGenreDetection) {
             try {
                 const ytData = await extractYouTubeData(tab as TabMetadata);
                 const genreResult = await determineChannelGenre(ytData, prefs.youtubeApiKey);

                 const { videoId, playlistId, playlistIndex } = parseYouTubeUrl(targetUrl);

                 baseline.youtube = {
                     videoId,
                     channelId: ytData.channelId,
                     channelHandle: ytData.channelHandle || undefined,
                     channelName: ytData.channelName || undefined,
                     genre: genreResult.genre,
                     genreSource: genreResult.source,
                     contentSubtype: null,
                     durationSeconds: null,
                     playbackProgress: null,
                     playlistId,
                     playlistIndex
                 };

                 if (genreResult.genre !== 'Unknown') {
                     baseline.genre = genreResult.genre;
                     baseline.sources.genre = genreResult.source;
                 }

                 if (ytData.channelName || ytData.channelHandle) {
                     baseline.authorOrCreator = ytData.channelName || ytData.channelHandle || null;
                 }
             } catch (ytError) {
                 logDebug("YouTube extraction failed", { error: String(ytError) });
             }
        } else if (!baseline.authorOrCreator) {
             // Fallback: Fetch channel name if missing and detection disabled
             try {
                 await enqueueFetch(async () => {
                     const response = await fetchWithTimeout(targetUrl);
                     if (response.ok) {
                         const html = await response.text();
                         const channel = extractYouTubeChannelFromHtml(html);
                         if (channel) {
                             baseline.authorOrCreator = channel;
                         }
                     }
                 });
             } catch (fetchErr) {
                 logDebug("Failed to fetch YouTube page content", { error: String(fetchErr) });
             }
        }
    }

    return {
      data: baseline,
      status: 'OK'
    };

  } catch (e: any) {
    logDebug(`Extraction failed for tab ${tab.id}`, { error: String(e) });
    return {
      data: null,
      error: String(e),
      status: 'INJECTION_FAILED'
    };
  }
};

const buildBaselineContext = (tab: chrome.tabs.Tab, customGenera?: Record<string, string>): PageContext => {
  const url = tab.url || "";
  let hostname = "";
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    hostname = "";
  }

  // Determine Object Type first
  let objectType: PageContext['objectType'] = 'unknown';
  let authorOrCreator: string | null = null;

  if (url.includes('/login') || url.includes('/signin')) {
      objectType = 'login';
  } else if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      const { videoId } = parseYouTubeUrl(url);
      if (videoId) objectType = 'video';

      // Try to guess channel from URL if possible
      if (url.includes('/@')) {
          const parts = url.split('/@');
          if (parts.length > 1) {
              const handle = parts[1].split('/')[0];
              authorOrCreator = '@' + handle;
          }
      } else if (url.includes('/c/')) {
          const parts = url.split('/c/');
          if (parts.length > 1) {
              authorOrCreator = decodeURIComponent(parts[1].split('/')[0]);
          }
      } else if (url.includes('/user/')) {
          const parts = url.split('/user/');
          if (parts.length > 1) {
              authorOrCreator = decodeURIComponent(parts[1].split('/')[0]);
          }
      }
  } else if (hostname === 'github.com' && url.includes('/pull/')) {
      objectType = 'ticket';
  } else if (hostname === 'github.com' && !url.includes('/pull/') && url.split('/').length >= 5) {
      // rough check for repo
      objectType = 'repo';
  }

  // Determine Genre
  // Priority 1: Site-specific extraction (derived from objectType)
  let genre: string | undefined;

  if (objectType === 'video') genre = 'Video';
  else if (objectType === 'repo' || objectType === 'ticket') genre = 'Development';

  // Priority 2: Fallback to Registry
  if (!genre) {
     genre = getGenera(hostname, customGenera) || undefined;
  }

  return {
    canonicalUrl: url || null,
    normalizedUrl: normalizeUrl(url),
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
