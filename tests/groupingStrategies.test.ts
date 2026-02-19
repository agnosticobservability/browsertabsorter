import { describe, expect, test } from "bun:test";
import { getFieldValue, applyValueTransform } from "../src/background/groupingStrategies";
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
