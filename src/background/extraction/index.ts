import { PageContext } from "../../shared/types.js";
import { normalizeUrl, parseYouTubeUrl } from "./logic.js";
import { getGenera } from "./generaRegistry.js";
import { logDebug } from "../logger.js";

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

export const extractPageContext = async (tabId: number): Promise<ExtractionResponse> => {
  try {
    const tab = await chrome.tabs.get(tabId);
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

    const baseline = buildBaselineContext(tab);

    // We no longer inject a content script. We rely solely on the baseline context
    // derived from the URL and Tab Title.
    return {
      data: baseline,
      status: 'OK'
    };

  } catch (e: any) {
    logDebug(`Extraction failed for tab ${tabId}`, { error: String(e) });
    return {
      data: null,
      error: String(e),
      status: 'INJECTION_FAILED'
    };
  }
};

const buildBaselineContext = (tab: chrome.tabs.Tab): PageContext => {
  const url = tab.url || "";
  let hostname = "";
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    hostname = "";
  }

  // Determine Object Type first
  let objectType: PageContext['objectType'] = 'unknown';
  if (url.includes('/login') || url.includes('/signin')) {
      objectType = 'login';
  } else if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      const { videoId } = parseYouTubeUrl(url);
      if (videoId) objectType = 'video';
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
     genre = getGenera(hostname) || undefined;
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
      title: tab.title ? 'tab' : 'url',
      genre: 'registry'
    },
    confidence: {}
  };
};

