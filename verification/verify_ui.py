from playwright.sync_api import sync_playwright

def verify_popup_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Create a context with viewport similar to the popup dimensions
        context = browser.new_context(viewport={"width": 500, "height": 600})
        page = context.new_page()

        # Navigate to the popup HTML
        page.goto("http://localhost:8000/ui/popup.html")

        # Inject mock window.chrome for the popup to function enough to render
        page.add_init_script("""
            window.chrome = {
                runtime: {
                    sendMessage: (msg, cb) => {
                        console.log("Message sent:", msg);
                        if (msg.type === "getState") {
                            cb({ ok: true, data: { groups: [], preferences: {} } });
                        } else {
                            cb({ ok: true });
                        }
                    },
                    getURL: (path) => path
                },
                windows: {
                    getCurrent: () => Promise.resolve({ id: 1, type: "popup" }),
                    getAll: () => Promise.resolve([]),
                    update: () => Promise.resolve(),
                    create: () => Promise.resolve(),
                    onRemoved: { addListener: () => {} }
                },
                tabs: {
                    onUpdated: { addListener: () => {} },
                    onRemoved: { addListener: () => {} },
                    ungroup: () => Promise.resolve(),
                    remove: () => Promise.resolve(),
                    update: () => Promise.resolve()
                }
            };
        """)

        # Wait for the UI to settle (though with empty state it should be fast)
        page.wait_for_timeout(500)

        # Take a screenshot of the whole page
        page.screenshot(path="verification/popup_ui.png")
        print("Screenshot saved to verification/popup_ui.png")

        browser.close()

if __name__ == "__main__":
    verify_popup_ui()
