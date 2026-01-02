import { logDebug } from "../logger.js";
export const extractPageContext = async (tabId) => {
    try {
        // 1. Inject the bundled script
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['dist/extraction/content.js']
        });
        // 2. Read the result from global variable
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                const res = window.__EXTRACTED_CONTEXT__;
                delete window.__EXTRACTED_CONTEXT__;
                return res;
            }
        });
        if (results && results.length > 0 && results[0].result) {
            return results[0].result;
        }
    }
    catch (e) {
        logDebug(`Extraction failed for tab ${tabId}`, { error: String(e) });
    }
    return null;
};
