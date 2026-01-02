"use strict";
(() => {
  // src/background/extraction/logic.ts
  function normalizeUrl(urlStr) {
    try {
      const url = new URL(urlStr);
      const params = new URLSearchParams(url.search);
      const keys = [];
      params.forEach((_, key) => keys.push(key));
      const hostname = url.hostname.replace(/^www\./, "");
      const TRACKING = [/^utm_/, /^fbclid$/, /^gclid$/, /^_ga$/, /^ref$/, /^yclid$/, /^_hs/];
      const isYoutube = hostname.endsWith("youtube.com") || hostname.endsWith("youtu.be");
      const isGoogle = hostname.endsWith("google.com");
      const keep = [];
      if (isYoutube) keep.push("v", "list", "t", "c", "channel", "playlist");
      if (isGoogle) keep.push("q", "id", "sourceid");
      for (const key of keys) {
        if (TRACKING.some((r) => r.test(key))) {
          params.delete(key);
          continue;
        }
        if ((isYoutube || isGoogle) && !keep.includes(key)) {
          params.delete(key);
        }
      }
      url.search = params.toString();
      return url.toString();
    } catch (e) {
      return urlStr;
    }
  }
  function parseYouTubeUrl(urlStr) {
    try {
      const url = new URL(urlStr);
      const v = url.searchParams.get("v");
      const isShorts = url.pathname.includes("/shorts/");
      const videoId = v || (isShorts ? url.pathname.split("/shorts/")[1] : null);
      const playlistId = url.searchParams.get("list");
      const playlistIndex = parseInt(url.searchParams.get("index") || "0", 10);
      return { videoId, isShorts, playlistId, playlistIndex };
    } catch (e) {
      return { videoId: null, isShorts: false, playlistId: null, playlistIndex: null };
    }
  }
  function extractJsonLdFields(jsonLd) {
    let author = null;
    let publishedAt = null;
    let modifiedAt = null;
    let tags = [];
    let breadcrumbs = [];
    const mainEntity = jsonLd.find((i) => i["@type"] === "Article" || i["@type"] === "VideoObject" || i["@type"] === "NewsArticle") || jsonLd[0];
    if (mainEntity) {
      if (mainEntity.author) {
        if (typeof mainEntity.author === "string") author = mainEntity.author;
        else if (mainEntity.author.name) author = mainEntity.author.name;
        else if (Array.isArray(mainEntity.author) && mainEntity.author[0]?.name) author = mainEntity.author[0].name;
      }
      if (mainEntity.datePublished) publishedAt = mainEntity.datePublished;
      if (mainEntity.dateModified) modifiedAt = mainEntity.dateModified;
      if (mainEntity.keywords) {
        if (typeof mainEntity.keywords === "string") tags = mainEntity.keywords.split(",").map((s) => s.trim());
        else if (Array.isArray(mainEntity.keywords)) tags = mainEntity.keywords;
      }
    }
    const breadcrumbLd = jsonLd.find((i) => i["@type"] === "BreadcrumbList");
    if (breadcrumbLd && Array.isArray(breadcrumbLd.itemListElement)) {
      const list = breadcrumbLd.itemListElement.sort((a, b) => a.position - b.position);
      list.forEach((item) => {
        if (item.name) breadcrumbs.push(item.name);
        else if (item.item && item.item.name) breadcrumbs.push(item.item.name);
      });
    }
    return { author, publishedAt, modifiedAt, tags, breadcrumbs };
  }

  // src/background/extraction/content_main.ts
  var getMeta = (name) => document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") || document.querySelector(`meta[property="${name}"]`)?.getAttribute("content");
  var getJsonLd = () => {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const data = [];
    scripts.forEach((s) => {
      try {
        const json = JSON.parse(s.textContent || "{}");
        if (Array.isArray(json)) data.push(...json);
        else data.push(json);
      } catch (e) {
      }
    });
    return data;
  };
  var extractGeneric = () => {
    const url = window.location.href;
    const hostname = window.location.hostname;
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href") || url;
    const normalized = normalizeUrl(url);
    const siteName = getMeta("og:site_name") || hostname;
    let platform = hostname.replace(/^www\./, "");
    if (platform.includes("youtube")) platform = "YouTube";
    else if (platform.includes("github")) platform = "GitHub";
    else if (platform.includes("stackoverflow")) platform = "Stack Overflow";
    else if (platform.includes("google")) platform = "Google";
    else if (platform.includes("jira") || platform.includes("atlassian")) platform = "Jira";
    else platform = platform.split(".")[0];
    const ogType = getMeta("og:type") || "";
    let objectType = "unknown";
    if (ogType.includes("video")) objectType = "video";
    else if (ogType.includes("article")) objectType = "article";
    else if (url.includes("/login") || url.includes("/signin")) objectType = "login";
    if (objectType === "unknown") {
      if (document.querySelector("video")) objectType = "video";
      else if (document.querySelector("article")) objectType = "article";
    }
    const objectId = canonical;
    const title = document.title || getMeta("og:title") || getMeta("twitter:title");
    const description = getMeta("description") || getMeta("og:description");
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
      sources: { title: document.title ? "dom" : "meta" },
      confidence: {}
    };
  };
  var extractYouTube = (baseContext) => {
    if (!window.location.hostname.includes("youtube.com") && !window.location.hostname.includes("youtu.be")) return {};
    const { videoId, isShorts, playlistId, playlistIndex } = parseYouTubeUrl(window.location.href);
    const isLive = Boolean(document.querySelector(".ytd-badge-supported-renderer.badge-style-type-live-now"));
    const channelName = document.querySelector("#upload-info #channel-name a")?.innerText || document.querySelector("ytd-channel-name a")?.innerText || "";
    const channelId = document.querySelector("ytd-channel-name a")?.getAttribute("href")?.replace("/channel/", "") || null;
    let contentSubtype = "standard";
    if (isShorts) contentSubtype = "shorts";
    else if (isLive) contentSubtype = "live";
    const video = document.querySelector("video");
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
      objectType: "video",
      platform: "YouTube"
    };
  };
  var base = extractGeneric();
  var yt = extractYouTube(base);
  var result = { ...base, ...yt };
  window.__EXTRACTED_CONTEXT__ = result;
})();
