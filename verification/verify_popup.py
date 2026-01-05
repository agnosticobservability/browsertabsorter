
from playwright.sync_api import sync_playwright

def verify_popup_resize_handle():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Create a mock extension environment
        context = browser.new_context()
        page = context.new_page()

        # We need to serve the local files. Since we cannot easily spin up a full server in this snippet without blocking,
        # we assume we can access files via file protocol or similar if configured,
        # but Playwright handles file:// if we give absolute paths.
        import os
        cwd = os.getcwd()
        popup_path = f"file://{cwd}/ui/popup.html"

        # Inject mock chrome object
        page.add_init_script("""
            window.chrome = {
                runtime: {
                    getURL: (path) => path
                },
                tabs: {
                    onUpdated: { addListener: () => {} },
                    onRemoved: { addListener: () => {} },
                    query: (q, cb) => cb([]),
                },
                windows: {
                    getCurrent: () => Promise.resolve({ type: "normal", id: 1 }),
                    getAll: () => Promise.resolve([]),
                    onRemoved: { addListener: () => {} }
                },
                storage: {
                    local: {
                        get: (keys, cb) => cb({}),
                        set: () => {}
                    }
                }
            };
        """)

        print(f"Navigating to {popup_path}")
        page.goto(popup_path)

        # Allow scripts to run
        page.wait_for_timeout(1000)

        # Check for resize handle visibility
        handle = page.locator("#resizeHandle")

        # In "normal" (docked) mode (simulated above), handle should be hidden
        # The script sets display: none

        visible = handle.is_visible()
        display = handle.evaluate("el => getComputedStyle(el).display")

        print(f"Docked Mode - Handle Visible: {visible}, Display: {display}")

        page.screenshot(path="verification/docked_mode.png")

        # Now simulate Pinned mode
        # We reload page with new mock
        page.add_init_script("""
            window.chrome.windows.getCurrent = () => Promise.resolve({ type: "popup", id: 2 });
        """)
        page.reload()
        page.wait_for_timeout(1000)

        handle_pinned = page.locator("#resizeHandle")
        visible_pinned = handle_pinned.is_visible()
        display_pinned = handle_pinned.evaluate("el => getComputedStyle(el).display")

        print(f"Pinned Mode - Handle Visible: {visible_pinned}, Display: {display_pinned}")

        page.screenshot(path="verification/pinned_mode.png")

        browser.close()

if __name__ == "__main__":
    verify_popup_resize_handle()

