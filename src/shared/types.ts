export interface TabMetadata {
  id: number;
  windowId: number;
  title: string;
  url: string;
  pinned: boolean;
  lastAccessed?: number;
  openerTabId?: number;
}

export interface TabGroup {
  id: string;
  windowId: number;
  label: string;
  color: string;
  tabs: TabMetadata[];
  reason: string;
}

export type GroupingStrategy = "domain" | "semantic" | "navigation";
export type SortingStrategy = "recency" | "hierarchy" | "pinned";

export interface Preferences {
  primaryGrouping: GroupingStrategy;
  secondaryGrouping: GroupingStrategy;
  sorting: SortingStrategy[];
  debug: boolean;
}

export interface SavedSession {
  id: string;
  createdAt: number;
  name: string;
  groups: TabGroup[];
}

export interface RuntimeMessage<TPayload = unknown> {
  type:
    | "getState"
    | "applyGrouping"
    | "saveSession"
    | "listSessions"
    | "loadPreferences"
    | "savePreferences";
  payload?: TPayload;
}

export interface RuntimeResponse<TData = unknown> {
  ok: boolean;
  data?: TData;
  error?: string;
}
