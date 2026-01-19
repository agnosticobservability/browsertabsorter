declare namespace chrome {
  namespace tabs {
    interface Tab {
      id?: number;
      index: number;
      windowId: number;
      groupId: number;
      title?: string;
      url?: string;
      pinned: boolean;
      active: boolean;
      status?: string;
      favIconUrl?: string;
      lastAccessed?: number;
      openerTabId?: number;
      width?: number;
      height?: number;
    }
    interface ChangeInfo {
      status?: string;
      url?: string;
      pinned?: boolean;
      audible?: boolean;
      discarded?: boolean;
      autoDiscardable?: boolean;
      mutedInfo?: MutedInfo;
      favIconUrl?: string;
      title?: string;
    }
    interface MutedInfo {
        muted: boolean;
        reason?: string;
        extensionId?: string;
    }
    function get(tabId: number): Promise<Tab>;
    function query(queryInfo: object): Promise<Tab[]>;
    function group(options: { tabIds: number[], groupId?: number }): Promise<number>;
    function ungroup(tabIds: number | number[]): Promise<void>;
    function remove(tabIds: number | number[]): Promise<void>;
    function update(tabId: number, updateProperties: { active?: boolean; url?: string; pinned?: boolean }): Promise<Tab>;
    function create(createProperties: { url: string; pinned?: boolean; active?: boolean }): Promise<Tab>;
    function move(tabIds: number | number[], moveProperties: { windowId?: number; index: number }): Promise<Tab | Tab[]>;
    const onCreated: { addListener(callback: (tab: Tab) => void): void };
    const onUpdated: { addListener(callback: (tabId: number, changeInfo: ChangeInfo, tab: Tab) => void): void };
    const onRemoved: { addListener(callback: (tabId: number, removeInfo: { isWindowClosing: boolean, windowId: number }) => void): void };
  }

  namespace tabGroups {
    const TAB_GROUP_ID_NONE: number;
    type ColorEnum = "grey" | "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan" | "orange";
    interface TabGroup {
      id: number;
      collapsed: boolean;
      color: ColorEnum;
      title?: string;
      windowId: number;
    }
    function update(groupId: number, updateProperties: { title?: string; color?: ColorEnum; collapsed?: boolean }): Promise<void>;
    function query(queryInfo: { windowId?: number }): Promise<TabGroup[]>;
    const onRemoved: { addListener(callback: (group: any) => void): void };
  }

  namespace windows {
      interface Window {
          id?: number;
          focused: boolean;
          tabs?: tabs.Tab[];
          type?: "normal" | "popup" | "panel" | "app" | "devtools";
          state?: "normal" | "minimized" | "maximized" | "fullscreen" | "locked-fullscreen";
          top?: number;
          left?: number;
          width?: number;
          height?: number;
      }
      function create(createData: { url?: string | string[]; tabId?: number; type?: "normal" | "popup" | "panel" | "detached_panel"; focused?: boolean; state?: "maximized" | "minimized" | "normal" | "fullscreen" | "locked-fullscreen"; width?: number; height?: number }): Promise<Window>;
      function update(windowId: number, updateInfo: { focused?: boolean; state?: "maximized" | "minimized" | "normal" | "fullscreen" | "locked-fullscreen" }): Promise<Window>;
      function getAll(getInfo?: { populate?: boolean; windowTypes?: string[] }): Promise<Window[]>;
      function getCurrent(getInfo?: { populate?: boolean; windowTypes?: string[] }): Promise<Window>;
      const onRemoved: { addListener(callback: (windowId: number) => void): void };
  }

  namespace runtime {
    interface MessageSender {
      id?: string;
    }
    interface ExtensionContext {
      id?: string;
    }
    function sendMessage(message: any, callback?: (response: any) => void): Promise<any>;
    function getURL(path: string): string;
    const onMessage: {
      addListener(
        callback: (
          message: any,
          sender: MessageSender,
          sendResponse: (response: any) => void
        ) => boolean | void
      ): void;
    };
    const onInstalled: { addListener(callback: () => void): void };
  }

  namespace storage {
    namespace local {
      function get(keys: string | string[], callback: (items: Record<string, any>) => void): void;
      function get(keys: string | string[]): Promise<Record<string, any>>;
      function set(items: Record<string, any>, callback: () => void): void;
      function set(items: Record<string, any>): Promise<void>;
    }
  }
}
