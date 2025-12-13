from playwright.sync_api import sync_playwright, expect
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Mock chrome API
        page.add_init_script("""
            window.chrome = {
                runtime: {
                    sendMessage: (msg) => {
                        console.log('chrome.runtime.sendMessage', msg);
                        if (msg.type === 'getState') {
                            return Promise.resolve({
                                ok: true,
                                data: {
                                    groups: [
                                        {
                                            label: 'Work',
                                            color: 'blue',
                                            reason: 'Work related',
                                            tabs: [
                                                {
                                                    id: 101,
                                                    windowId: 1,
                                                    url: 'https://work.com',
                                                    title: 'Work Dashboard',
                                                    pinned: false,
                                                    active: false,
                                                    favIconUrl: ''
                                                }
                                            ]
                                        }
                                    ],
                                    preferences: {
                                        sorting: ['pinned', 'recency']
                                    }
                                }
                            });
                        }
                        return Promise.resolve({});
                    }
                },
                windows: {
                    getCurrent: () => Promise.resolve({ id: 1 }),
                    getAll: (opts) => Promise.resolve([
                        { id: 1, tabs: [{ id: 101, title: 'Work Dashboard', active: false }] }
                    ]),
                    update: (windowId, updateInfo) => {
                        console.log('chrome.windows.update called', windowId, updateInfo);
                        window._lastWindowUpdate = { windowId, updateInfo };
                        return Promise.resolve({});
                    }
                },
                tabs: {
                    update: (tabId, updateInfo) => {
                        console.log('chrome.tabs.update called', tabId, updateInfo);
                        window._lastTabUpdate = { tabId, updateInfo };
                        return Promise.resolve({});
                    },
                    onUpdated: { addListener: () => {} },
                    onRemoved: { addListener: () => {} }
                }
            };
            // Also mock windows.onRemoved as it is used in popup.js
            window.chrome.windows.onRemoved = { addListener: () => {} };
        """)

        # Navigate to the popup
        # Since I'm serving from root at port 8000
        page.goto("http://localhost:8000/ui/popup.html")

        # Wait for the group item to be rendered
        # The code creates <div class="group-tab-item">
        item_locator = page.locator(".group-tab-item").first
        expect(item_locator).to_be_visible()

        # Take a screenshot before click
        if not os.path.exists("verification"):
            os.makedirs("verification")
        page.screenshot(path="verification/before_click.png")

        # Click the item
        item_locator.click()

        # Verify if chrome.tabs.update and chrome.windows.update were called
        # We can check the window object properties we set in the mock
        last_tab_update = page.evaluate("window._lastTabUpdate")
        last_window_update = page.evaluate("window._lastWindowUpdate")

        print(f"Last Tab Update: {last_tab_update}")
        print(f"Last Window Update: {last_window_update}")

        if last_tab_update and last_tab_update['tabId'] == 101 and last_tab_update['updateInfo']['active']:
            print("SUCCESS: Tab activation called correctly.")
        else:
            print("FAILURE: Tab activation NOT called.")

        if last_window_update and last_window_update['windowId'] == 1 and last_window_update['updateInfo']['focused']:
             print("SUCCESS: Window focus called correctly.")
        else:
             print("FAILURE: Window focus NOT called.")

        browser.close()

if __name__ == "__main__":
    run()
