import { normalizeUrl } from "../src/background/extraction/logic.js";
import assert from "assert";

console.log("Running URL normalization tests...");

// Test Case 1: Generic Tracking Params
const url1 = "https://example.com/page?utm_source=twitter&utm_medium=social&id=123";
const norm1 = normalizeUrl(url1);
assert.strictEqual(norm1, "https://example.com/page?id=123", "Should remove utm params");

// Test Case 2: FBCLID
const url2 = "https://example.com/?fbclid=IwAR0...&q=test";
const norm2 = normalizeUrl(url2);
assert.strictEqual(norm2, "https://example.com/?q=test", "Should remove fbclid");

// Test Case 3: YouTube (Allowlist)
// Allowed: v, list, t, c, channel, playlist
const url3 = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=youtu.be&ab_channel=RickAstley";
const norm3 = normalizeUrl(url3);
// feature and ab_channel should be removed
assert.strictEqual(norm3, "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "Should only keep allowed params for YouTube");

const url3b = "https://www.youtube.com/watch?v=123&t=10s&list=PL123";
const norm3b = normalizeUrl(url3b);
assert.strictEqual(norm3b, "https://www.youtube.com/watch?v=123&t=10s&list=PL123", "Should keep v, t, list");

// Test Case 4: Google Search
const url4 = "https://www.google.com/search?q=test&client=firefox-b-d&sxsrf=ALeKk00...";
const norm4 = normalizeUrl(url4);
assert.strictEqual(norm4, "https://www.google.com/search?q=test", "Should keep q and remove others for Google");

// Test Case 5: No query
const url5 = "https://example.com/path";
assert.strictEqual(normalizeUrl(url5), url5, "Should handle no query");

// Test Case 6: Malformed
const url6 = "not a url";
assert.strictEqual(normalizeUrl(url6), url6, "Should handle malformed URL gracefully");

console.log("All URL normalization tests passed!");
