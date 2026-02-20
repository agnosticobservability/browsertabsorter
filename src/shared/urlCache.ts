const hostnameCache = new Map<string, string>();
const MAX_CACHE_SIZE = 1000;

export const getHostname = (url: string): string | null => {
  if (hostnameCache.has(url)) return hostnameCache.get(url)!;

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;

    if (hostnameCache.size >= MAX_CACHE_SIZE) hostnameCache.clear();
    hostnameCache.set(url, hostname);
    return hostname;
  } catch {
    return null;
  }
};
