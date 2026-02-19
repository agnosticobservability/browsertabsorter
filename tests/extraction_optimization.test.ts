import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { TabMetadata } from "../src/shared/types.js";

// Mock dependencies BEFORE importing the module under test
mock.module("../src/background/preferences.js", () => ({
  loadPreferences: () => Promise.resolve({ customGenera: {} })
}));

mock.module("../src/shared/logger.js", () => ({
  logDebug: mock(() => {})
}));

// Mock chrome API function
const mockExecuteScript = mock(() => Promise.resolve([{ result: "<html><head><meta itemprop='genre' content='Gaming ExecuteScript'></head></html>" }]));

// Now import the module under test
import { extractPageContext } from "../src/background/extraction/index.js";

describe("YouTube Extraction Optimization", () => {
  let originalFetch: any;
  let originalChrome: any;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalChrome = (global as any).chrome;

    global.fetch = mock(() => Promise.resolve(new Response("<html><head><meta itemprop='genre' content='Gaming Fetch'></head></html>", { ok: true })));

    // Setup chrome mock for this test suite
    (global as any).chrome = {
      tabs: {
        TAB_ID_NONE: -1
      },
      scripting: {
        executeScript: mockExecuteScript
      }
    };

    mockExecuteScript.mockClear();
    // Reset fetch mock
    (global.fetch as any).mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;

    // Restore original chrome or delete if it wasn't there
    if (originalChrome === undefined) {
        delete (global as any).chrome;
    } else {
        (global as any).chrome = originalChrome;
    }
  });

  test("should use executeScript for YouTube tab with valid ID", async () => {
    const tab = { id: 123, url: "https://www.youtube.com/watch?v=123", title: "Video" } as TabMetadata;

    // We expect extractPageContext to try executeScript first
    const result = await extractPageContext(tab);

    expect(result.status).toBe("OK");
    // Verify executeScript was called
    expect(mockExecuteScript).toHaveBeenCalled();
    expect(mockExecuteScript).toHaveBeenCalledWith(expect.objectContaining({
      target: { tabId: 123 },
      func: expect.any(Function)
    }));

    // Verify fetch was NOT called
    expect(global.fetch).not.toHaveBeenCalled();

    // Verify data extracted from executeScript result
    expect(result.data?.genre).toBe("Gaming ExecuteScript");
  });

  test("should fall back to fetch if tab ID is missing", async () => {
    const tab = { id: undefined, url: "https://www.youtube.com/watch?v=456", title: "Video No ID" } as any;

    const result = await extractPageContext(tab);

    expect(result.status).toBe("OK");

    // Verify executeScript was NOT called
    expect(mockExecuteScript).not.toHaveBeenCalled();

    // Verify fetch WAS called
    expect(global.fetch).toHaveBeenCalled();

    // Verify data extracted from fetch result
    expect(result.data?.genre).toBe("Gaming Fetch");
  });

  test("should fall back to fetch if executeScript fails", async () => {
    // Make executeScript fail
    mockExecuteScript.mockImplementationOnce(() => Promise.reject(new Error("Injection failed")));

    const tab = { id: 789, url: "https://www.youtube.com/watch?v=789", title: "Video Fail" } as TabMetadata;

    const result = await extractPageContext(tab);

    expect(result.status).toBe("OK");

    // Verify executeScript WAS called
    expect(mockExecuteScript).toHaveBeenCalled();

    // Verify fetch WAS called as fallback
    expect(global.fetch).toHaveBeenCalled();

    // Verify data extracted from fetch result
    expect(result.data?.genre).toBe("Gaming Fetch");
  });
});
