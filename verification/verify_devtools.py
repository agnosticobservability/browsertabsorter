from playwright.sync_api import sync_playwright

def verify_devtools_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a persistent context to allow local storage if needed, but not strictly necessary for this static check
        context = browser.new_context()
        page = context.new_page()

        # Navigate to the DevTools UI served by the python server
        # Since it uses ES modules, it needs to be served via HTTP
        page.goto("http://localhost:8080/ui/devtools.html")

        # Mock the chrome API since we are running in a browser, not an extension
        page.evaluate("""
            window.chrome = {
                tabs: {
                    query: () => Promise.resolve([
                        { id: 1, title: "Google", url: "https://google.com", windowId: 1, index: 0, active: true },
                        { id: 2, title: "GitHub", url: "https://github.com", windowId: 1, index: 1 },
                        { id: 3, title: "YouTube", url: "https://youtube.com", windowId: 1, index: 2 }
                    ]),
                    onUpdated: { addListener: () => {} },
                    onRemoved: { addListener: () => {} }
                },
                runtime: {
                    sendMessage: (msg) => {
                        console.log("Message sent:", msg);
                        return Promise.resolve({ ok: true, data: { customGenera: {} } });
                    }
                },
                windows: {
                    update: () => {}
                }
            };
        """)

        # Click the "Algorithms & Simulation" tab
        page.click("button[data-target='view-algorithms']")

        # Wait for the strategies to render
        page.wait_for_selector("#sim-grouping-list .strategy-row")

        # Take a screenshot of the Algorithms view
        page.screenshot(path="devtools_strategy_verification.png", full_page=True)

        print("Screenshot saved to devtools_strategy_verification.png")
        browser.close()

if __name__ == "__main__":
    verify_devtools_ui()
