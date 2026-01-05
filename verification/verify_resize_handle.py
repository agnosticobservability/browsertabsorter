from playwright.sync_api import sync_playwright

def verify_popup_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Inject mock window.chrome
        page.add_init_script("""
            window.chrome = {
                runtime: {
                    sendMessage: (msg, cb) => {
                        if (msg.type === 'getState') {
                            cb({
                                ok: true,
                                data: {
                                    groups: [],
                                    preferences: { sorting: ['pinned', 'recency'] }
                                }
                            });
                        } else if (msg.type === 'getSavedStates') {
                            cb({ ok: true, data: [] });
                        } else {
                            if(cb) cb({ ok: true });
                        }
                    },
                    getURL: (path) => path
                },
                tabs: {
                    query: (q, cb) => cb([]),
                    onUpdated: { addListener: () => {} },
                    onRemoved: { addListener: () => {} }
                },
                windows: {
                    getCurrent: async () => ({ id: 1, type: 'normal' }),
                    getAll: async (opts) => ([{ id: 1, tabs: [] }]),
                    onRemoved: { addListener: () => {} },
                    create: async () => {}
                },
                action: {
                    setPopup: () => {}
                },
                storage: {
                    local: {
                        get: (k, cb) => cb({}),
                        set: (d, cb) => cb && cb()
                    }
                }
            };
        """)

        # Navigate to default popup
        page.goto("http://localhost:8080/ui/popup.html")
        page.wait_for_load_state("networkidle")

        # Check if resize handle exists (it should NOT)
        handle_exists = page.locator("#resizeHandle").count() > 0
        print(f"Default Popup Resize Handle Exists: {handle_exists}")

        page.screenshot(path="verification/popup_default.png")

        # Navigate to redesigned popup
        page.goto("http://localhost:8080/ui/popup_redesigned.html")
        page.wait_for_load_state("networkidle")

        # Check if resize handle exists (it should NOT)
        handle_redesigned_exists = page.locator("#resizeHandle").count() > 0
        print(f"Redesigned Popup Resize Handle Exists: {handle_redesigned_exists}")

        page.screenshot(path="verification/popup_redesigned.png")

        browser.close()

if __name__ == "__main__":
    verify_popup_ui()
