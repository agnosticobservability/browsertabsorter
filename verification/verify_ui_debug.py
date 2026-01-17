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
        # We need to make sure the JS is loaded and handles the click,
        # but since we are loading file:// and it is a module, it might be blocked by CORS or strict MIME types if not served properly?
        # Actually module scripts need to be served.
        # Let us try to start a simple http server or just assume it loads if we relax some things.

        # Simulating the click might not work if JS didn't load.
        # Let's check if JS loaded.

        page.locator(".tab-btn[data-target=\"view-strategies\"]").click()

        # Force the section to be visible via CSS just in case JS failed, to verify layout.
        # But we want to verify JS functionality.
        # If JS failed, the classes won't toggle.

        # Let's try to wait a bit less or debug.
        try:
             page.locator("#view-strategies").wait_for(state="visible", timeout=2000)
        except:
             print("View strategy did not become visible, likely JS failed to load or run.")
             # Check console logs
             # We can't easily get console logs in sync mode directly without event listener but we can screenshot.

        # Take a screenshot
        page.screenshot(path="verification/devtools_verification.png")
        print("Screenshot saved to verification/devtools_verification.png")

        browser.close()

if __name__ == "__main__":
    run()
