from playwright.sync_api import sync_playwright
import os

def verify_devtools():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Inject chrome mock with some sample tabs
        # We need to make sure this runs BEFORE the module script
        page.add_init_script("""
            window.chrome = {
                runtime: {
                    sendMessage: async () => ({ ok: true, data: { groups: [], preferences: {} } }),
                    onMessage: { addListener: () => {} },
                    onInstalled: { addListener: () => {} }
                },
                tabs: {
                    query: async () => [
                        {
                            id: 101,
                            index: 0,
                            windowId: 1,
                            groupId: -1,
                            title: 'Google Search',
                            url: 'https://www.google.com',
                            status: 'complete',
                            active: true,
                            pinned: false,
                            openerTabId: undefined,
                            lastAccessed: Date.now()
                        },
                        {
                            id: 102,
                            index: 1,
                            windowId: 1,
                            groupId: 5,
                            title: 'GitHub - Pull Requests',
                            url: 'https://github.com/pulls',
                            status: 'complete',
                            active: false,
                            pinned: true,
                            openerTabId: 101,
                            lastAccessed: Date.now() - 3600000
                        }
                    ],
                    onUpdated: { addListener: () => {} },
                    onRemoved: { addListener: () => {} },
                    group: async () => {},
                    ungroup: async () => {},
                    move: async () => {},
                    remove: async () => {},
                    update: async () => {}
                },
                windows: {
                    getCurrent: async () => ({ id: 1 }),
                    getAll: async () => [],
                    onRemoved: { addListener: () => {} },
                    update: async () => {},
                    remove: async () => {}
                },
                tabGroups: {
                    update: async () => {},
                    onRemoved: { addListener: () => {} }
                }
            };
        """)

        # Use localhost to avoid file:// module restrictions
        devtools_path = "http://localhost:8000/ui/devtools.html"
        print(f"Navigating to: {devtools_path}")

        try:
            page.goto(devtools_path)

            try:
                # Wait for the table to be populated
                # We look for the table row with the mocked data
                page.wait_for_selector("text=Google Search", timeout=5000)
                print("Found Google Search tab in table")
            except Exception:
                print("Timeout waiting for 'Google Search'. Current page content:")
                # print(page.content())


            # Verify the header "Tab Sorter Developer Tools"
            if page.is_visible("text=Tab Sorter Developer Tools"):
                print("Header visible")

            # Verify the refresh button
            if page.is_visible("#refreshBtn"):
                print("Refresh button visible")

            page.screenshot(path="verification/devtools_screenshot.png")
            print("Screenshot saved to verification/devtools_screenshot.png")

        except Exception as e:
            print(f"Error: {e}")

        browser.close()

if __name__ == "__main__":
    verify_devtools()
