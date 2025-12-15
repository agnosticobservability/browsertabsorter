from playwright.sync_api import sync_playwright
import os

def verify_context_checkbox():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Inject chrome mock
        page.add_init_script("""
            window.chrome = {
                runtime: {
                    sendMessage: async () => ({ ok: true, data: { groups: [], preferences: { sorting: [] } } }),
                    onMessage: { addListener: () => {} },
                    onInstalled: { addListener: () => {} }
                },
                tabs: {
                    query: async () => [],
                    onUpdated: { addListener: () => {} },
                    onRemoved: { addListener: () => {} },
                    group: async () => {},
                    ungroup: async () => {},
                    move: async () => {},
                    remove: async () => {},
                    update: async () => {}
                },
                windows: {
                    getCurrent: async () => ({ id: 1 }),
                    getAll: async () => [],
                    onRemoved: { addListener: () => {} },
                    update: async () => {},
                    remove: async () => {}
                },
                tabGroups: {
                    update: async () => {},
                    onRemoved: { addListener: () => {} }
                }
            };
        """)

        cwd = os.getcwd()
        popup_path = f"file://{cwd}/ui/popup.html"

        try:
            page.goto(popup_path)
            # Wait for any potential js load
            page.wait_for_timeout(1000)

            # Check for context sort checkbox
            context_checkbox = page.locator("#sortContextFlyout")
            if context_checkbox.is_visible():
                print("Context checkbox visible")
                # Scroll to it if needed and screenshot
                context_checkbox.scroll_into_view_if_needed()
                page.screenshot(path="verification/popup_context.png")
            else:
                print("Context checkbox NOT visible")

        except Exception as e:
            print(f"Error: {e}")

        browser.close()

if __name__ == "__main__":
    verify_context_checkbox()
