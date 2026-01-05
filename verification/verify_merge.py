from playwright.sync_api import sync_playwright

def verify_merge_button():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a persistent context to allow local file access or use simple page
        page = browser.new_page()

        # Load the popup HTML
        # We need to serve the file or file:// access might fail with modules
        # But let's try file:// first. The popup uses ES modules which require http server usually.
        # But we can try.

        # Actually, the instructions say "run a local http server" for UI verification.
        # "UI verification is performed using Python/Playwright scripts... These tests require a local HTTP server"

        page.goto("http://localhost:8000/ui/popup.html")

        # Check if the "Merge" button is present in the action-bar
        merge_btn = page.get_by_role("button", name="Merge")

        if merge_btn.is_visible():
            print("Merge button is visible.")
        else:
            print("Merge button is NOT visible.")

        # Take a screenshot
        page.screenshot(path="verification/merge_button.png")

        browser.close()

if __name__ == "__main__":
    verify_merge_button()
