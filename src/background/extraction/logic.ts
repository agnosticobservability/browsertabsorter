// logic.ts
// Pure functions for extraction logic

export function normalizeUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    const params = new URLSearchParams(url.search);
    const keys: string[] = [];
    params.forEach((_, key) => keys.push(key));
    const hostname = url.hostname.replace(/^www\./, '');

    const TRACKING = [/^utm_/, /^fbclid$/, /^gclid$/, /^_ga$/, /^ref$/, /^yclid$/, /^_hs/];
    const isYoutube = hostname.endsWith('youtube.com') || hostname.endsWith('youtu.be');
    const isGoogle = hostname.endsWith('google.com');

    const keep: string[] = [];
    if (isYoutube) keep.push('v', 'list', 't', 'c', 'channel', 'playlist');
    if (isGoogle) keep.push('q', 'id', 'sourceid');

    for (const key of keys) {
      if (TRACKING.some(r => r.test(key))) {
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

export function parseYouTubeUrl(urlStr: string) {
    try {
        const url = new URL(urlStr);
        const v = url.searchParams.get('v');
        const isShorts = url.pathname.includes('/shorts/');
        let videoId =
          v ||
          (isShorts ? url.pathname.split('/shorts/')[1] : null) ||
          (url.hostname === 'youtu.be' ? url.pathname.replace('/', '') : null);

        const playlistId = url.searchParams.get('list');
        const playlistIndex = parseInt(url.searchParams.get('index') || '0', 10);

        return { videoId, isShorts, playlistId, playlistIndex };
    } catch (e) {
        return { videoId: null, isShorts: false, playlistId: null, playlistIndex: null };
    }
}

export function extractJsonLdFields(jsonLd: any[]) {
    let author: string | null = null;
    let publishedAt: string | null = null;
    let modifiedAt: string | null = null;
    let tags: string[] = [];
    let breadcrumbs: string[] = [];

    // Find main entity
    // Added safety check: i && i['@type']
    const mainEntity = jsonLd.find(i => i && (i['@type'] === 'Article' || i['@type'] === 'VideoObject' || i['@type'] === 'NewsArticle')) || jsonLd[0];

    if (mainEntity) {
       if (mainEntity.author) {
          if (typeof mainEntity.author === 'string') author = mainEntity.author;
          else if (mainEntity.author.name) author = mainEntity.author.name;
          else if (Array.isArray(mainEntity.author) && mainEntity.author[0]?.name) author = mainEntity.author[0].name;
       }
       if (mainEntity.datePublished) publishedAt = mainEntity.datePublished;
       if (mainEntity.dateModified) modifiedAt = mainEntity.dateModified;
       if (mainEntity.keywords) {
         if (typeof mainEntity.keywords === 'string') tags = mainEntity.keywords.split(',').map((s: string) => s.trim());
         else if (Array.isArray(mainEntity.keywords)) tags = mainEntity.keywords;
       }
    }

    // Added safety check: i && i['@type']
    const breadcrumbLd = jsonLd.find(i => i && i['@type'] === 'BreadcrumbList');
    if (breadcrumbLd && Array.isArray(breadcrumbLd.itemListElement)) {
       const list = breadcrumbLd.itemListElement.sort((a: any, b: any) => a.position - b.position);
       list.forEach((item: any) => {
         if (item.name) breadcrumbs.push(item.name);
         else if (item.item && item.item.name) breadcrumbs.push(item.item.name);
       });
    }

    return { author, publishedAt, modifiedAt, tags, breadcrumbs };
}
