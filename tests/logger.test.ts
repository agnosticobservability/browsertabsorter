import { expect, test, describe, beforeEach, afterEach, mock } from "bun:test";

// Mock ServiceWorkerGlobalScope
class MockServiceWorkerGlobalScope {}
(global as any).ServiceWorkerGlobalScope = MockServiceWorkerGlobalScope;

// Make global look like an instance of ServiceWorkerGlobalScope to satisfy `self instanceof ServiceWorkerGlobalScope`
Object.setPrototypeOf(global, MockServiceWorkerGlobalScope.prototype);
(global as any).self = global;

// Mock chrome API
const mockStorage = new Map();
global.chrome = {
  storage: {
    session: {
      get: mock((keys) => {
        if (typeof keys === 'string') {
            return Promise.resolve({ [keys]: mockStorage.get(keys) });
        }
        return Promise.resolve({});
      }),
      set: mock((items) => {
        for (const key in items) {
          mockStorage.set(key, items[key]);
        }
        return Promise.resolve();
      }),
    },
  },
  runtime: {
    sendMessage: mock(() => Promise.resolve()),
  },
} as any;

describe("Logger", () => {
  let logger: any;

  beforeEach(async () => {
    // Re-import or just import once?
    // Modules are cached. So we import once.
    // Since we mocked globals at top level (which runs before tests but after static imports, wait no)

    // In Bun/Node, the code body runs... wait.
    // Static imports are hoisted.

    // So I must put the mock code in a separate file or use dynamic import.
    // Since I can't easily separate files without cluttering, I will use dynamic import here.

    logger = await import("../src/shared/logger");
    logger.clearLogs();
    mockStorage.clear();
    logger.setLoggerPreferences({ debug: false, sorting: [] }); // Default to info
  });

  test("should not log debug messages when level is info", () => {
    logger.logDebug("This is a debug message");
    const logs = logger.getLogs();
    expect(logs.length).toBe(0);
  });

  test("should log info messages when level is info", () => {
    logger.logInfo("This is an info message");
    const logs = logger.getLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].message).toBe("This is an info message");
  });

  test("should log debug messages when debug is enabled", () => {
    logger.setLoggerPreferences({ debug: true, sorting: [] });
    logger.logDebug("This is a debug message");
    const logs = logger.getLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].message).toBe("This is a debug message");
  });

  test("should respect max logs limit", () => {
    logger.setLoggerPreferences({ debug: true, sorting: [] });
    for (let i = 0; i < 1100; i++) {
      logger.logDebug(`Message ${i}`);
    }
    const logs = logger.getLogs();
    expect(logs.length).toBe(1000);
    expect(logs[0].message).toBe("Message 1099");
  });

  test("should redact sensitive information from logs", () => {
    const sensitiveContext = {
      password: "supersecretpassword",
      apiKey: "12345-abcde",
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
      user: {
        name: "John Doe",
        authorization: "bearer token",
        keyCode: 13 // Should not be redacted
      }
    };

    logger.logInfo("User login", sensitiveContext);
    const logs = logger.getLogs();
    const lastLog = logs[0];

    expect(lastLog.context.password).toBe("[REDACTED]");
    expect(lastLog.context.apiKey).toBe("[REDACTED]");
    expect(lastLog.context.token).toBe("[REDACTED]");
    expect(lastLog.context.user.authorization).toBe("[REDACTED]");
    expect(lastLog.context.user.keyCode).toBe(13); // Should be preserved
    expect(lastLog.context.user.name).toBe("John Doe"); // Should be preserved
  });
});
