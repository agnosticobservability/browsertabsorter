import os
from playwright.sync_api import sync_playwright

def verify_devtools_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Mock chrome API
        page.add_init_script("""
            window.chrome = {
                runtime: {
                    sendMessage: (msg) => {
                        console.log('Message sent:', msg);
                        if (msg.type === 'loadPreferences') {
                            return Promise.resolve({ ok: true, data: { customStrategies: [] } });
                        }
                        return Promise.resolve({ ok: true });
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
                    onRemoved: { addListener: () => {} }
                }
            };
        """)

        # Go to the local server
        page.goto("http://localhost:8000/ui/devtools.html")

        # Click on Strategy Manager tab to reveal the builder
        page.click("button[data-target='view-strategies']")

        # Wait for the builder to be visible
        # Sometimes class toggle might be async or transition, but usually instant.
        # Check if the section itself is visible regardless of active class for a moment
        page.wait_for_selector("#view-strategies")

        # Take a screenshot of the Strategy Builder Header where the buttons are
        # We focus on the element containing the buttons
        # The id 'builder-run-btn' is inside the header div of the builder card
        page.screenshot(path="verification_ui_buttons.png")

        # Verify button text
        run_btn_text = page.locator("#builder-run-btn").inner_text()
        print(f"Run button text: {run_btn_text}")

        # Verify Run Live button existence
        run_live_btn = page.locator("#builder-run-live-btn")
        if run_live_btn.is_visible():
            print("Run Live button is visible")
            print(f"Run Live button text: {run_live_btn.inner_text()}")
        else:
            print("Run Live button is NOT visible")

        browser.close()

if __name__ == "__main__":
    verify_devtools_ui()
