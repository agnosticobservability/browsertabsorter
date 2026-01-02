import { extractJsonLdFields } from "../src/background/extraction/logic.js";
import assert from "assert";

console.log("Running JSON-LD extraction tests...");

// Test 1: Article
const jsonLd1 = [
    {
        "@type": "Article",
        "author": { "@type": "Person", "name": "Jane Doe" },
        "datePublished": "2023-01-01",
        "keywords": "tech, news"
    }
];
const res1 = extractJsonLdFields(jsonLd1);
assert.strictEqual(res1.author, "Jane Doe");
assert.strictEqual(res1.publishedAt, "2023-01-01");
assert.deepStrictEqual(res1.tags, ["tech", "news"]);

// Test 2: VideoObject with direct author string
const jsonLd2 = [
    {
        "@type": "VideoObject",
        "author": "YouTube Channel",
        "keywords": ["video", "fun"]
    }
];
const res2 = extractJsonLdFields(jsonLd2);
assert.strictEqual(res2.author, "YouTube Channel");
assert.deepStrictEqual(res2.tags, ["video", "fun"]);

// Test 3: Breadcrumbs
const jsonLd3 = [
    {
        "@type": "BreadcrumbList",
        "itemListElement": [
            { "position": 2, "name": "Subcategory" },
            { "position": 1, "item": { "name": "Home" } }
        ]
    }
];
const res3 = extractJsonLdFields(jsonLd3);
assert.deepStrictEqual(res3.breadcrumbs, ["Home", "Subcategory"]);

console.log("All JSON-LD extraction tests passed!");
