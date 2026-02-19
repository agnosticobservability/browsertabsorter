import { test, expect, describe } from "bun:test";
import { getCategoryFromUrl } from "../src/background/categoryRules";

describe("Heuristic Categorization", () => {
    test("categorizes Development URLs", () => {
        expect(getCategoryFromUrl("https://github.com/user/repo")).toBe("Development");
        expect(getCategoryFromUrl("http://localhost:3000")).toBe("Development");
        expect(getCategoryFromUrl("https://stackoverflow.com/questions/123")).toBe("Development");
        expect(getCategoryFromUrl("https://jira.company.com/browse/PROJ-1")).toBe("Development");
        expect(getCategoryFromUrl("https://gitlab.com/group/project")).toBe("Development");
    });

    test("categorizes Work URLs", () => {
        // Google Docs logic
        expect(getCategoryFromUrl("https://docs.google.com/document/d/123")).toBe("Work");
        expect(getCategoryFromUrl("https://sheets.google.com/spreadsheet")).toBe("Work");
        expect(getCategoryFromUrl("https://slides.google.com/presentation")).toBe("Work");

        // Other Work
        expect(getCategoryFromUrl("https://www.linkedin.com/feed/")).toBe("Work");
        expect(getCategoryFromUrl("https://app.slack.com/client/T123/C123")).toBe("Work");
        expect(getCategoryFromUrl("https://zoom.us/j/123456")).toBe("Work");
        expect(getCategoryFromUrl("https://teams.microsoft.com/")).toBe("Work");
    });

    test("handles Google Docs edge cases correctly", () => {
        // Must contain "google" AND ("docs" OR "sheets" OR "slides")
        expect(getCategoryFromUrl("https://google.com/search")).not.toBe("Work"); // "google" only

        // "docs" only without "google" should NOT be Work
        expect(getCategoryFromUrl("https://example.com/docs")).toBe("Uncategorized");

        expect(getCategoryFromUrl("https://docs.google.com")).toBe("Work");
        expect(getCategoryFromUrl("https://google.com/docs")).toBe("Work");
    });

    test("categorizes Entertainment URLs", () => {
        expect(getCategoryFromUrl("https://www.netflix.com/watch/123")).toBe("Entertainment");
        expect(getCategoryFromUrl("https://open.spotify.com/track/123")).toBe("Entertainment");
        expect(getCategoryFromUrl("https://www.youtube.com/watch?v=123")).toBe("Entertainment");
    });

    test("categorizes Social URLs", () => {
        expect(getCategoryFromUrl("https://twitter.com/home")).toBe("Social");
        expect(getCategoryFromUrl("https://www.facebook.com/")).toBe("Social");
        expect(getCategoryFromUrl("https://www.reddit.com/r/programming")).toBe("Social");
    });

    test("categorizes Shopping URLs", () => {
        expect(getCategoryFromUrl("https://www.amazon.com/dp/B000")).toBe("Shopping");
    });

    test("categorizes News URLs", () => {
        expect(getCategoryFromUrl("https://www.cnn.com")).toBe("News");
    });

    test("categorizes Gaming URLs", () => {
        expect(getCategoryFromUrl("https://www.twitch.tv/streamer")).toBe("Gaming");
    });

    test("returns Uncategorized for unknown URLs", () => {
        expect(getCategoryFromUrl("https://example.com")).toBe("Uncategorized");
        expect(getCategoryFromUrl("https://unknown-site.org")).toBe("Uncategorized");
    });

    test("is case insensitive", () => {
        expect(getCategoryFromUrl("https://GITHUB.COM")).toBe("Development");
        expect(getCategoryFromUrl("https://Docs.Google.Com")).toBe("Work");
    });

    test("respects priority order", () => {
        // If a URL has both "github" and "twitter" -> Development (Dev is first)
        expect(getCategoryFromUrl("https://github.com/twitter/repo")).toBe("Development");

        // If a URL has "netflix" (Entertainment) and "facebook" (Social) -> Entertainment (Entertainment is first)
        expect(getCategoryFromUrl("https://www.facebook.com/netflix")).toBe("Entertainment");
    });
});
