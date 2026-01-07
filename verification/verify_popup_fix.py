from playwright.sync_api import sync_playwright
import os

def verify_popup_fix():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Inject mock chrome object
        page.add_init_script("""
            window.chrome = {
                runtime: {
                    getURL: (path) => path,
                    sendMessage: (msg, callback) => {
                        console.log('Message sent:', msg);
                        const response = (() => {
                            if (msg.type === 'getState') {
                                return {
                                    ok: true,
                                    data: {
                                        preferences: { sorting: ['domain'] },
                                        groups: [
                                            {
                                                id: 'group1',
                                                windowId: 1,
                                                label: 'Example Group',
                                                color: 'blue',
                                                reason: 'Domain',
                                                tabs: [
                                                    { id: 1, windowId: 1, title: 'Example', url: 'https://example.com', favIconUrl: '', pinned: false, groupId: 1 }
                                                ]
                                            }
                                        ]
                                    }
                                };
                            }
                            if (msg.type === 'savePreferences') {
                                return { ok: true, data: {} };
                            }
                            return { ok: true };
                        })();

                        if (callback) callback(response);
                        return response;
                    },
                    onMessage: { addListener: () => {} }
                },
                tabs: {
                    query: async () => [],
                    onUpdated: { addListener: () => {} },
                    onRemoved: { addListener: () => {} },
                    remove: async () => {},
                    update: async () => {},
                    ungroup: async () => {}
                },
                windows: {
                    getCurrent: async () => ({ id: 1, type: 'popup' }),
                    getAll: async () => ([{ id: 1, tabs: [{ id: 1, windowId: 1, title: 'Example', url: 'https://example.com' }] }]),
                    update: async () => {},
                    create: async () => {},
                    onRemoved: { addListener: () => {} }
                },
                tabGroups: {
                    onRemoved: { addListener: () => {} }
                }
            };
        """)

        # Start a simple HTTP server to serve the files
        # We need to serve from repo root to resolve /dist/ imports
        # Playwright can navigate to file:// but module imports might fail due to CORS/security
        # So we assume a server is running or we rely on the file protocol handling of Playwright if lenient.
        # But `verify_ui.py` used `http://localhost:8000`. I should check if I can start a server.
        # The environment instructions say I can run long running processes.

        # Navigate to the popup
        # Assuming server is running at port 8000 from root
        page.goto("http://localhost:8000/ui/popup.html")

        # Wait for "Strategies" to verify JS loaded and rendered
        # If JS crashed, strategies list would be empty or static HTML only.
        # The strategies are rendered via `loadState` -> `renderStrategyList`
        # We check for a strategy item
        try:
            page.wait_for_selector(".strategy-row", timeout=5000)
            print("Strategies loaded.")
        except:
            print("Strategies NOT loaded (timeout). JS might have crashed.")

        # Check for Apply button
        if page.is_visible("#btnApply"):
            print("Apply button is visible.")
        else:
            print("Apply button is MISSING.")

        # Check for Expand/Collapse buttons
        if page.is_visible("#btnExpandAll"):
            print("Expand All button is visible.")

        # Check tab tree
        try:
            page.wait_for_selector(".tree-node", timeout=5000)
            print("Tab tree rendered.")
        except:
             print("Tab tree NOT rendered.")

        page.screenshot(path="verification/popup_fix_verification.png")

        browser.close()

if __name__ == "__main__":
    verify_popup_fix()
