import { describe, it, expect } from "bun:test";
import { getHostname } from "../src/shared/urlCache";

describe("urlCache", () => {
    it("should return hostname for valid URLs", () => {
        expect(getHostname("https://www.google.com/search?q=test")).toBe("www.google.com");
        expect(getHostname("http://localhost:3000")).toBe("localhost");
    });

    it("should return null for invalid URLs", () => {
        expect(getHostname("not-a-url")).toBe(null);
        expect(getHostname("")).toBe(null);
    });

    it("should cache results", () => {
        const url = "https://example.com";
        const res1 = getHostname(url);
        const res2 = getHostname(url);
        expect(res1).toBe("example.com");
        expect(res2).toBe("example.com");
    });
});
