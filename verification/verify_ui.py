from playwright.sync_api import sync_playwright

def verify_devtools_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Inject mock chrome API
        page.add_init_script("""
            window.chrome = {
                runtime: {
                    sendMessage: (msg) => {
                        console.log("Mock sendMessage:", msg);
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

        page.goto("http://localhost:8000/ui/devtools.html")
        page.wait_for_selector("body")

        # Switch to Strategy Manager tab
        strategy_tab_btn = page.locator(".tab-btn[data-target='view-strategies']")
        strategy_tab_btn.click()
        print("Clicked Strategy Manager tab")

        # Wait for the view to become active
        page.wait_for_selector("#view-strategies.active")

        # Click "Add Group" to create a new row
        add_btn = page.locator("#add-group-btn")
        if add_btn.is_visible():
            add_btn.click()
            print("Clicked Add Group")
        else:
            print("Add Group button not visible")

        # Wait for the row to appear
        try:
            page.wait_for_selector(".builder-row", timeout=5000)
            print("Builder row appeared.")
        except:
            print("Builder row did not appear.")

        # Check for Transform UI
        transform_select = page.locator(".transform-select")
        # Since I just added a row, it should be the last one or only one.
        # We need to make sure the row type is 'group'. The ID is #group-rows-container
        # Check inside that container
        group_rows = page.locator("#group-rows-container .builder-row")

        if group_rows.count() > 0:
            row = group_rows.first
            select = row.locator(".transform-select")
            if select.is_visible():
                 print("Transform select found.")
                 options = select.locator("option").all_inner_texts()
                 print("Options found:", options)
                 expected = ["None", "Strip TLD", "Get Domain", "Get Hostname", "Lowercase", "Uppercase", "First Char"]
                 missing = [e for e in expected if e not in options]
                 if not missing:
                     print("All expected options present.")
                 else:
                     print("Missing options:", missing)
            else:
                print("Transform select NOT found in row.")
        else:
            print("No group rows found.")

        # Take screenshot
        page.screenshot(path="verification/devtools_strategy_verification.png")
        print("Screenshot saved to verification/devtools_strategy_verification.png")

        browser.close()

if __name__ == "__main__":
    verify_devtools_ui()
