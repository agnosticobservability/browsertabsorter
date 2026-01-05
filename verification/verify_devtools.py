from playwright.sync_api import sync_playwright

def verify_algorithms_view():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use existing context to mock Chrome extension environment
        context = browser.new_context()
        page = context.new_page()

        # Mock chrome.tabs and other extension APIs
        page.add_init_script("""
            window.chrome = {
                tabs: {
                    query: (queryInfo) => Promise.resolve([
                        {
                            id: 1, windowId: 1, index: 0, title: 'Google', url: 'https://google.com',
                            active: true, pinned: false, status: 'complete', openerTabId: undefined,
                            favIconUrl: 'https://google.com/favicon.ico', lastAccessed: Date.now()
                        },
                        {
                            id: 2, windowId: 1, index: 1, title: 'YouTube', url: 'https://youtube.com',
                            active: false, pinned: false, status: 'complete', openerTabId: undefined,
                            favIconUrl: 'https://youtube.com/favicon.ico', lastAccessed: Date.now() - 1000
                        },
                        {
                            id: 3, windowId: 1, index: 2, title: 'GitHub - Pull Requests', url: 'https://github.com/pulls',
                            active: false, pinned: false, status: 'complete', openerTabId: 1,
                            favIconUrl: 'https://github.com/favicon.ico', lastAccessed: Date.now() - 2000
                        },
                        {
                            id: 4, windowId: 1, index: 3, title: 'Work - Jira', url: 'https://jira.company.com',
                            active: false, pinned: false, status: 'complete', openerTabId: undefined,
                            favIconUrl: '', lastAccessed: Date.now() - 3000
                        }
                    ]),
                    onUpdated: { addListener: () => {} },
                    onRemoved: { addListener: () => {} }
                },
                windows: {
                    update: () => {}
                }
            };
        """)

        # Navigate to devtools page
        page.goto("http://localhost:8000/ui/devtools.html")

        # Click on 'Algorithms' tab
        page.click("button[data-target='view-algorithms']")

        # Verify the section is visible
        algorithms_section = page.locator("#view-algorithms")
        if not algorithms_section.is_visible():
            print("Algorithms section not visible")
            browser.close()
            exit(1)

        # Run Simulation
        page.click("#runSimBtn")

        # Take screenshot
        page.screenshot(path="verification/devtools_algorithms.png")
        print("Screenshot taken")

        browser.close()

if __name__ == "__main__":
    verify_algorithms_view()
