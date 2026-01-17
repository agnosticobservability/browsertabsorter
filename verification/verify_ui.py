from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the HTML file directly
        file_path = os.path.abspath("ui/devtools.html")
        page.goto(f"file://{file_path}")

        # Click the "Strategy Manager" tab to switch view
        page.locator(".tab-btn[data-target=\"view-strategies\"]").click()

        # Wait for the view to be active
        page.locator("#view-strategies").wait_for(state="visible")

        # Check if the IDs strat-name and strat-desc exist and are visible
        # We can also fill them to ensure they are interactive
        page.locator("#strat-name").fill("test_strategy")
        page.locator("#strat-desc").fill("Test Description")

        # Verify that run and save buttons are present
        expect_run = page.locator("#builder-run-btn")
        expect_save = page.locator("#builder-save-btn")

        if not expect_run.is_visible():
            print("Run button not visible")
        if not expect_save.is_visible():
            print("Save button not visible")

        # Take a screenshot
        page.screenshot(path="verification/devtools_verification.png")
        print("Screenshot saved to verification/devtools_verification.png")

        browser.close()

if __name__ == "__main__":
    run()
