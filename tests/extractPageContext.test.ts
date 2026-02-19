import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { TabMetadata } from "../src/shared/types.js";

// Mock dependencies BEFORE importing the module under test
mock.module("../src/background/preferences.js", () => ({
  loadPreferences: () => Promise.resolve({ customGenera: {} })
}));

mock.module("../src/shared/logger.js", () => ({
  logDebug: mock(() => {})
}));

// Now import the module under test
import { extractPageContext } from "../src/background/extraction/index.js";

describe("extractPageContext", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mock(() => Promise.resolve(new Response("")));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    mock.restore();
  });

  test("should handle null or undefined tab", async () => {
    const result1 = await extractPageContext(null as any);
    expect(result1.status).toBe("NO_RESPONSE");
    expect(result1.error).toBe("Tab not found or no URL");

    const result2 = await extractPageContext(undefined as any);
    expect(result2.status).toBe("NO_RESPONSE");
  });

  test("should handle tab without URL", async () => {
    const tab = { id: 1, title: "No URL" } as any;
    const result = await extractPageContext(tab);
    expect(result.status).toBe("NO_RESPONSE");
  });

  test("should handle restricted URL schemes", async () => {
    const restrictedUrls = [
      "chrome://extensions",
      "edge://settings",
      "about:blank",
      "chrome-extension://abcdefg/popup.html",
      "chrome-error://chromewebdata"
    ];

    for (const url of restrictedUrls) {
      const tab = { id: 1, url } as TabMetadata;
      const result = await extractPageContext(tab);
      expect(result.status).toBe("RESTRICTED");
      expect(result.data).toBeNull();
    }
  });

  test("should extract baseline context for standard URL", async () => {
    const tab = { id: 1, url: "https://example.com", title: "Example Domain" } as TabMetadata;
    const result = await extractPageContext(tab);

    expect(result.status).toBe("OK");
    expect(result.data).not.toBeNull();
    expect(result.data?.canonicalUrl).toBe("https://example.com");
    expect(result.data?.siteName).toBe("example.com");
    expect(result.data?.title).toBe("Example Domain");
  });

  test("should identify known domains from registry", async () => {
    const tab = { id: 1, url: "https://github.com/user/repo", title: "GitHub" } as TabMetadata;
    const result = await extractPageContext(tab);

    expect(result.status).toBe("OK");
    expect(result.data?.siteName).toBe("github.com");
    expect(result.data?.genre).toBe("Development");
    expect(result.data?.objectType).toBe("repo");
  });

  test("should handle YouTube channel URL without fetch", async () => {
    const tab = { id: 1, url: "https://www.youtube.com/@ChannelName", title: "Channel" } as TabMetadata;
    const result = await extractPageContext(tab);

    expect(result.status).toBe("OK");
    expect(result.data?.authorOrCreator).toBe("@ChannelName");
    expect(result.data?.genre).toBe("Video"); // registry fallback or logic
  });

  test("should fetch YouTube video page to extract metadata", async () => {
    const htmlContent = `
      <html>
        <head>
          <meta itemprop="genre" content="Gaming">
          <link itemprop="name" content="Test Channel">
        </head>
      </html>
    `;

    global.fetch = mock(() => Promise.resolve(new Response(htmlContent, {
        headers: { "Content-Type": "text/html" }
    })));

    const tab = { id: 1, url: "https://www.youtube.com/watch?v=12345", title: "Video Title" } as TabMetadata;
    const result = await extractPageContext(tab);

    expect(result.status).toBe("OK");
    expect(result.data?.genre).toBe("Gaming");
    expect(result.data?.authorOrCreator).toBe("Test Channel");
    expect(global.fetch).toHaveBeenCalled();
  });

  test("should handle fetch failure gracefully for YouTube", async () => {
    global.fetch = mock(() => Promise.reject(new Error("Network Error")));

    const tab = { id: 1, url: "https://www.youtube.com/watch?v=fail", title: "Video" } as TabMetadata;
    const result = await extractPageContext(tab);

    // Should still return OK with baseline data, even if fetch failed
    expect(result.status).toBe("OK");
    expect(result.data?.genre).toBe("Video");
    expect(result.data?.authorOrCreator).toBeNull();
  });
});
