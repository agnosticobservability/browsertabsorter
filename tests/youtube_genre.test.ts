import { heuristicGenre, mapGenreToColor } from "../src/background/extraction/youtube.js";
import assert from "assert";

console.log("Running YouTube genre heuristic tests...");

// 1. Heuristic
// "Gaming" is first in definition
assert.strictEqual(heuristicGenre("Let's Play Minecraft"), "Gaming");

// "Music"
assert.strictEqual(heuristicGenre("Official Music Video"), "Music");

// "Education" comes before "Tech" in definition
// "tutorial" matches Education. "coding" matches Tech.
// "Python Tutorial" -> Education because "tutorial" matches first?
// Or iterate order?
// GENRE_KEYWORDS order: Gaming, Music, Education, News, Tech...
assert.strictEqual(heuristicGenre("Math Lesson"), "Education");

// "Tech"
assert.strictEqual(heuristicGenre("iPhone 15 Review"), "Tech");

// "Sports"
assert.strictEqual(heuristicGenre("NBA Highlights"), "Sports");

// "News"
assert.strictEqual(heuristicGenre("Breaking News Live"), "News");

// 2. Color Mapping
assert.strictEqual(mapGenreToColor("Gaming"), "purple");
assert.strictEqual(mapGenreToColor("Music"), "blue");
assert.strictEqual(mapGenreToColor("Unknown"), "grey");
assert.strictEqual(mapGenreToColor("InvalidGenre"), "grey");

console.log("All YouTube genre tests passed!");
