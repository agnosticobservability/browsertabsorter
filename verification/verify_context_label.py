from playwright.sync_api import sync_playwright
import os

def verify_context_label():
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

            # Check for context sort label "Context (AI)"
            context_label = page.get_by_text("Context (AI)")
            if context_label.is_visible():
                print("Context label visible")
                context_label.scroll_into_view_if_needed()
                page.screenshot(path="verification/popup_context_label.png")
            else:
                print("Context label NOT visible")

        except Exception as e:
            print(f"Error: {e}")

        browser.close()

if __name__ == "__main__":
    verify_context_label()
