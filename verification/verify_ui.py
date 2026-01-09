from playwright.sync_api import sync_playwright

def verify_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # We need to serve the files, but this is a static extension UI.
        # We can try loading the file directly if the script logic supports it (it imports from ../dist which needs to exist)
        # Since I ran build, dist/ should exist.

        # However, it imports chrome API mocks usually.
        # I need a way to mock chrome.runtime and chrome.tabs in the page context.
        # The existing `tests/` likely use node, not browser.
        # Memory says "UI verification uses Python/Playwright with a local HTTP server".

        # I will start a simple server to serve the root directory.
        import http.server
        import socketserver
        import threading
        import time

        PORT = 8000
        Handler = http.server.SimpleHTTPRequestHandler

        # Serve from root
        httpd = socketserver.TCPServer(("", PORT), Handler)
        thread = threading.Thread(target=httpd.serve_forever)
        thread.daemon = True
        thread.start()

        time.sleep(1) # Wait for server

        page = browser.new_page()

        # Inject Mock Chrome API
        page.add_init_script("""
            window.chrome = {
                runtime: {
                    sendMessage: (msg) => {
                        console.log('Message:', msg);
                        if (msg.type === 'loadPreferences') return Promise.resolve({ ok: true, data: { customStrategies: [] } });
                        if (msg.type === 'savePreferences') return Promise.resolve({ ok: true });
                        return Promise.resolve({ ok: true });
                    },
                    onMessage: { addListener: () => {} }
                },
                tabs: {
                    query: () => Promise.resolve([
                        { id: 1, windowId: 1, title: 'Google', url: 'https://google.com', pinned: false, index: 0, active: false },
                        { id: 2, windowId: 1, title: 'Facebook', url: 'https://facebook.com', pinned: false, index: 1, active: true }
                    ]),
                    onUpdated: { addListener: () => {} },
                    onRemoved: { addListener: () => {} }
                },
                windows: {
                    update: () => Promise.resolve()
                }
            };
        """)

        try:
            page.goto(f"http://localhost:{PORT}/ui/devtools.html")

            # Navigate to Strategy Manager tab
            page.click("button[data-target='view-strategies']")

            # Check if Strategy Builder elements exist
            page.wait_for_selector("#builder-save-btn")
            page.wait_for_selector(".builder-section")

            # Take screenshot
            page.screenshot(path="verification/devtools_strategy_verification.png")
            print("Screenshot taken.")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()
            httpd.shutdown()

if __name__ == "__main__":
    verify_ui()
