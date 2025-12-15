const recencyScore = (tab) => tab.lastAccessed ?? 0;
const hierarchyScore = (tab) => (tab.openerTabId !== undefined ? 1 : 0);
const pinnedScore = (tab) => (tab.pinned ? 0 : 1);
export const sortTabs = (tabs, strategies) => {
    const scoring = strategies.length ? strategies : ["pinned", "recency"];
    return [...tabs].sort((a, b) => {
        for (const strategy of scoring) {
            const diff = compareBy(strategy, a, b);
            if (diff !== 0)
                return diff;
        }
        return a.id - b.id;
    });
};
const compareBy = (strategy, a, b) => {
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
        case "context":
            return (a.context ?? "").localeCompare(b.context ?? "");
        default:
            return 0;
    }
};
