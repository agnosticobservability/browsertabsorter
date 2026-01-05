from playwright.sync_api import sync_playwright, expect

def test_popup_preferences_removed(page):
    # Navigate to the popup page served locally
    page.goto("http://localhost:8000/ui/popup.html")

    # Check that the preferences link is NOT visible
    # The link had text "Preferences" or "Settings" depending on the file
    # and href="options.html"

    # Assert that there is no link with href="options.html"
    count = page.locator("a[href='options.html']").count()
    assert count == 0, f"Found {count} links to options.html"

    # Also check visual appearance
    page.screenshot(path="verification_popup.png")
    print("Screenshot saved to verification_popup.png")

def test_popup_redesigned_preferences_removed(page):
    # Navigate to the redesigned popup page served locally
    page.goto("http://localhost:8000/ui/popup_redesigned.html")

    # Assert that there is no link with href="options.html"
    count = page.locator("a[href='options.html']").count()
    assert count == 0, f"Found {count} links to options.html"

    page.screenshot(path="verification_popup_redesigned.png")
    print("Screenshot saved to verification_popup_redesigned.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Inject a mock chrome object to prevent immediate JS crashes if possible,
        # though for this specific test (checking static HTML/links) it might not be strictly necessary
        # if the links are in the static HTML part.
        page.add_init_script("""
            window.chrome = {
                runtime: {
                    sendMessage: () => {},
                    onMessage: { addListener: () => {} }
                },
                tabs: {
                    query: () => {}
                },
                storage: {
                    local: {
                        get: (keys, cb) => cb({}),
                        set: () => {}
                    }
                }
            };
        """)

        try:
            print("Testing popup.html...")
            test_popup_preferences_removed(page)

            print("Testing popup_redesigned.html...")
            test_popup_redesigned_preferences_removed(page)

            print("Verification successful.")
        except Exception as e:
            print(f"Verification failed: {e}")
        finally:
            browser.close()
