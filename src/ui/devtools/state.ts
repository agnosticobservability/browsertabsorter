import { ContextResult, CustomStrategy, LogEntry } from "../../shared/types.js";

export interface ColumnDefinition {
    key: string;
    label: string;
    visible: boolean;
    width: string; // CSS width
    filterable: boolean;
}

export const appState = {
    currentTabs: [] as chrome.tabs.Tab[],
    localCustomStrategies: [] as CustomStrategy[],
    currentContextMap: new Map<number, ContextResult>(),
    tabTitles: new Map<number, string>(),
    sortKey: null as string | null,
    sortDirection: 'asc' as 'asc' | 'desc',
    simulatedSelection: new Set<number>(),

    // Modern Table State
    globalSearchQuery: '',
    columnFilters: {} as Record<string, string>,
    columns: [
        { key: 'id', label: 'ID', visible: true, width: '60px', filterable: true },
        { key: 'index', label: 'Index', visible: true, width: '60px', filterable: true },
        { key: 'windowId', label: 'Window', visible: true, width: '70px', filterable: true },
        { key: 'groupId', label: 'Group', visible: true, width: '70px', filterable: true },
        { key: 'title', label: 'Title', visible: true, width: '200px', filterable: true },
        { key: 'url', label: 'URL', visible: true, width: '250px', filterable: true },
        { key: 'genre', label: 'Genre', visible: true, width: '100px', filterable: true },
        { key: 'context', label: 'Category', visible: true, width: '100px', filterable: true },
        { key: 'siteName', label: 'Site Name', visible: true, width: '120px', filterable: true },
        { key: 'platform', label: 'Platform', visible: true, width: '100px', filterable: true },
        { key: 'objectType', label: 'Object Type', visible: true, width: '100px', filterable: true },
        { key: 'extractedTitle', label: 'Extracted Title', visible: false, width: '200px', filterable: true },
        { key: 'authorOrCreator', label: 'Author', visible: true, width: '120px', filterable: true },
        { key: 'publishedAt', label: 'Published', visible: false, width: '100px', filterable: true },
        { key: 'status', label: 'Status', visible: false, width: '80px', filterable: true },
        { key: 'active', label: 'Active', visible: false, width: '60px', filterable: true },
        { key: 'pinned', label: 'Pinned', visible: false, width: '60px', filterable: true },
        { key: 'openerTabId', label: 'Opener', visible: false, width: '70px', filterable: true },
        { key: 'parentTitle', label: 'Parent Title', visible: false, width: '150px', filterable: true },
        { key: 'lastAccessed', label: 'Last Accessed', visible: true, width: '150px', filterable: false },
        { key: 'actions', label: 'Actions', visible: true, width: '120px', filterable: false }
    ] as ColumnDefinition[],

    currentLogs: [] as LogEntry[]
};
