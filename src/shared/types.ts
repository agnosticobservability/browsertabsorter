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

export type GroupingStrategy = "domain" | "semantic" | "navigation";
export type SortingStrategy = "recency" | "hierarchy" | "pinned" | "title" | "url" | "context";

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

export interface Preferences {
  primaryGrouping: GroupingStrategy;
  secondaryGrouping: GroupingStrategy;
  sorting: SortingStrategy[];
  debug: boolean;
  popupVariant?: "default" | "redesigned";
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
    | "deleteSavedState";
  payload?: TPayload;
}

export interface RuntimeResponse<TData = unknown> {
  ok: boolean;
  data?: TData;
  error?: string;
}
