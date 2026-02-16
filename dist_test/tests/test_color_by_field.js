"use strict";
// tests/test_color_by_field.ts
Object.defineProperty(exports, "__esModule", { value: true });
// Mock chrome
const chromeMock = {
    runtime: {
        id: 'mock-id',
        getManifest: () => ({ version: '1.0.0' }),
    },
    storage: {
        session: {
            get: () => Promise.resolve({}),
            set: () => Promise.resolve()
        }
    }
};
global.chrome = chromeMock;
global.self = global; // for ServiceWorkerGlobalScope check
const groupingStrategies_1 = require("../src/background/groupingStrategies");
// Helper to create tab
const createTab = (id, title, url, genre) => ({
    id,
    windowId: 1,
    title,
    url,
    pinned: false,
    index: 0,
    active: false,
    contextData: {
        genre,
        normalizedUrl: url,
        // ... other required fields
    }
});
async function runTest() {
    console.log("Running Color by Field Test...");
    const strategy = {
        id: "group-domain-color-genre",
        label: "Group by Domain, Color by Genre",
        filters: [],
        groupingRules: [
            {
                source: "field",
                value: "domain",
                color: "field",
                colorField: "genre",
                windowMode: "current"
            }
        ],
        sortingRules: [],
        groupSortingRules: []
    };
    (0, groupingStrategies_1.setCustomStrategies)([strategy]);
    const tabs = [
        createTab(1, "Google Search", "https://google.com", "Search"),
        createTab(2, "Google Mail", "https://mail.google.com", "Email"),
        createTab(3, "Google Drive", "https://drive.google.com", "Storage"),
        createTab(4, "YouTube Video", "https://youtube.com/watch?v=123", "Video"),
    ];
    // Group by 'group-domain-color-genre'
    const groups = (0, groupingStrategies_1.groupTabs)(tabs, ["group-domain-color-genre"]);
    console.log(`Created ${groups.length} groups.`);
    // Expected groups:
    // 1. google.com (tabs 1, 2, 3)
    // 2. youtube.com (tab 4)
    const googleGroup = groups.find(g => g.label.includes("google"));
    const youtubeGroup = groups.find(g => g.label.includes("youtube"));
    if (!googleGroup || !youtubeGroup) {
        console.error("FAILED: Groups not created correctly.");
        process.exit(1);
    }
    console.log("Google Group Color:", googleGroup.color);
    console.log("YouTube Group Color:", youtubeGroup.color);
    // Verify they have valid colors
    const VALID_COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];
    if (!VALID_COLORS.includes(googleGroup.color)) {
        console.error(`FAILED: Invalid color for google group: ${googleGroup.color}`);
        process.exit(1);
    }
    if (!VALID_COLORS.includes(youtubeGroup.color)) {
        console.error(`FAILED: Invalid color for youtube group: ${youtubeGroup.color}`);
        process.exit(1);
    }
    // Verify different colors (likely)
    // Hash of "Search" vs "Video"
    if (googleGroup.color === youtubeGroup.color) {
        console.warn("WARNING: Colors are same. This might be hash collision or incorrect logic. Checking with different value.");
    }
    // Let's create another scenario where we group by title but color by domain (silly but tests logic).
    const strategy2 = {
        id: "group-title-color-domain",
        label: "Group by Title, Color by Domain",
        groupingRules: [
            {
                source: "field",
                value: "title",
                color: "field",
                colorField: "domain"
            }
        ],
        filters: [], sortingRules: []
    };
    (0, groupingStrategies_1.setCustomStrategies)([strategy2]);
    const tabs2 = [
        createTab(5, "Same Title", "https://a.com", "G1"),
        createTab(6, "Same Title", "https://b.com", "G2") // Same group, but if tab 5 comes first, color by a.com
    ];
    const groups2 = (0, groupingStrategies_1.groupTabs)(tabs2, ["group-title-color-domain"]);
    console.log("Groups2 length:", groups2.length); // Should be 1 group "Same Title"
    if (groups2.length !== 1) {
        console.error("FAILED: Should be 1 group.");
        process.exit(1);
    }
    console.log("Group2 Color (based on a.com):", groups2[0].color);
    if (!VALID_COLORS.includes(groups2[0].color)) {
        console.error("FAILED: Invalid color for Group2");
        process.exit(1);
    }
    console.log("SUCCESS: Color by Field verification passed.");
}
runTest().catch(e => {
    console.error(e);
    process.exit(1);
});
