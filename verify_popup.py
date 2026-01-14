import os
from playwright.sync_api import sync_playwright

def verify_popup_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Inject mock chrome object
        page.add_init_script("""
            window.chrome = {
                runtime: {
                    sendMessage: async (msg) => {
                        console.log('Message sent:', msg);
                        if (msg === "getSavedStates") {
                            return { ok: true, data: [] };
                        }
                        if (msg.type === 'getState') {
                             return {
                                ok: true,
                                data: {
                                    preferences: {
                                        sorting: ['title', 'custom_demo'],
                                        customStrategies: [
                                            {
                                                id: 'custom_demo',
                                                label: 'Demo Custom Strategy',
                                                isGrouping: true,
                                                isSorting: true,
                                                filters: [],
                                                groupingRules: [],
                                                sortingRules: []
                                            }
                                        ]
                                    },
                                    groups: []
                                }
                            };
                        }
                        if (msg.type === 'loadPreferences') {
                            return {
                                ok: true,
                                data: {
                                    sorting: ['title', 'custom_demo'],
                                    customStrategies: [
                                        {
                                            id: 'custom_demo',
                                            label: 'Demo Custom Strategy',
                                            isGrouping: true,
                                            isSorting: true,
                                            filters: [],
                                            groupingRules: [],
                                            sortingRules: []
                                        }
                                    ]
                                }
                            };
                        }
                        return { ok: true };
                    },
                    getURL: (path) => path,
                    onMessage: { addListener: () => {} }
                },
                tabs: {
                    query: async () => [],
                    onUpdated: { addListener: () => {} },
                    onRemoved: { addListener: () => {} },
                    update: async () => {},
                    remove: async () => {},
                    ungroup: async () => {}
                },
                windows: {
                    getCurrent: async () => ({ id: 1, type: 'popup' }),
                    getAll: async () => ([
                        {
                            id: 1,
                            tabs: [
                                { id: 101, windowId: 1, title: "Tab 1", url: "https://example.com", active: true, groupLabel: "Group A", groupColor: "blue" },
                                { id: 102, windowId: 1, title: "Tab 2", url: "https://google.com", active: false }
                            ]
                        }
                    ]),
                    update: async () => {},
                    onRemoved: { addListener: () => {} },
                    create: async () => {}
                }
            };
        """)

        # Navigate to popup page
        page.goto("http://localhost:8000/ui/popup.html")

        # Wait for strategies list to render
        try:
            page.wait_for_selector(".strategy-label", timeout=5000)
            print("Found strategy labels")
        except:
            print("Strategy labels not found immediately")

        # Take screenshot
        page.screenshot(path="verification_popup_redesigned.png")
        print("Screenshot saved to verification_popup_redesigned.png")

        browser.close()

if __name__ == "__main__":
    verify_popup_ui()
