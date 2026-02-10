"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const youtube_js_1 = require("../src/background/extraction/youtube.js");
const assert_1 = __importDefault(require("assert"));
console.log("Running YouTube genre heuristic tests...");
// 1. Heuristic
// "Gaming" is first in definition
assert_1.default.strictEqual((0, youtube_js_1.heuristicGenre)("Let's Play Minecraft"), "Gaming");
// "Music"
assert_1.default.strictEqual((0, youtube_js_1.heuristicGenre)("Official Music Video"), "Music");
// "Education" comes before "Tech" in definition
// "tutorial" matches Education. "coding" matches Tech.
// "Python Tutorial" -> Education because "tutorial" matches first?
// Or iterate order?
// GENRE_KEYWORDS order: Gaming, Music, Education, News, Tech...
assert_1.default.strictEqual((0, youtube_js_1.heuristicGenre)("Math Lesson"), "Education");
// "Tech"
assert_1.default.strictEqual((0, youtube_js_1.heuristicGenre)("iPhone 15 Review"), "Tech");
// "Sports"
assert_1.default.strictEqual((0, youtube_js_1.heuristicGenre)("NBA Highlights"), "Sports");
// "News"
assert_1.default.strictEqual((0, youtube_js_1.heuristicGenre)("Breaking News Live"), "News");
// 2. Color Mapping
assert_1.default.strictEqual((0, youtube_js_1.mapGenreToColor)("Gaming"), "purple");
assert_1.default.strictEqual((0, youtube_js_1.mapGenreToColor)("Music"), "blue");
assert_1.default.strictEqual((0, youtube_js_1.mapGenreToColor)("Unknown"), "grey");
assert_1.default.strictEqual((0, youtube_js_1.mapGenreToColor)("InvalidGenre"), "grey");
console.log("All YouTube genre tests passed!");
