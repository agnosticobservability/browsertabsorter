from playwright.sync_api import sync_playwright

def verify_popup_buttons():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the popup HTML
        page.goto("http://localhost:8080/ui/popup.html")

        # Wait for the action bar to be visible
        page.wait_for_selector(".action-bar")

        # Verify "Sort" button exists and has correct text
        sort_btn = page.locator("#btnSort")
        assert sort_btn.is_visible()
        assert sort_btn.inner_text() == "Sort"
        print("Verified 'Sort' button")

        # Verify "Group" button exists and has correct text
        group_btn = page.locator("#btnGroup")
        assert group_btn.is_visible()
        assert group_btn.inner_text() == "Group"
        print("Verified 'Group' button")

        # Verify "Ungroup" button exists and has correct text
        ungroup_btn = page.locator("#btnUngroup")
        assert ungroup_btn.is_visible()
        assert ungroup_btn.inner_text() == "Ungroup"
        print("Verified 'Ungroup' button")

        # Take a screenshot
        page.screenshot(path="verification/popup_buttons.png")
        print("Screenshot saved to verification/popup_buttons.png")

        browser.close()

if __name__ == "__main__":
    verify_popup_buttons()
