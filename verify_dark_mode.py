from playwright.sync_api import sync_playwright
import time
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Inject mock chrome API
        page.add_init_script("""
            window.chrome = {
                tabs: {
                    query: (query, callback) => callback([]),
                    onCreated: { addListener: () => {} },
                    onUpdated: { addListener: () => {} },
                    onRemoved: { addListener: () => {} },
                    onActivated: { addListener: () => {} },
                    group: () => {},
                    ungroup: () => {},
                    move: () => {},
                },
                runtime: {
                    onMessage: { addListener: () => {} },
                    sendMessage: () => {},
                    id: 'mock-extension-id'
                },
                storage: {
                    local: {
                        get: (keys, callback) => callback({}),
                        set: (items, callback) => { if(callback) callback(); }
                    },
                    sync: {
                        get: (keys, callback) => callback({}),
                        set: (items, callback) => { if(callback) callback(); }
                    }
                },
                windows: {
                    getAll: (opts, callback) => callback([]),
                    onCreated: { addListener: () => {} },
                    onRemoved: { addListener: () => {} },
                    onFocusChanged: { addListener: () => {} }
                },
                tabGroups: {
                    query: (query, callback) => callback([]),
                    onCreated: { addListener: () => {} },
                    onUpdated: { addListener: () => {} },
                    onRemoved: { addListener: () => {} }
                },
                scripting: {
                    executeScript: () => {}
                }
            };
        """)

        # Navigate to the page
        page.goto("http://localhost:8080/ui/devtools.html")

        # Wait for initialization (just in case)
        time.sleep(1)

        # 1. Take Screenshot of Light Mode (Default)
        os.makedirs("verification", exist_ok=True)
        page.screenshot(path="verification/light_mode.png", full_page=True)
        print("Captured light_mode.png")

        # 2. Click Toggle Button
        toggle_btn = page.locator("#themeToggleBtn")
        if toggle_btn.count() > 0:
            toggle_btn.click()
            # Wait for transition/update
            time.sleep(0.5)

            # 3. Take Screenshot of Dark Mode
            page.screenshot(path="verification/dark_mode.png", full_page=True)
            print("Captured dark_mode.png")

            # Verify class is present
            if "dark-mode" in page.eval_on_selector("body", "el => el.className"):
                print("SUCCESS: body has 'dark-mode' class")
            else:
                print("FAILURE: body missing 'dark-mode' class")

        else:
            print("FAILURE: Toggle button not found")

        browser.close()

if __name__ == "__main__":
    run()
