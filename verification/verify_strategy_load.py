from playwright.sync_api import sync_playwright, expect
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Inject mocks for chrome API
        page.add_init_script("""
            window.chrome = {
                runtime: {
                    sendMessage: async (msg) => {
                        console.log('Mock sendMessage:', msg);
                        if (msg.type === 'loadPreferences') {
                            return { ok: true, data: { customStrategies: [] } };
                        }
                        return { ok: true };
                    }
                },
                tabs: {
                    query: async () => [],
                    onUpdated: { addListener: () => {} },
                    onRemoved: { addListener: () => {} }
                },
                tabGroups: {
                    query: async () => []
                }
            };
        """)

        # Go to page served via localhost (assumed running on 8000)
        page.goto("http://localhost:8000/ui/devtools.html")

        # Click Strategy Manager tab
        page.locator(".tab-btn[data-target='view-strategies']").click()

        # Check dropdown
        select = page.locator("#strategy-load-select")
        expect(select).to_be_visible()

        # Check for Built-in options
        # We expect "Domain (Built-in)" to be present.
        # Option value should be 'domain'
        domain_option = select.locator("option[value='domain']")
        expect(domain_option).to_have_text("Domain (Built-in)")

        # Select it
        select.select_option("domain")

        # Verify Builder fields populated
        expect(page.locator("#strat-name")).to_have_value("domain")
        expect(page.locator("#strat-desc")).to_have_value("Domain")

        # Verify Grouping Rule: Source=Field, Value=domain
        # The first builder-row in group-rows-container
        group_row = page.locator("#group-rows-container .builder-row").first
        expect(group_row).to_be_visible()
        expect(group_row.locator(".source-select")).to_have_value("field")
        expect(group_row.locator(".value-input-field")).to_have_value("domain")

        print("Verified built-in strategy loading.")

        page.screenshot(path="verification/strategy_load_verified.png")

        browser.close()

if __name__ == "__main__":
    run()
