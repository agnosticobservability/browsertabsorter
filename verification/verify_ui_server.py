from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Access via localhost to support ES modules
        page.goto("http://localhost:8000/ui/devtools.html")

        # Click the "Strategy Manager" tab to switch view
        page.locator(".tab-btn[data-target=\"view-strategies\"]").click()

        # Wait for the view to be active
        page.locator("#view-strategies").wait_for(state="visible")

        # Check if the IDs strat-name and strat-desc exist and are visible
        page.locator("#strat-name").fill("test_strategy")
        page.locator("#strat-desc").fill("Test Description")

        # Take a screenshot focused on the builder
        page.screenshot(path="verification/devtools_strategy_verification.png")
        print("Screenshot saved to verification/devtools_strategy_verification.png")

        browser.close()

if __name__ == "__main__":
    run()
