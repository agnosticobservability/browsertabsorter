import { test, expect, describe, mock, beforeAll, afterAll } from "bun:test";
import { extractPageContext } from "../src/background/extraction/index";

// Mock dependencies
mock.module("../src/background/preferences", () => ({
    loadPreferences: async () => ({ customGenera: {} })
}));

mock.module("../src/shared/urlCache", () => ({
    getHostname: (url: string) => {
        try { return new URL(url).hostname; } catch { return null; }
    }
}));

mock.module("../src/background/extraction/logic", () => ({
    normalizeUrl: (url: string) => url,
    parseYouTubeUrl: () => ({ videoId: "123" }),
    extractYouTubeMetadataFromHtml: () => ({})
}));

describe("Concurrency Fix Verification", () => {
    let activeFetches = 0;
    const MAX_CONCURRENT = 5;

    test("extractPageContext respects concurrency limit", async () => {
        // We simulate a slow fetch
        const slowFetch = async () => {
            activeFetches++;
            await new Promise(r => setTimeout(r, 100)); // Hold slot
            activeFetches--;
            return new Response("<html></html>");
        };

        // Mock global fetch
        const originalFetch = global.fetch;
        global.fetch = mock(slowFetch) as any;

        const promises: Promise<any>[] = [];
        const maxObservedFetches: number[] = [];

        // Monitor activeFetches
        const interval = setInterval(() => {
            maxObservedFetches.push(activeFetches);
        }, 10);

        // Launch 10 concurrent requests
        for (let i = 0; i < 10; i++) {
            promises.push(extractPageContext({
                id: i,
                url: "https://www.youtube.com/watch?v=" + i,
                title: "Video " + i
            } as any));
        }

        await Promise.all(promises);
        clearInterval(interval);
        global.fetch = originalFetch;

        const max = Math.max(...maxObservedFetches);
        console.log("Max concurrent fetches observed:", max);
        expect(max <= MAX_CONCURRENT).toBe(true);
    });
});

describe("Logger Fix Verification", () => {
    test("isServiceWorker check does not throw", async () => {
        // We need to reload the module to trigger top-level execution
        // But bun modules are cached.
        // We can inspect the source code? No.
        // We can just import it and see if it runs.
        // If it threw, this test file would have crashed on import or run.

        const logger = await import("../src/shared/logger");
        expect(logger).toBeDefined();
    });
});
