import { describe, expect, test } from "bun:test";
import { getGroupingResult, setCustomStrategies } from "../src/background/groupingStrategies";
import { TabMetadata, CustomStrategy } from "../src/shared/types";

describe("evaluateLegacyRules", () => {
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

    test("should evaluate legacy rule matches", () => {
        const legacyStrategy: CustomStrategy = {
            id: "legacy1",
            label: "Legacy 1",
            groupingRules: [],
            sortingRules: [],
            rules: [
                {
                    field: "title",
                    operator: "contains",
                    value: "Test",
                    result: "Found Test"
                }
            ]
        };

        setCustomStrategies([legacyStrategy]);

        const result = getGroupingResult(mockTab, "legacy1");
        expect(result.key).toBe("Found Test");
    });

    test("should handle regex capture groups in result", () => {
        const legacyStrategy: CustomStrategy = {
            id: "legacy2",
            label: "Legacy 2",
            groupingRules: [],
            sortingRules: [],
            rules: [
                {
                    field: "url",
                    operator: "matches",
                    value: "https://(example)\\.com/(.*)",
                    result: "Domain: $1, Path: $2"
                }
            ]
        };

        setCustomStrategies([legacyStrategy]);

        const result = getGroupingResult(mockTab, "legacy2");
        expect(result.key).toBe("Domain: example, Path: page");
    });

    test("should fallback if no legacy rules match", () => {
        const legacyStrategy: CustomStrategy = {
            id: "legacy3",
            label: "Legacy 3",
            groupingRules: [],
            sortingRules: [],
            fallback: "Default Group",
            rules: [
                {
                    field: "title",
                    operator: "contains",
                    value: "NonExistent",
                    result: "Should Not Match"
                }
            ]
        };

        setCustomStrategies([legacyStrategy]);

        const result = getGroupingResult(mockTab, "legacy3");
        expect(result.key).toBe("Default Group");
    });

    test("should handle null rules array gracefully", () => {
         const legacyStrategy: CustomStrategy = {
            id: "legacy4",
            label: "Legacy 4",
            groupingRules: [],
            sortingRules: [],
            fallback: "Default Group",
            // @ts-ignore
            rules: null
        };

        setCustomStrategies([legacyStrategy]);

        const result = getGroupingResult(mockTab, "legacy4");
        expect(result.key).toBe("Default Group");
    });
});
