import {
  ApplyGroupingPayload,
  GroupingSelection,
  Preferences,
  RuntimeMessage,
  RuntimeResponse,
  SavedState,
  SortingStrategy,
  TabGroup,
  TabMetadata
} from "../shared/types.js";
import { fetchLocalState } from "./localState.js";

export const sendMessage = async <TData>(type: RuntimeMessage["type"], payload?: any): Promise<RuntimeResponse<TData>> => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Runtime error:", chrome.runtime.lastError);
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { ok: false, error: "No response from background" });
      }
    });
  });
};

export type TabWithGroup = TabMetadata & {
  groupLabel?: string;
  groupColor?: string;
  reason?: string;
};

export interface WindowView {
  id: number;
  title: string;
  tabs: TabWithGroup[];
  tabCount: number;
  groupCount: number;
  pinnedCount: number;
}

export const ICONS = {
  active: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>`,
  hide: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`,
  show: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
  focus: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>`,
  close: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  ungroup: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>`,
  defaultFile: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
  autoRun: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`
};

export const GROUP_COLORS: Record<string, string> = {
  grey: "#64748b",
  blue: "#3b82f6",
  red: "#ef4444",
  yellow: "#eab308",
  green: "#22c55e",
  pink: "#ec4899",
  purple: "#a855f7",
  cyan: "#06b6d4",
  orange: "#f97316"
};

export const getGroupColor = (name: string) => GROUP_COLORS[name] || "#cbd5e1";

export const fetchState = async () => {
  try {
    const response = await sendMessage<{ groups: TabGroup[]; preferences: Preferences }>("getState");
    if (response.ok && response.data) {
      return response;
    }
    console.warn("fetchState failed, using fallback:", response.error);
    return await fetchLocalState();
  } catch (e) {
    console.warn("fetchState threw exception, using fallback:", e);
    return await fetchLocalState();
  }
};

export const applyGrouping = async (payload: ApplyGroupingPayload) => {
  const response = await chrome.runtime.sendMessage({ type: "applyGrouping", payload });
  return response as RuntimeResponse<unknown>;
};

export const applySorting = async (payload: ApplyGroupingPayload) => {
  const response = await chrome.runtime.sendMessage({ type: "applySorting", payload });
  return response as RuntimeResponse<unknown>;
};

export const mapWindows = (groups: TabGroup[], windowTitles: Map<number, string>): WindowView[] => {
  const windows = new Map<number, TabWithGroup[]>();

  groups.forEach((group) => {
    const isUngrouped = group.reason === "Ungrouped";
    group.tabs.forEach((tab) => {
      const decorated: TabWithGroup = {
        ...tab,
        groupLabel: isUngrouped ? undefined : group.label,
        groupColor: isUngrouped ? undefined : group.color,
        reason: group.reason
      };
      const existing = windows.get(tab.windowId) ?? [];
      existing.push(decorated);
      windows.set(tab.windowId, existing);
    });
  });

  return Array.from(windows.entries())
    .map<WindowView>(([id, tabs]) => {
      const groupCount = new Set(tabs.map((tab) => tab.groupLabel).filter((l): l is string => !!l)).size;
      const pinnedCount = tabs.filter((tab) => tab.pinned).length;
      return {
        id,
        title: windowTitles.get(id) ?? `Window ${id}`,
        tabs,
        tabCount: tabs.length,
        groupCount,
        pinnedCount
      };
    })
    .sort((a, b) => a.id - b.id);
};

export const formatDomain = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch (error) {
    return url;
  }
};

export function getDragAfterElement(container: HTMLElement, y: number, selector: string) {
  const draggableElements = Array.from(container.querySelectorAll(selector));

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY, element: null as Element | null }).element;
}
