import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { fetchContextFromAI } from "../src/background/contextAnalysis.js";
import { TabMetadata, AIPreferences, PageContext } from "../src/shared/types.js";

// Mock global.fetch
const originalFetch = global.fetch;

describe("fetchContextFromAI", () => {
    beforeEach(() => {
        global.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({
            choices: [{ message: { content: "Technology" } }]
        }))));
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    const mockTab: TabMetadata = {
        id: 1,
        windowId: 1,
        title: "Test Page",
        url: "https://example.com",
        pinned: false,
        index: 0,
        active: true
    };

    test("returns DISABLED if AI is disabled", async () => {
        const prefs: AIPreferences = { enabled: false, provider: 'openai' };
        const result = await fetchContextFromAI(mockTab, prefs);
        expect(result.status).toBe("DISABLED");
    });

    test("returns ERROR if OpenAI key is missing", async () => {
        const prefs: AIPreferences = { enabled: true, provider: 'openai' };
        const result = await fetchContextFromAI(mockTab, prefs);
        expect(result.status).toBe("ERROR");
        expect(result.error).toContain("Missing API Key");
    });

    test("returns context on success (OpenAI)", async () => {
        const prefs: AIPreferences = { enabled: true, provider: 'openai', apiKey: 'sk-test' };
        const result = await fetchContextFromAI(mockTab, prefs);
        expect(result.source).toBe("AI");
        expect(result.context).toBe("Technology");
    });

    test("uses custom endpoint", async () => {
        const prefs: AIPreferences = { enabled: true, provider: 'custom', endpoint: 'http://localhost:11434/api/chat' };

        // Mock fetch to verify URL
        let calledUrl = "";
        global.fetch = mock((url) => {
            calledUrl = url.toString();
            return Promise.resolve(new Response(JSON.stringify({
                choices: [{ message: { content: "Development" } }]
            })));
        });

        const result = await fetchContextFromAI(mockTab, prefs);
        expect(result.context).toBe("Development");
        expect(calledUrl).toBe("http://localhost:11434/api/chat");
    });

    test("handles API error", async () => {
        global.fetch = mock(() => Promise.resolve(new Response("Rate Limit", { status: 429 })));

        const prefs: AIPreferences = { enabled: true, provider: 'openai', apiKey: 'sk-test' };
        const result = await fetchContextFromAI(mockTab, prefs);
        expect(result.status).toBe("ERROR");
        expect(result.error).toContain("429");
    });

    test("sanitizes response", async () => {
        global.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({
            choices: [{ message: { content: "  Entertainment. " } }]
        }))));

        const prefs: AIPreferences = { enabled: true, provider: 'openai', apiKey: 'sk-test' };
        const result = await fetchContextFromAI(mockTab, prefs);
        expect(result.context).toBe("Entertainment");
    });

    test("uses provided contextData description", async () => {
        const prefs: AIPreferences = { enabled: true, provider: 'openai', apiKey: 'sk-test' };

        let sentBody = "";
        global.fetch = mock((url, options) => {
            if (options && options.body) {
                sentBody = String(options.body);
            }
            return Promise.resolve(new Response(JSON.stringify({
                choices: [{ message: { content: "Science" } }]
            })));
        });

        const contextData = {
            description: "A page about physics and nature."
        } as PageContext;

        const result = await fetchContextFromAI(mockTab, prefs, contextData);
        expect(result.context).toBe("Science");
        expect(sentBody).toContain("A page about physics and nature.");
    });
});
