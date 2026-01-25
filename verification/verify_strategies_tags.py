import os
import time
import subprocess
from playwright.sync_api import sync_playwright

def verify_strategies_tags():
    # Start server
    server_process = subprocess.Popen(["python3", "-m", "http.server", "8000"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1) # Wait for server

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            page = context.new_page()

            # Inject mock chrome object
            page.add_init_script("""
                window.chrome = {
                    runtime: {
                        sendMessage: (msg, callback) => {
                            // Mock response logic
                            let response = { ok: true };

                            if (msg.type === 'getState' || msg === 'getState') {
                                 response = {
                                    ok: true,
                                    data: {
                                        preferences: {
                                            sorting: ['custom_social', 'domain', 'custom_complex'],
                                            customStrategies: [
                                                {
                                                    id: 'custom_social',
                                                    label: 'Social Media',
                                                    filters: [],
                                                    groupingRules: [{source: 'field', value: 'url'}],
                                                    sortingRules: [],
                                                    autoRun: false
                                                },
                                                {
                                                    id: 'custom_complex',
                                                    label: 'Complex Strat',
                                                    filters: [],
                                                    groupingRules: [{source: 'field', value: 'url'}],
                                                    sortingRules: [{field: 'title', order: 'asc'}],
                                                    autoRun: true
                                                }
                                            ]
                                        },
                                        groups: []
                                    }
                                };
                            }

                            // Simulate async callback
                            setTimeout(() => {
                                if (callback) callback(response);
                            }, 10);
                        },
                        getURL: (path) => path,
                        onMessage: { addListener: () => {} },
                        lastError: null
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
                        getAll: async () => ([]),
                        update: async () => {},
                        onRemoved: { addListener: () => {} },
                        create: async () => {}
                    },
                    tabGroups: {
                        update: async () => {}
                    },
                    storage: {
                        local: {
                            get: async () => ({})
                        }
                    }
                };
            """)

            # Navigate to popup page
            page.goto("http://localhost:8000/ui/popup.html")

            # Wait for strategies list to render
            page.wait_for_selector("#all-strategies .strategy-row", timeout=5000)

            # Check for Custom Social - should have GROUP tag only
            social_row = page.locator(".strategy-row[data-id='custom_social']")
            if social_row.count() > 0:
                print("Found custom_social row")
                group_tag = social_row.locator(".tag-group")
                sort_tag = social_row.locator(".tag-sort")
                if group_tag.is_visible() and not sort_tag.is_visible():
                    print("PASS: Custom Social has GROUP tag and no SORT tag")
                else:
                    print(f"FAIL: Custom Social tags incorrect. Group visible: {group_tag.is_visible()}, Sort visible: {sort_tag.is_visible()}")

            # Check for Complex Strat - should have both
            complex_row = page.locator(".strategy-row[data-id='custom_complex']")
            if complex_row.count() > 0:
                print("Found custom_complex row")
                group_tag = complex_row.locator(".tag-group")
                sort_tag = complex_row.locator(".tag-sort")
                if group_tag.is_visible() and sort_tag.is_visible():
                    print("PASS: Custom Complex has both tags")
                else:
                    print(f"FAIL: Custom Complex tags incorrect. Group visible: {group_tag.is_visible()}, Sort visible: {sort_tag.is_visible()}")

            # Check for Domain (Built-in) - should have both
            domain_row = page.locator(".strategy-row[data-id='domain']")
            if domain_row.count() > 0:
                print("Found domain row")
                group_tag = domain_row.locator(".tag-group")
                sort_tag = domain_row.locator(".tag-sort")
                if group_tag.is_visible() and sort_tag.is_visible():
                    print("PASS: Domain has both tags")
                else:
                    print(f"FAIL: Domain tags incorrect. Group visible: {group_tag.is_visible()}, Sort visible: {sort_tag.is_visible()}")

            # Take screenshot
            os.makedirs("verification", exist_ok=True)
            screenshot_path = os.path.abspath("verification/strategies_tags.png")
            page.screenshot(path=screenshot_path)
            print(f"Screenshot saved to {screenshot_path}")

            browser.close()

    finally:
        server_process.kill()

if __name__ == "__main__":
    verify_strategies_tags()
