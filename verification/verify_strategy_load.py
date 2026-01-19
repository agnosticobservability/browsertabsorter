from playwright.sync_api import sync_playwright

def verify_strategy_loading():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Inject mock chrome API
        page.add_init_script("""
            window.chrome = {
                runtime: {
                    sendMessage: (msg) => {
                        console.log("Mock sendMessage:", msg);
                        if (msg.type === 'loadPreferences') {
                            return Promise.resolve({
                                ok: true,
                                data: { customStrategies: [] }
                            });
                        }
                        return Promise.resolve({ ok: true, data: {} });
                    },
                    onMessage: { addListener: () => {} }
                },
                tabs: {
                    query: () => Promise.resolve([]),
                    onUpdated: { addListener: () => {} },
                    onRemoved: { addListener: () => {} }
                },
                tabGroups: {
                    query: () => Promise.resolve([]),
                    update: () => Promise.resolve()
                },
                windows: {
                    update: () => Promise.resolve()
                }
            };
        """)

        # Start server if not running (assumed running on port 8000 based on context)
        # Using the correct URL (ui/devtools.html, not src/ui/devtools.html)
        page.goto("http://localhost:8000/ui/devtools.html")
        page.wait_for_selector("body")

        # Switch to Strategy Manager tab
        strategy_tab_btn = page.locator(".tab-btn[data-target='view-strategies']")
        strategy_tab_btn.click()
        page.wait_for_selector("#view-strategies.active")

        # Verify dropdown exists
        dropdown = page.locator("#strategy-load-select")
        if not dropdown.is_visible():
            print("Dropdown not visible")
            return

        # Select "Domain" strategy (built-in)
        dropdown.select_option("domain")
        print("Selected 'domain' strategy")

        # Wait a moment for UI to populate
        page.wait_for_timeout(500)

        # Verify that builder rows appeared
        # Domain strategy should populate one grouping row with source="field" and value="domain"
        # and one sorting row with field="domain"

        group_rows = page.locator("#group-rows-container .builder-row")
        count = group_rows.count()
        print(f"Group rows found: {count}")

        if count > 0:
            row = group_rows.first
            source = row.locator(".source-select").input_value()
            value_field = row.locator(".value-input-field").input_value()
            print(f"Row 1: Source={source}, Value={value_field}")

            if source == "field" and value_field == "domain":
                print("SUCCESS: Domain strategy loaded correctly into Group Builder.")
            else:
                print("FAILURE: Domain strategy did not load correct values.")
        else:
             print("FAILURE: No group rows generated for 'domain' strategy.")

        # Take screenshot
        page.screenshot(path="verification/verify_strategy_load.png")
        print("Screenshot saved to verification/verify_strategy_load.png")

        browser.close()

if __name__ == "__main__":
    verify_strategy_loading()
