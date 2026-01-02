import { normalizeUrl, parseYouTubeUrl, extractJsonLdFields } from './logic.js';

const getMeta = (name: string) =>
    document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ||
    document.querySelector(`meta[property="${name}"]`)?.getAttribute("content");

const getJsonLd = () => {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const data: any[] = [];
    scripts.forEach(s => {
      try {
        const json = JSON.parse(s.textContent || '{}');
        if (Array.isArray(json)) data.push(...json);
        else data.push(json);
      } catch (e) {}
    });
    return data;
};

const extractGeneric = () => {
    const url = window.location.href;
    const hostname = window.location.hostname;

    // Identity
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || url;
    const normalized = normalizeUrl(url);
    const siteName = getMeta('og:site_name') || hostname;

    // Platform
    let platform = hostname.replace(/^www\./, '');
    if (platform.includes('youtube')) platform = 'YouTube';
    else if (platform.includes('github')) platform = 'GitHub';
    else if (platform.includes('stackoverflow')) platform = 'Stack Overflow';
    else if (platform.includes('google')) platform = 'Google';
    else if (platform.includes('jira') || platform.includes('atlassian')) platform = 'Jira';
    else platform = platform.split('.')[0];

    // Object Type
    const ogType = getMeta('og:type') || '';
    let objectType = 'unknown';
    if (ogType.includes('video')) objectType = 'video';
    else if (ogType.includes('article')) objectType = 'article';
    else if (url.includes('/login') || url.includes('/signin')) objectType = 'login';
    if (objectType === 'unknown') {
       if (document.querySelector('video')) objectType = 'video';
       else if (document.querySelector('article')) objectType = 'article';
    }

    const objectId = canonical;
    const title = document.title || getMeta('og:title') || getMeta('twitter:title');
    const description = getMeta('description') || getMeta('og:description');

    // JSON-LD
    const jsonLd = getJsonLd();
    const jsonLdFields = extractJsonLdFields(jsonLd);

    return {
      canonicalUrl: canonical,
      normalizedUrl: normalized,
      siteName,
      platform,
      objectType,
      objectId,
      title,
      description,
      authorOrCreator: jsonLdFields.author,
      publishedAt: jsonLdFields.publishedAt,
      modifiedAt: jsonLdFields.modifiedAt,
      language: document.documentElement.lang || null,
      tags: jsonLdFields.tags,
      breadcrumbs: jsonLdFields.breadcrumbs,
      isAudible: false,
      isMuted: false,
      isCapturing: false,
      progress: null,
      hasUnsavedChangesLikely: false,
      isAuthenticatedLikely: false,
      sources: { title: document.title ? 'dom' : 'meta' },
      confidence: {}
    };
};

const extractYouTube = (baseContext: any) => {
    if (!window.location.hostname.includes('youtube.com') && !window.location.hostname.includes('youtu.be')) return {};

    const { videoId, isShorts, playlistId, playlistIndex } = parseYouTubeUrl(window.location.href);

    const isLive = Boolean(document.querySelector('.ytd-badge-supported-renderer.badge-style-type-live-now'));

    const channelName = document.querySelector<HTMLElement>("#upload-info #channel-name a")?.innerText
        || document.querySelector<HTMLElement>("ytd-channel-name a")?.innerText
        || "";
    const channelId = document.querySelector<HTMLElement>("ytd-channel-name a")?.getAttribute('href')?.replace('/channel/', '') || null;

    let contentSubtype = 'standard';
    if (isShorts) contentSubtype = 'shorts';
    else if (isLive) contentSubtype = 'live';

    const video = document.querySelector('video');
    let playbackProgress = null;
    let durationSeconds = null;
    if (video) {
       durationSeconds = video.duration;
       if (!isNaN(video.currentTime) && !isNaN(video.duration) && video.duration > 0) {
         playbackProgress = {
           currentSeconds: video.currentTime,
           durationSeconds: video.duration,
           percent: video.currentTime / video.duration
         };
       }
    }

    return {
      youtube: {
        videoId,
        channelId,
        contentSubtype,
        durationSeconds,
        playbackProgress,
        playlistId,
        playlistIndex
      },
      authorOrCreator: channelName || baseContext.authorOrCreator,
      objectType: 'video',
      platform: 'YouTube'
    };
};

const base = extractGeneric();
const yt = extractYouTube(base);
const result = { ...base, ...yt };

(window as any).__EXTRACTED_CONTEXT__ = result;
