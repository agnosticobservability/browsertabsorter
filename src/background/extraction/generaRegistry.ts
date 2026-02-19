import registryData from './generaRegistry.json';

// Flatten the grouped registry into a single map
const registry: Record<string, string> = {};
for (const [category, domains] of Object.entries(registryData)) {
    for (const domain of domains) {
        registry[domain] = category;
    }
}

export const GENERA_REGISTRY = registry;

export function getGenera(hostname: string, customRegistry?: Record<string, string>): string | null {
  if (!hostname) return null;

  // 0. Check custom registry first
  if (customRegistry) {
      const parts = hostname.split('.');
      // Check full hostname and progressively shorter suffixes
      for (let i = 0; i < parts.length - 1; i++) {
          const domain = parts.slice(i).join('.');
          if (customRegistry[domain]) {
              return customRegistry[domain];
          }
      }
  }

  // 1. Exact match
  if (GENERA_REGISTRY[hostname]) {
    return GENERA_REGISTRY[hostname];
  }

  // 2. Subdomain check (stripping subdomains)
  // e.g. "console.aws.amazon.com" -> "aws.amazon.com" -> "amazon.com"
  const parts = hostname.split('.');

  // Try matching progressively shorter suffixes
  // e.g. a.b.c.com -> b.c.com -> c.com
  for (let i = 0; i < parts.length - 1; i++) {
      const domain = parts.slice(i).join('.');
      if (GENERA_REGISTRY[domain]) {
          return GENERA_REGISTRY[domain];
      }
  }

  return null;
}
