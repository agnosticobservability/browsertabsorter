from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"PAGE ERROR: {exc}"))

        page.add_init_script("""
        window.chrome = {
            runtime: {
                sendMessage: async (msg) => {
                    console.log("Mock sendMessage: " + msg);
                    if (msg === "getState") {
                        return {
                            ok: true,
                            data: {
                                groups: [
                                    { id: "group-1", windowId: 1, label: "Group A", color: "blue", tabs: [
                                        { id: 10, title: "Tab 1", url: "http://a.com", windowId: 1, groupId: 1 },
                                        { id: 11, title: "Tab 2", url: "http://b.com", windowId: 1, groupId: 1 }
                                    ], reason: "Manual" }
                                ],
                                preferences: { sorting: [] }
                            }
                        };
                    }
                    return { ok: true };
                },
                getURL: (path) => path,
                onMessage: { addListener: () => {} }
            },
            tabs: {
                query: () => Promise.resolve([]),
                onUpdated: { addListener: () => {} },
                onRemoved: { addListener: () => {} },
                remove: () => Promise.resolve(),
                update: () => Promise.resolve(),
                ungroup: () => Promise.resolve(),
                group: () => Promise.resolve(1),
                move: () => Promise.resolve()
            },
            windows: {
                getCurrent: () => Promise.resolve({ id: 1, type: "normal" }),
                getAll: () => Promise.resolve([{ id: 1, tabs: [] }]),
                onRemoved: { addListener: () => {} },
                update: () => Promise.resolve()
            },
            storage: {
                local: {
                    get: () => Promise.resolve({})
                }
            },
            tabGroups: {
                onRemoved: { addListener: () => {} }
            }
        };
        """)

        page.goto("http://localhost:8000/ui/popup.html")
        page.wait_for_timeout(2000)

        # Check if windows are rendered
        content = page.content()
        if "Group A" in content:
            print("Group A found in content")
        else:
            print("Group A NOT found")

        page.screenshot(path="verification/debug.png")
        browser.close()

run()
