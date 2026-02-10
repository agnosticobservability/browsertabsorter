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

  // Classification
  genre?: string;

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
    channelHandle?: string;
    channelName?: string;
    genre?: string;
    genreSource?: "api" | "page" | "heuristic" | "unknown";
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
  index: number;
  active: boolean;
  status?: string;
  subdomain?: string;
  selected?: boolean;
}

export interface TabGroup {
  id: string;
  windowId: number;
  label: string;
  color: string;
  tabs: TabMetadata[];
  reason: string;
  windowMode?: "current" | "new" | "compound";
}

export type SortingStrategy = "domain" | "url" | "topic" | "title" | "lineage" | "nesting" | "context" | "pinned" | "age" | "recency" | "youtubeChannel" | "domain_full" | string;
export type GroupingStrategy = SortingStrategy;

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

// New Strategy Types
export interface RuleCondition {
  field: string;
  operator: "contains" | "doesNotContain" | "matches" | "equals" | "startsWith" | "endsWith" | "exists" | "doesNotExist" | "isNull" | "isNotNull";
  value: string;
}

export interface GroupingRule {
  source: "field" | "fixed";
  value: string;
  color?: string; // hex code or "random"
  transform?: "none" | "stripTld" | "lowercase" | "uppercase" | "firstChar" | "domain" | "hostname" | "regex";
  transformPattern?: string;
  windowMode?: "current" | "new" | "compound";
}

export interface SortingRule {
  field: string;
  order: "asc" | "desc";
}

// Legacy Interface for compatibility (if needed) or replacement
export interface StrategyRule {
  field: string;
  operator: "contains" | "doesNotContain" | "matches" | "equals" | "startsWith" | "endsWith" | "exists" | "doesNotExist" | "isNull" | "isNotNull";
  value: string;
  result: string;
}

export interface CustomStrategy {
  id: string;
  label: string;

  // New Structure
  filters?: RuleCondition[]; // Legacy (AND)
  filterGroups?: RuleCondition[][]; // New (OR of ANDs)

  groupingRules: GroupingRule[];
  sortingRules: SortingRule[];
  groupSortingRules?: SortingRule[];

  fallback?: string;
  autoRun?: boolean;
  sortGroups?: boolean; // Legacy

  // Legacy fields (optional during migration or if we want to support old style)
  type?: "grouping" | "sorting";
  rules?: StrategyRule[];
}

export type LogLevel = "debug" | "info" | "warn" | "error" | "critical";

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

export interface Preferences {
  sorting: SortingStrategy[];
  debug: boolean;
  logLevel?: LogLevel;
  theme?: "light" | "dark";
  customGenera?: Record<string, string>;
  customStrategies?: CustomStrategy[];

  // YouTube Features
  youtubeApiKey?: string;
  enableYouTubeGenreDetection?: boolean;

  // General UI Features
  colorByField?: string;
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
    | "mergeSelection"
    | "splitSelection"
    | "getLogs"
    | "clearLogs"
    | "logEntry";
  payload?: TPayload;
}

export interface RuntimeResponse<TData = unknown> {
  ok: boolean;
  data?: TData;
  error?: string;
}
