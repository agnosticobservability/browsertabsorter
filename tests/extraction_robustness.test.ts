import { extractJsonLdFields, extractYouTubeMetadataFromHtml } from "../src/background/extraction/logic.js";
import { describe, test, expect } from "bun:test";

describe("Extraction Robustness", () => {
    describe("JSON-LD", () => {
        test("should extract uploadDate as publishedAt for VideoObject if datePublished is missing", () => {
            const jsonLd = [
                {
                    "@type": "VideoObject",
                    "name": "Test Video",
                    "uploadDate": "2023-10-27T10:00:00Z",
                    "description": "A test video"
                }
            ];

            const result = extractJsonLdFields(jsonLd);
            expect(result.publishedAt).toBe("2023-10-27T10:00:00Z");
        });

        test("should prioritize datePublished over uploadDate if both exist", () => {
             const jsonLd = [
                {
                    "@type": "VideoObject",
                    "name": "Test Video",
                    "datePublished": "2023-11-01T10:00:00Z",
                    "uploadDate": "2023-10-27T10:00:00Z"
                }
            ];

            const result = extractJsonLdFields(jsonLd);
            expect(result.publishedAt).toBe("2023-11-01T10:00:00Z");
        });
    });

    describe("HTML Meta Tags", () => {
        test("should extract uploadDate from meta tag even if attribute order is different", () => {
            const html = `
                <html>
                    <head>
                        <meta content="2023-10-27T10:00:00Z" itemprop="uploadDate">
                    </head>
                </html>
            `;
            const result = extractYouTubeMetadataFromHtml(html);
            expect(result.publishedAt).toBe("2023-10-27T10:00:00Z");
        });

        test("should extract uploadDate from meta tag with standard order", () => {
            const html = `
                <html>
                    <head>
                        <meta itemprop="uploadDate" content="2023-10-27T10:00:00Z">
                    </head>
                </html>
            `;
            const result = extractYouTubeMetadataFromHtml(html);
            expect(result.publishedAt).toBe("2023-10-27T10:00:00Z");
        });

        test("should extract author from meta tag with reversed attributes", () => {
             const html = `
                <html>
                    <head>
                        <meta content="Test Author" name="author">
                    </head>
                </html>
            `;
            const result = extractYouTubeMetadataFromHtml(html);
            expect(result.author).toBe("Test Author");
        });
    });
});
