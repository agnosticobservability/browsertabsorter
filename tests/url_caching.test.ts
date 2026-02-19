import { domainFromUrl, subdomainFromUrl } from "../src/background/groupingStrategies.js";
import assert from "assert";

console.log("Running URL caching and correctness tests...");

// Test Case 1: Standard Domain
const url1 = "https://www.google.com/search?q=test";
const domain1 = domainFromUrl(url1);
assert.strictEqual(domain1, "google.com", "Should extract domain from standard URL");

// Test Case 2: Subdomain
const url2 = "https://docs.microsoft.com/en-us/";
const domain2 = domainFromUrl(url2);
assert.strictEqual(domain2, "docs.microsoft.com", "Should include subdomain in domainFromUrl");

// Test Case 3: Subdomain Extraction
const sub2 = subdomainFromUrl(url2);
assert.strictEqual(sub2, "docs", "Should extract 'docs' as subdomain");

// Test Case 4: No Subdomain
const url3 = "https://example.com";
const sub3 = subdomainFromUrl(url3);
assert.strictEqual(sub3, "", "Should return empty string for no subdomain");

// Test Case 5: Complex Subdomain
const url4 = "https://a.b.c.example.com";
const domain4 = domainFromUrl(url4);
assert.strictEqual(domain4, "a.b.c.example.com", "Should return full hostname");
const sub4 = subdomainFromUrl(url4);
assert.strictEqual(sub4, "a.b.c", "Should extract 'a.b.c' as subdomain");

// Test Case 6: Malformed URL
const url5 = "not a url";
const domain5 = domainFromUrl(url5);
assert.strictEqual(domain5, "unknown", "Should return 'unknown' for malformed URL");
const sub5 = subdomainFromUrl(url5);
assert.strictEqual(sub5, "", "Should return empty string for malformed URL");

// Test Case 7: Cache Hit (Implicit)
// We can't easily check cache hit without exposing internals, but running it again should work.
const domain1_again = domainFromUrl(url1);
assert.strictEqual(domain1_again, "google.com", "Should return correct domain on second call (cache hit)");

// Test Case 8: Cache Limit (Implicit)
// We can't verify cache eviction easily without mocking, but we can verify correctness after many calls.
for (let i = 0; i < 1100; i++) {
    domainFromUrl(`https://test${i}.example.com`);
}
// Cache should have cleared/evicted. Check correctness again.
const domain1_after_flood = domainFromUrl(url1);
assert.strictEqual(domain1_after_flood, "google.com", "Should still return correct domain after cache flood");

console.log("All URL caching tests passed!");
