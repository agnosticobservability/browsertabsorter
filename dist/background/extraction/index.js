import { logDebug, logError } from "../logger.js";
const RESTRICTED_SCHEMES = ['chrome:', 'edge:', 'about:', 'chrome-extension:', 'view-source:', 'devtools:'];
export const extractPageContext = async (tabId, url) => {
    // Check permissions/schemes
    try {
        const urlObj = new URL(url);
        if (RESTRICTED_SCHEMES.some(s => urlObj.protocol.startsWith(s))) {
            return { success: false, error: "Restricted URL", status: 'RESTRICTED' };
        }
    }
    catch (e) {
        // Invalid URL
        return { success: false, error: "Invalid URL", status: 'NO_PERMISSION' };
    }
    try {
        // 1. Inject the bundled script
        logDebug(`Injecting extraction script for tab ${tabId}`);
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
        if (results && results.length > 0) {
            if (results[0].result) {
                logDebug(`Extraction success for tab ${tabId}`);
                return { success: true, data: results[0].result, status: 'OK' };
            }
            else {
                logDebug(`Extraction returned no data for tab ${tabId}`);
                return { success: false, error: "No response data", status: 'NO_RESPONSE' };
            }
        }
        else {
            logDebug(`Injection executed but returned empty results for tab ${tabId}`);
            return { success: false, error: "Injection failed (no results)", status: 'INJECTION_FAILED' };
        }
    }
    catch (e) {
        const errStr = String(e);
        logError(`Extraction exception for tab ${tabId}`, { error: errStr });
        if (errStr.includes("Cannot access contents of page")) {
            return { success: false, error: "Restricted Page (Permission)", status: 'NO_PERMISSION' };
        }
        return { success: false, error: errStr, status: 'INJECTION_FAILED' };
    }
};
