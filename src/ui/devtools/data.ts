import { appState } from "./state.js";
import { mapChromeTab, escapeHtml } from "../../shared/utils.js";
import { TabMetadata } from "../../shared/types.js";

export function getMappedTabs(): TabMetadata[] {
  return appState.currentTabs
    .map(tab => {
        const metadata = mapChromeTab(tab);
        if (!metadata) return null;

        const contextResult = appState.currentContextMap.get(metadata.id);
        if (contextResult) {
            metadata.context = contextResult.context;
            metadata.contextData = contextResult.data;
        }
        return metadata;
    })
    .filter((t): t is TabMetadata => t !== null);
}

export function stripHtml(html: string) {
    let tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
}

export function getSortValue(tab: chrome.tabs.Tab, key: string): any {
  switch (key) {
    case 'parentTitle':
      return tab.openerTabId ? (appState.tabTitles.get(tab.openerTabId) || '') : '';
    case 'genre':
      return (tab.id && appState.currentContextMap.get(tab.id)?.data?.genre) || '';
    case 'context':
      return (tab.id && appState.currentContextMap.get(tab.id)?.context) || '';
    case 'siteName':
      return (tab.id && appState.currentContextMap.get(tab.id)?.data?.siteName) || '';
    case 'platform':
      return (tab.id && appState.currentContextMap.get(tab.id)?.data?.platform) || '';
    case 'objectType':
      return (tab.id && appState.currentContextMap.get(tab.id)?.data?.objectType) || '';
    case 'extractedTitle':
      return (tab.id && appState.currentContextMap.get(tab.id)?.data?.title) || '';
    case 'authorOrCreator':
      return (tab.id && appState.currentContextMap.get(tab.id)?.data?.authorOrCreator) || '';
    case 'publishedAt':
      return (tab.id && appState.currentContextMap.get(tab.id)?.data?.publishedAt) || '';
    case 'active':
      return tab.active ? 1 : 0;
    case 'pinned':
      return tab.pinned ? 1 : 0;
    case 'id':
      return tab.id ?? -1;
    case 'index':
      return tab.index;
    case 'windowId':
      return tab.windowId;
    case 'groupId':
      return tab.groupId;
    case 'openerTabId':
      return tab.openerTabId ?? -1;
    case 'lastAccessed':
      // lastAccessed is a valid property of chrome.tabs.Tab in modern definitions
      return (tab as chrome.tabs.Tab & { lastAccessed?: number }).lastAccessed || 0;
    case 'title':
      return (tab.title || '').toLowerCase();
    case 'url':
      return (tab.url || '').toLowerCase();
    case 'status':
      return (tab.status || '').toLowerCase();
    default:
      return '';
  }
}

export function getCellValue(tab: chrome.tabs.Tab, key: string): string | HTMLElement {
    const escape = escapeHtml;

    switch (key) {
        case 'id': return String(tab.id ?? 'N/A');
        case 'index': return String(tab.index);
        case 'windowId': return String(tab.windowId);
        case 'groupId': return String(tab.groupId);
        case 'title': return escape(tab.title || '');
        case 'url': return escape(tab.url || '');
        case 'status': return escape(tab.status || '');
        case 'active': return tab.active ? 'Yes' : 'No';
        case 'pinned': return tab.pinned ? 'Yes' : 'No';
        case 'openerTabId': return String(tab.openerTabId ?? '-');
        case 'parentTitle':
             return escape(tab.openerTabId ? (appState.tabTitles.get(tab.openerTabId) || 'Unknown') : '-');
        case 'genre':
             return escape((tab.id && appState.currentContextMap.get(tab.id)?.data?.genre) || '-');
        case 'context': {
            const contextResult = tab.id ? appState.currentContextMap.get(tab.id) : undefined;
            if (!contextResult) return 'N/A';

            let cellStyle = '';
            let aiContext = '';

            if (contextResult.status === 'RESTRICTED') {
                aiContext = 'Unextractable (restricted)';
                cellStyle = 'color: gray; font-style: italic;';
            } else if (contextResult.error) {
                aiContext = `Error (${contextResult.error})`;
                cellStyle = 'color: red;';
            } else if (contextResult.source === 'Extraction') {
                aiContext = `${contextResult.context} (Extracted)`;
                cellStyle = 'color: green; font-weight: bold;';
            } else {
                 aiContext = `${contextResult.context}`;
            }

            const container = document.createElement('div');
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.gap = '5px';

            const summaryDiv = document.createElement('div');
            summaryDiv.style.cssText = cellStyle;
            summaryDiv.textContent = aiContext;
            container.appendChild(summaryDiv);

            if (contextResult.data) {
                const details = document.createElement('pre');
                details.style.cssText = 'max-height: 300px; overflow: auto; font-size: 11px; text-align: left; background: #f5f5f5; padding: 5px; border: 1px solid #ddd; margin: 0; white-space: pre-wrap; font-family: monospace;';
                details.textContent = JSON.stringify(contextResult.data, null, 2);
                container.appendChild(details);
            }

            return container;
        }
        case 'lastAccessed':
            return new Date((tab as any).lastAccessed || 0).toLocaleString();
        case 'actions': {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = `
                <button class="goto-tab-btn" data-tab-id="${tab.id}" data-window-id="${tab.windowId}">Go</button>
                <button class="close-tab-btn" data-tab-id="${tab.id}" style="background-color: #dc3545; margin-left: 2px;">X</button>
            `;
            return wrapper;
        }
        default: return '';
    }
}
