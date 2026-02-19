import { test, expect, describe } from "bun:test";
import { determineCategoryFromContext } from "../src/background/categorizationRules";
import { PageContext } from "../src/shared/types";

describe("Context Categorization", () => {
  const createMockContext = (overrides: Partial<PageContext>): PageContext => ({
    canonicalUrl: null,
    normalizedUrl: "https://example.com",
    siteName: null,
    platform: null,
    objectType: "unknown",
    objectId: null,
    title: null,
    description: null,
    authorOrCreator: null,
    publishedAt: null,
    modifiedAt: null,
    language: null,
    tags: [],
    breadcrumbs: [],
    isAudible: false,
    isMuted: false,
    isCapturing: false,
    progress: null,
    hasUnsavedChangesLikely: false,
    isAuthenticatedLikely: false,
    sources: {},
    confidence: {},
    ...overrides
  });

  test("categorizes Entertainment platforms", () => {
    expect(determineCategoryFromContext(createMockContext({ platform: "YouTube" }))).toBe("Entertainment");
    expect(determineCategoryFromContext(createMockContext({ platform: "Netflix" }))).toBe("Entertainment");
    expect(determineCategoryFromContext(createMockContext({ platform: "Spotify" }))).toBe("Entertainment");
    expect(determineCategoryFromContext(createMockContext({ platform: "Twitch" }))).toBe("Entertainment");
  });

  test("categorizes Development platforms", () => {
    expect(determineCategoryFromContext(createMockContext({ platform: "GitHub" }))).toBe("Development");
    expect(determineCategoryFromContext(createMockContext({ platform: "Stack Overflow" }))).toBe("Development");
    expect(determineCategoryFromContext(createMockContext({ platform: "Jira" }))).toBe("Development");
    expect(determineCategoryFromContext(createMockContext({ platform: "GitLab" }))).toBe("Development");
  });

  test("categorizes Google Work Suite", () => {
    expect(determineCategoryFromContext(createMockContext({
      platform: "Google",
      normalizedUrl: "https://docs.google.com/document/d/123"
    }))).toBe("Work");

    expect(determineCategoryFromContext(createMockContext({
      platform: "Google",
      normalizedUrl: "https://sheets.google.com/spreadsheets/d/123"
    }))).toBe("Work");

    expect(determineCategoryFromContext(createMockContext({
      platform: "Google",
      normalizedUrl: "https://slides.google.com/presentation/d/123"
    }))).toBe("Work");
  });

  test("handles objectType fallbacks", () => {
    expect(determineCategoryFromContext(createMockContext({ objectType: "video" }))).toBe("Entertainment");
    expect(determineCategoryFromContext(createMockContext({ objectType: "article" }))).toBe("News");
    expect(determineCategoryFromContext(createMockContext({ objectType: "product" }))).toBe("Product");
    expect(determineCategoryFromContext(createMockContext({ objectType: "search" }))).toBe("Search");
  });

  test("returns General Web for unknown types and platforms", () => {
    expect(determineCategoryFromContext(createMockContext({ objectType: "unknown" }))).toBe("General Web");
    expect(determineCategoryFromContext(createMockContext({ objectType: undefined }))).toBe("General Web");

    // Google but not docs/sheets/slides
    expect(determineCategoryFromContext(createMockContext({
      platform: "Google",
      normalizedUrl: "https://google.com/search"
    }))).toBe("General Web");
  });
});
