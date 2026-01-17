from playwright.sync_api import sync_playwright

def test_strategy_builder_layout():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Go to the local server
        page.goto("http://localhost:3000/ui/devtools.html")

        # Inject mock chrome API
        page.evaluate("""
            window.chrome = {
                tabs: {
                    query: (query, callback) => {
                        if (callback) callback([]);
                        return Promise.resolve([]);
                    },
                    onUpdated: { addListener: () => {} },
                    onRemoved: { addListener: () => {} }
                },
                runtime: {
                    sendMessage: (msg, callback) => {
                        console.log('Mock sendMessage:', msg);
                        const response = { ok: true, data: { customStrategies: [], customGenera: {} } };
                        if (callback) callback(response);
                        return Promise.resolve(response);
                    }
                }
            };
        """)

        # Manually reload script because it might have failed initially due to missing chrome
        # Actually, simpler to just wait for page load and then click tabs.
        # But devtools.js is a module type...

        # Click on Strategy Manager tab to make it visible
        page.click("button[data-target='view-strategies']")

        # Wait for button to be visible
        page.wait_for_selector("#add-filter-btn", state="visible")

        # Add a filter row to see how it looks
        page.click("#add-filter-btn")

        # Add a group row
        page.click("#add-group-btn")

        # Add a sort row
        page.click("#add-sort-btn")

        # Take a screenshot of the Strategy Builder area
        page.screenshot(path="verification/strategy_builder_layout.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    test_strategy_builder_layout()
