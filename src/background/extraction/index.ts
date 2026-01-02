import { PageContext } from "../../shared/types.js";
import { logDebug } from "../logger.js";

interface ExtractionResponse {
  data: PageContext | null;
  error?: string;
  status: 'OK' | 'RESTRICTED' | 'INJECTION_FAILED' | 'NO_RESPONSE';
}

export const extractPageContext = async (tabId: number): Promise<ExtractionResponse> => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url) {
        return { data: null, error: "Tab not found or no URL", status: 'NO_RESPONSE' };
    }

    if (
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('edge://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('chrome-error://')
    ) {
        return { data: null, error: "Restricted URL scheme", status: 'RESTRICTED' };
    }

    // 1. Inject the bundled script
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['dist/extraction/content.js']
        });
    } catch (injectError: any) {
        // e.g. "Cannot access contents of url..."
        return { data: null, error: injectError.message, status: 'INJECTION_FAILED' };
    }

    // 2. Read the result from global variable
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
         const res = (window as any).__EXTRACTED_CONTEXT__;
         // We don't delete it immediately to allow inspection or re-reads if needed,
         // but cleaning up is good. Let's keep it for now as per original or delete?
         // Original deleted it. Let's delete it.
         delete (window as any).__EXTRACTED_CONTEXT__;
         return res;
      }
    });

    if (results && results.length > 0 && results[0].result) {
      return { data: results[0].result as PageContext, status: 'OK' };
    }

    return { data: null, error: "Script executed but returned no data", status: 'NO_RESPONSE' };

  } catch (e: any) {
    logDebug(`Extraction failed for tab ${tabId}`, { error: String(e) });
    return { data: null, error: String(e), status: 'INJECTION_FAILED' };
  }
};
