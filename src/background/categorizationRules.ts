import { PageContext } from "../shared/types.js";

export interface CategorizationRule {
  id: string;
  condition: (context: PageContext) => boolean;
  category: string;
}

export const CATEGORIZATION_RULES: CategorizationRule[] = [
  {
    id: "entertainment-platforms",
    condition: (data) => ['YouTube', 'Netflix', 'Spotify', 'Twitch'].includes(data.platform || ''),
    category: "Entertainment"
  },
  {
    id: "development-platforms",
    condition: (data) => ['GitHub', 'Stack Overflow', 'Jira', 'GitLab'].includes(data.platform || ''),
    category: "Development"
  },
  {
    id: "google-work-suite",
    condition: (data) => data.platform === 'Google' && ['docs', 'sheets', 'slides'].some(k => data.normalizedUrl.includes(k)),
    category: "Work"
  }
];

export function determineCategoryFromContext(data: PageContext): string {
  // 1. Check explicit rules
  for (const rule of CATEGORIZATION_RULES) {
    if (rule.condition(data)) {
      return rule.category;
    }
  }

  // 2. Fallback to Object Type mapping
  if (data.objectType && data.objectType !== 'unknown') {
    if (data.objectType === 'video') return 'Entertainment';
    if (data.objectType === 'article') return 'News';
    // Capitalize first letter for other types
    return data.objectType.charAt(0).toUpperCase() + data.objectType.slice(1);
  }

  // 3. Default fallback
  return "General Web";
}
