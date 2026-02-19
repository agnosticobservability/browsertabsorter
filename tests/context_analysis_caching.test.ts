import { test, expect, mock, beforeEach, afterEach, describe } from "bun:test";
import { analyzeTabContext } from "../src/background/contextAnalysis";
import { TabMetadata } from "../src/shared/types";

// Mock implementation
const mockExtractPageContext = mock();

mock.module("../src/background/extraction/index.js", () => ({
    extractPageContext: mockExtractPageContext
}));

// Mock Date.now
let currentTime = 1000000;
// We can't easily restore Date.now in Bun test context if it affects other tests,
// but since we are running this file in isolation or sequentially, it's ok.
// However, overriding Date.now globally is risky.
// Let's rely on the fact that analyzeTabContext uses Date.now().
const originalDateNow = Date.now;
Date.now = () => currentTime;

const advanceTime = (ms: number) => {
    currentTime += ms;
};

describe("Context Analysis Caching", () => {
    beforeEach(() => {
        mockExtractPageContext.mockReset();
        currentTime = 1000000;
        Date.now = () => currentTime;
    });

    afterEach(() => {
        Date.now = originalDateNow;
    });

    test("caches successful results", async () => {
        const tab = { id: 101, url: "https://example.com/success", title: "Success" } as TabMetadata;

        mockExtractPageContext.mockResolvedValue({
            data: { platform: "TestPlatform", objectType: "article" },
            status: "OK"
        });

        // First call
        await analyzeTabContext([tab]);
        expect(mockExtractPageContext).toHaveBeenCalledTimes(1);

        // Second call immediately
        await analyzeTabContext([tab]);
        expect(mockExtractPageContext).toHaveBeenCalledTimes(1); // Should be cached

        // Advance time by 1 hour (success cache should persist)
        advanceTime(60 * 60 * 1000);
        await analyzeTabContext([tab]);
        expect(mockExtractPageContext).toHaveBeenCalledTimes(1); // Still cached
    });

    test("caches error results but retries after expiration", async () => {
        const tab = { id: 202, url: "https://example.com/error", title: "Error" } as TabMetadata;

        // Mock failure
        mockExtractPageContext.mockResolvedValue({
            data: null,
            error: "Network Error",
            status: "INJECTION_FAILED"
        });

        // First call
        const results1 = await analyzeTabContext([tab]);
        expect(mockExtractPageContext).toHaveBeenCalledTimes(1);

        // Verify result is error/uncategorized (heuristic for example.com is Uncategorized)
        const res1 = results1.get(202);
        // Note: fetchContextForTab sets status from extraction result if available
        // But if extraction returns result, fetchContextForTab uses it.
        // Wait, fetchContextForTab logic:
        // extraction = await extractPageContext(tab);
        // data = extraction.data; error = extraction.error; status = extraction.status;
        // ...
        // if context == Uncategorized ...
        // ...
        // if context !== Uncategorized ... error = undefined.

        // Here context is Uncategorized. So error remains "Network Error".
        expect(res1?.error).toBe("Network Error");

        // Second call immediately
        await analyzeTabContext([tab]);
        expect(mockExtractPageContext).toHaveBeenCalledTimes(1); // Cached

        // Advance time by 6 minutes (error cache should expire)
        advanceTime(6 * 60 * 1000);

        // Third call - should retry
        await analyzeTabContext([tab]);

        // With current implementation, this will FAIL (it will be 1)
        // We expect 2 after fix.
        expect(mockExtractPageContext).toHaveBeenCalledTimes(2);
    });
});
