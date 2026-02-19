import { describe, expect, test } from "bun:test";
import { getFieldValue, applyValueTransform, groupTabs } from "../src/background/groupingStrategies";
import { TabMetadata } from "../src/shared/types";

describe("getFieldValue", () => {
    const mockTab: TabMetadata = {
        id: 1,
        windowId: 1,
        title: "Test Tab",
        url: "https://example.com/page",
        pinned: false,
        active: true,
        index: 0,
        contextData: {
            genre: "Music",
            siteName: "YouTube",
            canonicalUrl: null,
            normalizedUrl: "",
            platform: null,
            objectType: 'video',
            objectId: null,
            title: null,
            description: null,
            authorOrCreator: null,
            publishedAt: null,
            modifiedAt: null,
            language: null,
            tags: [],
            breadcrumbs: [],
            isAudible: false,
            isMuted: false,
            isCapturing: false,
            progress: null,
            hasUnsavedChangesLikely: false,
            isAuthenticatedLikely: false,
            sources: {},
            confidence: {},
            enrichments: {
                customField: "CustomValue"
            }
        }
    };

    test("should retrieve top-level property", () => {
        expect(getFieldValue(mockTab, "title")).toBe("Test Tab");
        expect(getFieldValue(mockTab, "url")).toBe("https://example.com/page");
    });

    test("should retrieve specific property handled in switch", () => {
        expect(getFieldValue(mockTab, "genre")).toBe("Music");
    });

    test("should retrieve nested property via dot notation", () => {
        expect(getFieldValue(mockTab, "contextData.siteName")).toBe("YouTube");
        expect(getFieldValue(mockTab, "contextData.enrichments.customField")).toBe("CustomValue");
    });

    test("should return undefined for non-existent property", () => {
        expect(getFieldValue(mockTab, "nonExistentField")).toBeUndefined();
    });

    test("should return undefined for non-existent nested property", () => {
        expect(getFieldValue(mockTab, "contextData.nonExistent")).toBeUndefined();
        expect(getFieldValue(mockTab, "contextData.enrichments.missing")).toBeUndefined();
    });

    // Regression test for "as any" change
    test("should handle top-level dynamic property access", () => {
        // Since we can't add arbitrary props to mockTab due to TS, we can cast
        const extendedTab = { ...mockTab, dynamicProp: "Dynamic" } as unknown as TabMetadata;
        expect(getFieldValue(extendedTab, "dynamicProp")).toBe("Dynamic");
    });
});

describe("applyValueTransform", () => {
    test("should handle regexReplace with groups", () => {
        const input = "user-123";
        const pattern = "(\\w+)-(\\d+)";
        const replacement = "$2 $1";
        expect(applyValueTransform(input, "regexReplace", pattern, replacement)).toBe("123 user");
    });

    test("should handle regexReplace with string replacement", () => {
        const input = "hello world";
        const pattern = "world";
        const replacement = "universe";
        expect(applyValueTransform(input, "regexReplace", pattern, replacement)).toBe("hello universe");
    });
});

describe("groupTabs Label Generation", () => {
    const mockTab1: TabMetadata = {
        id: 1,
        windowId: 1,
        title: "Google Search",
        url: "https://www.google.com/search?q=test",
        pinned: false,
        active: false,
        index: 0,
        lastAccessed: Date.now(),
        contextData: {
            siteName: "Google",
            genre: "Search",
            canonicalUrl: "https://www.google.com/",
            normalizedUrl: "https://www.google.com/",
            platform: "Google",
            objectType: 'search',
            objectId: null,
            title: "Google Search",
            description: null,
            authorOrCreator: null,
            publishedAt: null,
            modifiedAt: null,
            language: "en",
            tags: [],
            breadcrumbs: [],
            isAudible: false,
            isMuted: false,
            isCapturing: false,
            progress: null,
            hasUnsavedChangesLikely: false,
            isAuthenticatedLikely: false,
            sources: {},
            confidence: {}
        }
    };

    const mockTab2: TabMetadata = {
        id: 2,
        windowId: 1,
        title: "GitHub - Repo",
        url: "https://github.com/user/repo",
        pinned: true,
        active: true,
        index: 1,
        lastAccessed: Date.now() - 10000,
        openerTabId: 1,
        context: "Dev",
        contextData: {
            siteName: "GitHub",
            genre: "Dev",
            canonicalUrl: "https://github.com/user/repo",
            normalizedUrl: "https://github.com/user/repo",
            platform: "GitHub",
            objectType: 'repo',
            objectId: "user/repo",
            title: "GitHub - Repo",
            description: null,
            authorOrCreator: "user",
            publishedAt: null,
            modifiedAt: null,
            language: "en",
            tags: [],
            breadcrumbs: [],
            isAudible: false,
            isMuted: false,
            isCapturing: false,
            progress: null,
            hasUnsavedChangesLikely: false,
            isAuthenticatedLikely: true,
            sources: {},
            confidence: {}
        }
    };

    test("should generate label for domain strategy", () => {
        const groups = groupTabs([mockTab1], ["domain"]);
        expect(groups[0].label).toBe("Google");
    });

    test("should generate label for domain_full strategy", () => {
        const groups = groupTabs([mockTab1], ["domain_full"]);
        expect(groups[0].label).toBe("google.com");
    });

    test("should generate label for topic strategy", () => {
        const groups = groupTabs([mockTab1], ["topic"]);
        // "Misc" is filtered out in generateLabel
        expect(groups[0].label).toBe("Group");

        const docsTab = { ...mockTab1, title: "Documentation" };
        const docsGroups = groupTabs([docsTab], ["topic"]);
        expect(docsGroups[0].label).toBe("Docs");
    });

    test("should generate label for lineage strategy", () => {
        const groups = groupTabs([mockTab2], ["lineage"]);
        expect(groups[0].label).toBe("From: Tab 1");

        const groupsWithParent = groupTabs([mockTab1, mockTab2], ["lineage"]);
        const childGroup = groupsWithParent.find(g => g.tabs.some(t => t.id === 2));
        expect(childGroup?.label).toBe("From: Google Search");
    });

    test("should generate label for context strategy", () => {
        const groups = groupTabs([mockTab2], ["context"]);
        expect(groups[0].label).toBe("Dev");
    });

    test("should generate label for pinned strategy", () => {
        const groups = groupTabs([mockTab2], ["pinned"]);
        expect(groups[0].label).toBe("Pinned");

        const groupsUnpinned = groupTabs([mockTab1], ["pinned"]);
        expect(groupsUnpinned[0].label).toBe("Unpinned");
    });

    test("should generate label for age strategy", () => {
        const groups = groupTabs([mockTab1], ["age"]);
        expect(groups[0].label).toBe("Just now");
    });

    test("should generate label for nesting strategy", () => {
        const groups = groupTabs([mockTab2], ["nesting"]);
        expect(groups[0].label).toBe("Children");

        const groupsRoot = groupTabs([mockTab1], ["nesting"]);
        expect(groupsRoot[0].label).toBe("Roots");
    });

    test("should combine labels for multiple strategies", () => {
        // strategies: ["domain", "context"]
        // mockTab2: domain=GitHub, context=Dev
        const groups = groupTabs([mockTab2], ["domain", "context"]);
        expect(groups[0].label).toBe("GitHub - Dev");
    });
});
