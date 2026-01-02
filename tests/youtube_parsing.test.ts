import { parseYouTubeUrl } from "../src/background/extraction/logic.js";
import assert from "assert";

console.log("Running YouTube parsing tests...");

// 1. Standard
const t1 = parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
assert.strictEqual(t1.videoId, "dQw4w9WgXcQ");
assert.strictEqual(t1.isShorts, false);

// 2. Shorts
const t2 = parseYouTubeUrl("https://www.youtube.com/shorts/AbCdEfGhIjK");
assert.strictEqual(t2.videoId, "AbCdEfGhIjK");
assert.strictEqual(t2.isShorts, true);

// 3. Playlist
const t3 = parseYouTubeUrl("https://www.youtube.com/watch?v=123&list=PL456&index=5");
assert.strictEqual(t3.videoId, "123");
assert.strictEqual(t3.playlistId, "PL456");
assert.strictEqual(t3.playlistIndex, 5);

// 4. No video
const t4 = parseYouTubeUrl("https://www.youtube.com/feed/subscriptions");
assert.strictEqual(t4.videoId, null);

console.log("All YouTube parsing tests passed!");
