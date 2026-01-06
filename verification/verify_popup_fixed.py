from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Inject Mock Chrome
        page.add_init_script("""
        window.chrome = {
            runtime: {
                sendMessage: async (msg) => {
                    console.log("Message type:", msg.type);
                    if (msg.type === "getState") {
                        return {
                            ok: true,
                            data: {
                                groups: [
                                    { id: "group-1", windowId: 1, label: "Group A", color: "blue", tabs: [
                                        { id: 10, title: "Tab 1", url: "http://a.com", windowId: 1, groupId: 1 },
                                        { id: 11, title: "Tab 2", url: "http://b.com", windowId: 1, groupId: 1 }
                                    ], reason: "Manual" },
                                    { id: "ungrouped-1", windowId: 1, label: "Ungrouped", color: "grey", tabs: [
                                        { id: 12, title: "Tab 3", url: "http://c.com", windowId: 1, groupId: -1 }
                                    ], reason: "Ungrouped" }
                                ],
                                preferences: { sorting: [] }
                            }
                        };
                    }
                    if (msg.type === "unmergeSelection") {
                        console.log("Unmerge called with:", msg.payload);
                        return { ok: true };
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

        # Wait for tree to render
        page.wait_for_selector(".tree-node")

        # Take screenshot of initial state
        page.screenshot(path="verification/popup_initial.png")

        # Check for Unmerge button
        unmerge_btn = page.locator("#btnUnmerge")
        if unmerge_btn.is_visible():
            print("Unmerge button is visible")
        else:
            print("Unmerge button is NOT visible")

        # Select All
        page.click("#selectAll")

        time.sleep(0.5)
        page.screenshot(path="verification/popup_selected.png")

        browser.close()

run()
