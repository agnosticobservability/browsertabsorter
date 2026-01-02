from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Mock chrome API
    page.add_init_script("""
        window.chrome = {
            runtime: {
                sendMessage: (msg, cb) => {
                    if (cb) cb({ok: true, data: {}});
                }
            },
            tabs: {
                query: (query) => Promise.resolve([
                    {
                        id: 1,
                        index: 0,
                        windowId: 100,
                        groupId: -1,
                        title: "Test Tab 1",
                        url: "https://example.com",
                        status: "complete",
                        active: false,
                        pinned: false,
                        openerTabId: undefined,
                        lastAccessed: Date.now()
                    },
                     {
                        id: 2,
                        index: 1,
                        windowId: 100,
                        groupId: -1,
                        title: "Test Tab 2",
                        url: "https://google.com",
                        status: "complete",
                        active: true,
                        pinned: false,
                        openerTabId: undefined,
                        lastAccessed: Date.now()
                    }
                ]),
                onUpdated: {
                    addListener: () => {}
                },
                update: (tabId, updateInfo) => {
                    console.log(`chrome.tabs.update called for tab ${tabId}`, updateInfo);
                }
            },
            windows: {
                 update: (windowId, updateInfo) => {
                    console.log(`chrome.windows.update called for window ${windowId}`, updateInfo);
                }
            }
        };
    """)

    page.goto("http://localhost:8000/ui/devtools.html")

    # Wait for the table to populate
    page.wait_for_selector("#tabsTable tbody tr")

    # Check for the header
    actions_header = page.locator("th", has_text="Actions")
    if actions_header.count() > 0:
        print("Actions header found")
    else:
        print("Actions header NOT found")

    # Check for the button
    buttons = page.locator(".goto-tab-btn")
    count = buttons.count()
    print(f"Found {count} 'Go to Tab' buttons")

    # Take screenshot
    page.screenshot(path="devtools_verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
