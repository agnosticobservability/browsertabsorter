declare namespace chrome {
  namespace tabs {
    interface Tab {
      id?: number;
      windowId?: number;
      title?: string;
      url?: string;
      pinned?: boolean;
      lastAccessed?: number;
      openerTabId?: number;
    }
    function query(queryInfo: object): Promise<Tab[]>;
    function group(options: { tabIds: number[] }): Promise<number>;
    function remove(tabIds: number | number[]): Promise<void>;
    function create(createProperties: { url: string; pinned?: boolean }): Promise<Tab>;
    const onCreated: { addListener(callback: (tab: Tab) => void): void };
  }

  namespace tabGroups {
    type ColorEnum = "grey" | "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan" | "orange";
    function update(groupId: number, updateProperties: { title?: string; color?: ColorEnum }): Promise<void>;
    const onRemoved: { addListener(callback: (group: any) => void): void };
  }

  namespace runtime {
    interface MessageSender {
      id?: string;
    }
    interface ExtensionContext {
      id?: string;
    }
    function sendMessage(message: any): Promise<any>;
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
      function set(items: Record<string, any>, callback: () => void): void;
    }
  }
}
