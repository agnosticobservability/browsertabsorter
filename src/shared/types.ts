export interface PageContext {
  // Identity / normalization
  canonicalUrl: string | null;
  normalizedUrl: string;
  siteName: string | null;
  platform: string | null;
  objectType: 'video' | 'article' | 'doc' | 'ticket' | 'repo' | 'product' | 'search' | 'dashboard' | 'login' | 'unknown';
  objectId: string | null;

  // Content descriptors
  title: string | null;
  description: string | null;
  authorOrCreator: string | null;
  publishedAt: string | null;
  modifiedAt: string | null;
  language: string | null;
  tags: string[];
  breadcrumbs: string[];

  // Session/state (privacy-safe)
  isAudible: boolean;
  isMuted: boolean;
  isCapturing: boolean;
  progress: number | null;
  hasUnsavedChangesLikely: boolean;
  isAuthenticatedLikely: boolean;

  // Provenance
  sources: Record<string, string>;
  confidence: Record<string, number>;

  // Site-specific enrichments
  youtube?: {
    videoId: string | null;
    channelId: string | null;
    contentSubtype: 'shorts' | 'live' | 'premiere' | 'standard' | null;
    durationSeconds: number | null;
    playbackProgress: {
      currentSeconds: number;
      durationSeconds: number;
      percent: number;
    } | null;
    playlistId: string | null;
    playlistIndex: number | null;
  };

  enrichments?: Record<string, any>;
}

export interface TabMetadata {
  id: number;
  windowId: number;
  title: string;
  url: string;
  pinned: boolean;
  lastAccessed?: number;
  openerTabId?: number;
  favIconUrl?: string;
  context?: string;
  contextData?: PageContext;
  groupId?: number;
}

export interface TabGroup {
  id: string;
  windowId: number;
  label: string;
  color: string;
  tabs: TabMetadata[];
  reason: string;
}

// GroupingStrategy and SortingStrategy can now be built-in literals or a custom strategy ID string
export type GroupingStrategy = "url" | "title" | "hierarchy" | "context" | (string & {});
export type SortingStrategy = "recency" | "hierarchy" | "pinned" | "title" | "url" | "context" | (string & {});

export interface StoredTabState {
  id?: number;
  url: string;
  pinned: boolean;
  groupId?: number;
  groupTitle?: string;
  groupColor?: string;
}

export interface WindowState {
  tabs: StoredTabState[];
}

export interface SavedState {
  name: string;
  timestamp: number;
  windows: WindowState[];
}

export interface UndoState {
  timestamp: number;
  windows: WindowState[];
}

export interface GroupingSelection {
  windowIds?: number[];
  tabIds?: number[];
}

export interface ApplyGroupingPayload {
  selection?: GroupingSelection;
  sorting?: SortingStrategy[];
}

export type MatchType = 'domain' | 'url-contains' | 'title-contains' | 'regex';

export interface CustomGroupingRule {
  type: MatchType;
  pattern: string;
  target: string; // The group name
}

export interface CustomGroupingStrategy {
  id: string;
  name: string;
  rules: CustomGroupingRule[];
}

export interface Preferences {
  primaryGrouping: GroupingStrategy;
  secondaryGrouping: GroupingStrategy;
  sorting: SortingStrategy[];
  debug: boolean;
  theme?: "light" | "dark";
  customGroupingStrategies: CustomGroupingStrategy[];
}

export interface RuntimeMessage<TPayload = unknown> {
  type:
    | "getState"
    | "applyGrouping"
    | "applySorting"
    | "loadPreferences"
    | "savePreferences"
    | "saveState"
    | "restoreState"
    | "undo"
    | "getSavedStates"
    | "deleteSavedState"
    | "mergeSelection";
  payload?: TPayload;
}

export interface RuntimeResponse<TData = unknown> {
  ok: boolean;
  data?: TData;
  error?: string;
}
