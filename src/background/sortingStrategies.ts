import { SortingStrategy, TabMetadata } from "../shared/types.js";

const recencyScore = (tab: TabMetadata) => tab.lastAccessed ?? 0;
const hierarchyScore = (tab: TabMetadata) => (tab.openerTabId !== undefined ? 1 : 0);
const pinnedScore = (tab: TabMetadata) => (tab.pinned ? 0 : 1);

export const sortTabs = (tabs: TabMetadata[], strategies: SortingStrategy[]): TabMetadata[] => {
  const scoring: SortingStrategy[] = strategies.length ? strategies : ["pinned", "recency"];
  return [...tabs].sort((a, b) => {
    for (const strategy of scoring) {
      const diff = compareBy(strategy, a, b);
      if (diff !== 0) return diff;
    }
    return a.id - b.id;
  });
};

const compareBy = (strategy: SortingStrategy, a: TabMetadata, b: TabMetadata): number => {
  switch (strategy) {
    case "recency":
      return (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0);
    case "hierarchy":
      return hierarchyScore(a) - hierarchyScore(b);
    case "pinned":
      return pinnedScore(a) - pinnedScore(b);
    case "title":
      return a.title.localeCompare(b.title);
    case "url":
      return a.url.localeCompare(b.url);
    case "youtube-channel":
      if (a.youtubeChannel && b.youtubeChannel) {
        return a.youtubeChannel.localeCompare(b.youtubeChannel);
      }
      if (a.youtubeChannel) return -1;
      if (b.youtubeChannel) return 1;
      return 0;
    default:
      return 0;
  }
};
