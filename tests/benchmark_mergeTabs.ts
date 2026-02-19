
// Simulate chrome API
const mockTabs = new Map<number, any>();
const TOTAL_TABS = 1000;

// Setup mock tabs
for (let i = 1; i <= TOTAL_TABS; i++) {
    mockTabs.set(i, {
        id: i,
        windowId: 1,
        title: `Tab ${i}`,
        url: `http://example.com/${i}`,
        active: false,
        pinned: false
    });
}

// Delays in ms
const IPC_LATENCY = 2; // Base latency
const PROCESSING_TIME_PER_CALL = 0.5; // Browser side processing time per API call
const SERIALIZATION_OVERHEAD = 0.01; // Per object serialization

// Simulate a single thread on the "browser" side
let browserQueue = Promise.resolve();

const scheduleBrowserTask = (task: () => Promise<any>) => {
    const result = browserQueue.then(async () => {
        // Simulate IPC latency (parallel-ish, but processing is serial)
        // Actually, IPC message arrival is async, but processing is serial.
        // Let's just add latency then process.
        await new Promise(r => setTimeout(r, IPC_LATENCY));
        return task();
    });
    // For simplicity, we don't block the queue on latency, just processing.
    // But let's assume strict serialization for correctness of "overhead".
    browserQueue = result.catch(() => {});
    return result;
};

// Better simulation:
// Calls incur latency (parallel).
// Then they enter a processing queue (serial).
const processInBrowser = async <T>(work: () => T, overhead: number): Promise<T> => {
    // 1. Send message (Latency)
    await new Promise(r => setTimeout(r, IPC_LATENCY));

    // 2. Queue for processing (Serial)
    return new Promise((resolve, reject) => {
        browserQueue = browserQueue.then(async () => {
             try {
                // Processing time
                await new Promise(r => setTimeout(r, overhead));
                resolve(work());
             } catch (e) {
                reject(e);
             }
        });
    });
};


const mockChrome = {
    tabs: {
        get: (id: number) => {
            return processInBrowser(() => {
                const tab = mockTabs.get(id);
                if (!tab) throw new Error("Tab not found");
                return { ...tab };
            }, PROCESSING_TIME_PER_CALL);
        },
        query: (queryInfo: any) => {
            return processInBrowser(() => {
                // Serialize all tabs
                const all = Array.from(mockTabs.values());
                // Overhead depends on number of tabs
                return all.map(t => ({ ...t }));
            }, PROCESSING_TIME_PER_CALL + (mockTabs.size * SERIALIZATION_OVERHEAD));
        }
    }
};

// Legacy Implementation
const mergeTabs_Legacy = async (tabIds: number[]) => {
  if (!tabIds.length) return;
  const tabs = await Promise.all(tabIds.map(id => mockChrome.tabs.get(id).catch(() => null)));
  const validTabs = tabs.filter((t): t is any => t !== null && t.id !== undefined && t.windowId !== undefined);
  return validTabs;
};

// Optimized Implementation
const mergeTabs_Optimized = async (tabIds: number[]) => {
  if (!tabIds.length) return;
  const allTabs = await mockChrome.tabs.query({});
  // Use Set for O(1) lookup
  const idSet = new Set(tabIds);
  const validTabs = allTabs.filter((t: any) => t.id !== undefined && idSet.has(t.id));
  return validTabs;
};

async function measure(name: string, fn: (ids: number[]) => Promise<any>, ids: number[]) {
    const start = performance.now();
    await fn(ids);
    const end = performance.now();
    return end - start;
}

async function runBenchmark() {
    console.log("Running Benchmark (Serial Browser Processing)...");
    console.log(`Total Tabs in Browser: ${TOTAL_TABS}`);
    console.log(`IPC Latency: ${IPC_LATENCY}ms`);
    console.log(`Browser Processing: ${PROCESSING_TIME_PER_CALL}ms/call`);
    console.log(`Serialization: ${SERIALIZATION_OVERHEAD}ms/tab`);

    // Warmup
    console.log("Warming up...");
    await measure("Warmup", mergeTabs_Legacy, [1, 2]);
    await measure("Warmup", mergeTabs_Optimized, [1, 2]);

    const scenarios = [
        { name: "Small Selection", count: 5 },
        { name: "Medium Selection", count: 50 },
        { name: "Large Selection", count: 200 }
    ];

    for (const scenario of scenarios) {
        // Reset queue to ensure fairness (though it should be empty)
        browserQueue = Promise.resolve();

        const ids = Array.from({ length: scenario.count }, (_, i) => i + 1);

        const timeLegacy = await measure("Legacy", mergeTabs_Legacy, ids);
        // Wait for legacy queue to clear (it should be clear since we awaited fn)

        const timeOptimized = await measure("Optimized", mergeTabs_Optimized, ids);

        console.log(`\nScenario: ${scenario.name} (${scenario.count} tabs)`);
        console.log(`  Legacy:    ${timeLegacy.toFixed(2)}ms`);
        console.log(`  Optimized: ${timeOptimized.toFixed(2)}ms`);
        console.log(`  Improvement: ${(timeLegacy / timeOptimized).toFixed(1)}x`);
    }
}

runBenchmark();
