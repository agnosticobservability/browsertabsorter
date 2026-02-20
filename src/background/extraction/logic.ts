// logic.ts
// Pure functions for extraction logic

const TRACKING_PARAMS = [
  /^utm_/,
  /^fbclid$/,
  /^gclid$/,
  /^_ga$/,
  /^ref$/,
  /^yclid$/,
  /^_hs/
];

const DOMAIN_ALLOWLISTS: Record<string, string[]> = {
  'youtube.com': ['v', 'list', 't', 'c', 'channel', 'playlist'],
  'youtu.be': ['v', 'list', 't', 'c', 'channel', 'playlist'],
  'google.com': ['q', 'id', 'sourceid']
};

function getAllowedParams(hostname: string): string[] | null {
  if (DOMAIN_ALLOWLISTS[hostname]) return DOMAIN_ALLOWLISTS[hostname];
  for (const domain in DOMAIN_ALLOWLISTS) {
    if (hostname.endsWith('.' + domain)) return DOMAIN_ALLOWLISTS[domain];
  }
  return null;
}

export function normalizeUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    const params = new URLSearchParams(url.search);
    const hostname = url.hostname.replace(/^www\./, '');
    const allowedParams = getAllowedParams(hostname);

    const keys: string[] = [];
    params.forEach((_, key) => keys.push(key));

    for (const key of keys) {
      if (TRACKING_PARAMS.some(r => r.test(key))) {
        params.delete(key);
        continue;
      }
      if (allowedParams && !allowedParams.includes(key)) {
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

function extractAuthor(entity: any): string | null {
    if (!entity || !entity.author) return null;
    if (typeof entity.author === 'string') return entity.author;
    if (Array.isArray(entity.author)) return entity.author[0]?.name || null;
    if (typeof entity.author === 'object') return entity.author.name || null;
    return null;
}

function extractKeywords(entity: any): string[] {
    if (!entity || !entity.keywords) return [];
    if (typeof entity.keywords === 'string') {
        return entity.keywords.split(',').map((s: string) => s.trim());
    }
    if (Array.isArray(entity.keywords)) return entity.keywords;
    return [];
}

function extractBreadcrumbs(jsonLd: any[]): string[] {
    const breadcrumbLd = jsonLd.find(i => i && i['@type'] === 'BreadcrumbList');
    if (!breadcrumbLd || !Array.isArray(breadcrumbLd.itemListElement)) return [];

    const list = breadcrumbLd.itemListElement.sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
    const breadcrumbs: string[] = [];
    list.forEach((item: any) => {
        if (item.name) breadcrumbs.push(item.name);
        else if (item.item && item.item.name) breadcrumbs.push(item.item.name);
    });
    return breadcrumbs;
}

export function extractJsonLdFields(jsonLd: any[]) {
    // Find main entity
    // Added safety check: i && i['@type']
    const mainEntity = jsonLd.find(i => i && (i['@type'] === 'Article' || i['@type'] === 'VideoObject' || i['@type'] === 'NewsArticle')) || jsonLd[0];

    let author: string | null = null;
    let publishedAt: string | null = null;
    let modifiedAt: string | null = null;
    let tags: string[] = [];

    if (mainEntity) {
        author = extractAuthor(mainEntity);
        publishedAt = mainEntity.datePublished || null;
        modifiedAt = mainEntity.dateModified || null;
        tags = extractKeywords(mainEntity);
    }

    const breadcrumbs = extractBreadcrumbs(jsonLd);

    return { author, publishedAt, modifiedAt, tags, breadcrumbs };
}

export interface YouTubeMetadata {
  author: string | null;
  publishedAt: string | null;
  genre: string | null;
}

export function extractYouTubeMetadataFromHtml(html: string): YouTubeMetadata {
  let author: string | null = null;
  let publishedAt: string | null = null;
  let genre: string | null = null;

  // 1. Try JSON-LD
  // Look for <script type="application/ld+json">...</script>
  // We need to loop because there might be multiple scripts
  const scriptRegex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
      try {
          const json = JSON.parse(match[1]);
          const array = Array.isArray(json) ? json : [json];
          const fields = extractJsonLdFields(array);
          if (fields.author && !author) author = fields.author;
          if (fields.publishedAt && !publishedAt) publishedAt = fields.publishedAt;
      } catch (e) {
          // ignore parse errors
      }
  }

  // 2. Try <link itemprop="name" content="..."> (YouTube often puts channel name here in some contexts)
  if (!author) {
      const linkNameRegex = /<link\s+itemprop=["']name["']\s+content=["']([^"']+)["']\s*\/?>/i;
      const linkMatch = linkNameRegex.exec(html);
      if (linkMatch && linkMatch[1]) author = decodeHtmlEntities(linkMatch[1]);
  }

  // 3. Try meta author
  if (!author) {
      const metaAuthorRegex = /<meta\s+name=["']author["']\s+content=["']([^"']+)["']\s*\/?>/i;
      const metaMatch = metaAuthorRegex.exec(html);
      if (metaMatch && metaMatch[1]) {
          // YouTube meta author is often "Channel Name"
          author = decodeHtmlEntities(metaMatch[1]);
      }
  }

  // 4. Try meta datePublished / uploadDate
  if (!publishedAt) {
      const metaDateRegex = /<meta\s+itemprop=["']datePublished["']\s+content=["']([^"']+)["']\s*\/?>/i;
      const dateMatch = metaDateRegex.exec(html);
      if (dateMatch && dateMatch[1]) publishedAt = dateMatch[1];
  }
  if (!publishedAt) {
      const metaUploadDateRegex = /<meta\s+itemprop=["']uploadDate["']\s+content=["']([^"']+)["']\s*\/?>/i;
      const uploadDateMatch = metaUploadDateRegex.exec(html);
      if (uploadDateMatch && uploadDateMatch[1]) publishedAt = uploadDateMatch[1];
  }

  // 5. Genre
  genre = extractYouTubeGenreFromHtml(html);

  return { author, publishedAt, genre };
}

export function extractYouTubeGenreFromHtml(html: string): string | null {
  // 1. Try <meta itemprop="genre" content="...">
  const metaGenreRegex = /<meta\s+itemprop=["']genre["']\s+content=["']([^"']+)["']\s*\/?>/i;
  const metaMatch = metaGenreRegex.exec(html);
  if (metaMatch && metaMatch[1]) {
      return decodeHtmlEntities(metaMatch[1]);
  }

  // 2. Try JSON "category" in scripts
  // "category":"Gaming"
  const categoryRegex = /"category"\s*:\s*"([^"]+)"/;
  const catMatch = categoryRegex.exec(html);
  if (catMatch && catMatch[1]) {
      return decodeHtmlEntities(catMatch[1]);
  }

  return null;
}

function decodeHtmlEntities(text: string): string {
  if (!text) return text;

  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' '
  };

  return text.replace(/&([a-z0-9]+|#[0-9]{1,6}|#x[0-9a-fA-F]{1,6});/ig, (match) => {
      const lower = match.toLowerCase();
      if (entities[lower]) return entities[lower];
      if (entities[match]) return entities[match];

      if (lower.startsWith('&#x')) {
          try { return String.fromCharCode(parseInt(lower.slice(3, -1), 16)); } catch { return match; }
      }
      if (lower.startsWith('&#')) {
          try { return String.fromCharCode(parseInt(lower.slice(2, -1), 10)); } catch { return match; }
      }
      return match;
  });
}
