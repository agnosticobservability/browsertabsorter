from playwright.sync_api import sync_playwright
import os

def verify_dropdown():
    # Use a relative path for verification output
    verification_dir = os.path.join(os.getcwd(), "verification")
    os.makedirs(verification_dir, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Create context to allow setting viewport size
        context = browser.new_context(viewport={'width': 1200, 'height': 800})

        # Inject mock
        init_script = """
        window.chrome = {
            runtime: {
                sendMessage: async (msg) => {
                    console.log('Message sent:', msg);
                    if (msg.type === 'loadPreferences') {
                        return { ok: true, data: { customStrategies: [] } };
                    }
                    if (msg.type === 'savePreferences') {
                        return { ok: true };
                    }
                    return { ok: false };
                },
                onMessage: { addListener: () => {} }
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener: () => {} },
                onRemoved: { addListener: () => {} }
            },
            tabGroups: {
                query: async () => [],
                update: async () => {}
            },
            windows: {
                update: async () => {}
            },
            storage: {
                local: {
                    get: async () => ({}),
                    set: async () => {}
                }
            }
        };
        """
        context.add_init_script(init_script)
        page = context.new_page()

        try:
            page.goto("http://localhost:8000/ui/devtools.html")

            # Wait for "Strategy Builder" tab (the third tab button)
            page.wait_for_selector('button[data-target="view-strategies"]')
            page.click('button[data-target="view-strategies"]')

            # Click "Add Group" to add a new row
            page.click('#add-group-btn')

            # Wait for the dropdown to appear
            page.wait_for_selector('.value-input-field')

            # Find the dropdown inside the new row
            dropdown = page.locator('.value-input-field').first

            # Verify options
            options_html = dropdown.inner_html()
            print("Dropdown HTML content:")
            print(options_html[:500] + "...") # Print first 500 chars

            if "<optgroup" in options_html:
                print("FAILURE: <optgroup> tag found in dropdown!")
            else:
                print("SUCCESS: No <optgroup> tag found.")

            screenshot_path = os.path.join(verification_dir, "dropdown_verification.png")
            page.screenshot(path=screenshot_path)
            print(f"Screenshot saved to: {screenshot_path}")

        except Exception as e:
            print(f"Error: {e}")
            error_path = os.path.join(verification_dir, "error_screenshot.png")
            page.screenshot(path=error_path)
        finally:
            browser.close()

if __name__ == "__main__":
    verify_dropdown()
