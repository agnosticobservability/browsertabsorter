import { extractYouTubeChannelFromHtml, extractYouTubeGenreFromHtml } from "../src/background/extraction/logic.js";
import assert from "assert";

console.log("Running Extraction Logic Tests...");

const mockHtml = `
<html>
<head>
    <script type="application/ld+json">
    {
        "@type": "VideoObject",
        "author": "Test Channel"
    }
    </script>
    <script type="application/ld+json">
    {
        "@type": "BreadcrumbList",
        "itemListElement": []
    }
    </script>
    <link itemprop="name" content="Link Channel">
    <meta name="author" content="Meta Author">
    <meta itemprop="genre" content="Gaming">
</head>
<body>
    <script>
    var ytInitialData = {"category":"Entertainment"};
    </script>
</body>
</html>
`;

// 1. Channel extraction - JSON-LD has priority
const channel1 = extractYouTubeChannelFromHtml(mockHtml);
console.log("Channel (JSON-LD):", channel1);
assert.strictEqual(channel1, "Test Channel");

// 2. Channel extraction - Fallback to <link>
const mockHtmlNoJsonLd = `
<html>
<head>
    <link itemprop="name" content="Link Channel">
    <meta name="author" content="Meta Author">
</head>
</html>
`;
const channel2 = extractYouTubeChannelFromHtml(mockHtmlNoJsonLd);
console.log("Channel (Link):", channel2);
assert.strictEqual(channel2, "Link Channel");

// 3. Channel extraction - Fallback to <meta>
const mockHtmlOnlyMeta = `
<html>
<head>
    <meta name="author" content="Meta Author">
</head>
</html>
`;
const channel3 = extractYouTubeChannelFromHtml(mockHtmlOnlyMeta);
console.log("Channel (Meta):", channel3);
assert.strictEqual(channel3, "Meta Author");

// 4. Genre extraction - Meta has priority
const genre1 = extractYouTubeGenreFromHtml(mockHtml);
console.log("Genre (Meta):", genre1);
assert.strictEqual(genre1, "Gaming");

// 5. Genre extraction - Fallback to category regex
const mockHtmlOnlyCategory = `
<html>
<body>
    <script>
    var data = {"category":"Music"};
    </script>
</body>
</html>
`;
const genre2 = extractYouTubeGenreFromHtml(mockHtmlOnlyCategory);
console.log("Genre (Category):", genre2);
assert.strictEqual(genre2, "Music");

// 6. Entity decoding
const htmlWithEntities = `
<meta name="author" content="Channel &amp; Co">
<meta itemprop="genre" content="R&#39;n&#39;B">
`;
assert.strictEqual(extractYouTubeChannelFromHtml(htmlWithEntities), "Channel & Co");
assert.strictEqual(extractYouTubeGenreFromHtml(htmlWithEntities), "R'n'B");

console.log("All extraction logic tests passed!");
