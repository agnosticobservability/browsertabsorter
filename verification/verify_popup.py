from playwright.sync_api import sync_playwright
import time

def test_popup_renders():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Inject mock chrome API
        page.add_init_script("""
            window.chrome = {
                runtime: {
                    sendMessage: (msg, cb) => {
                        console.log("Mock sendMessage:", msg);
                        if (msg.type === "getState") {
                            setTimeout(() => cb({
                                ok: true,
                                data: {
                                    groups: [],
                                    preferences: { sorting: ["title"], customStrategies: [] }
                                }
                            }), 10);
                        } else {
                            setTimeout(() => cb({ ok: true }), 10);
                        }
                    },
                    getURL: (path) => path,
                    lastError: null
                },
                windows: {
                    getCurrent: () => Promise.resolve({ id: 1, type: "popup" }),
                    getAll: (opts) => Promise.resolve([{ id: 1, tabs: [] }]),
                    create: () => Promise.resolve({}),
                    onRemoved: { addListener: () => {} },
                    update: () => Promise.resolve()
                },
                tabs: {
                    query: () => Promise.resolve([]),
                    onUpdated: { addListener: () => {} },
                    onRemoved: { addListener: () => {} },
                    remove: () => Promise.resolve()
                },
                tabGroups: {
                    query: () => Promise.resolve([])
                }
            };
        """)

        page.on("console", lambda msg: print(f"Console: {msg.text}"))

        # Open the popup
        page.goto("http://localhost:8080/ui/popup.html")

        # Wait for some content to ensure no crash
        try:
            # We expect the search box to be present
            page.wait_for_selector("#tabSearch", timeout=5000)
            print("Search box found")

            # Take screenshot
            page.screenshot(path="verification/popup_verified.png")
            print("Screenshot taken")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/popup_error.png")

        browser.close()

if __name__ == "__main__":
    test_popup_renders()
