from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"PAGE ERROR: {exc}"))

        # Inject Mock Chrome
        page.add_init_script("""
        window.chrome = {
            runtime: {
                sendMessage: async (msg) => {
                    if (msg === "getState") {
                        return {
                            ok: true,
                            data: {
                                groups: [],
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
                onRemoved: { addListener: () => {} }
            },
            windows: {
                getCurrent: () => Promise.resolve({ id: 1, type: "normal" }),
                getAll: () => Promise.resolve([{ id: 1, tabs: [] }]),
                onRemoved: { addListener: () => {} }
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
        browser.close()

run()
