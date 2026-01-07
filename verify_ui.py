from playwright.sync_api import sync_playwright

def verify_strategy_manager():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Create context with storage permissions if needed (though we mock chrome.runtime)
        context = browser.new_context()
        page = context.new_page()

        # Inject mock chrome object
        page.add_init_script("""
            window.chrome = {
                runtime: {
                    sendMessage: async (msg) => {
                        console.log('Message sent:', msg);
                        if (msg.type === 'loadPreferences') {
                            return {
                                ok: true,
                                data: {
                                    sorting: ['domain'],
                                    customStrategies: [
                                        {
                                            id: 'existing_strat',
                                            label: 'Existing Custom Strategy',
                                            type: 'grouping',
                                            rules: [{field: 'url', operator: 'contains', value: 'foo', result: 'FooGroup'}]
                                        }
                                    ]
                                }
                            };
                        }
                        if (msg.type === 'savePreferences') {
                            return { ok: true, data: {} };
                        }
                        if (msg.type === 'applyGrouping') {
                            return { ok: true };
                        }
                        return { ok: false };
                    },
                    onMessage: { addListener: () => {} }
                },
                tabs: {
                    query: async () => [
                        { id: 1, windowId: 1, url: "https://example.com", title: "Example", index: 0, active: true },
                        { id: 2, windowId: 1, url: "https://google.com", title: "Google", index: 1 }
                    ],
                    onUpdated: { addListener: () => {} },
                    onRemoved: { addListener: () => {} }
                },
                windows: {
                    update: async () => {}
                }
            };
        """)

        # Navigate to devtools page
        # Note: We need to serve the root directory to access modules properly
        page.goto("http://localhost:8000/ui/devtools.html")

        # Wait for page load
        page.wait_for_selector("button[data-target='view-algorithms']")

        # Click Algorithms tab
        page.click("button[data-target='view-algorithms']")

        # Check if Strategy Manager is visible
        page.wait_for_selector("#custom-strategies-container")

        # Check if existing strategy is rendered
        page.wait_for_selector("#custom-strategies-list .edit-strat-btn")

        # Take screenshot of the UI with existing strategy
        page.screenshot(path="verification_ui_initial.png")

        # Fill form to add new strategy
        page.fill("#new-strat-id", "new_strat")
        page.fill("#new-strat-label", "New Strategy")

        # Add a rule
        page.click("#add-rule-btn")
        # Since rule row is added dynamically, wait for it
        page.wait_for_selector(".rule-row")

        # Fill rule (default is URL contains)
        page.fill(".rule-value", "test")
        page.fill(".rule-result", "Test Group")

        # Take screenshot of filled form
        page.screenshot(path="verification_ui_filled.png")

        browser.close()

if __name__ == "__main__":
    verify_strategy_manager()
