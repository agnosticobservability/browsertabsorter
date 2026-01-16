import threading
import http.server
import socketserver
import os
from playwright.sync_api import sync_playwright

PORT = 8000

def run_server():
    os.chdir('/app') # Serve from root
    Handler = http.server.SimpleHTTPRequestHandler
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving at port {PORT}")
        httpd.serve_forever()

def verify_ui():
    # Start server in thread
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()

        # Inject mock chrome object
        init_script = """
        window.chrome = {
            runtime: {
                sendMessage: async (msg) => {
                    console.log('Message sent:', msg);
                    if (msg.type === 'loadPreferences') {
                        return { ok: true, data: { customStrategies: [] } };
                    }
                    if (msg.type === 'savePreferences') {
                        return { ok: true };
                    }
                    return { ok: false };
                },
                onMessage: { addListener: () => {} }
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener: () => {} },
                onRemoved: { addListener: () => {} }
            },
            storage: {
                local: {
                    get: async () => ({}),
                    set: async () => {}
                }
            }
        };
        """
        context.add_init_script(init_script)
        page = context.new_page()

        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))

        # Access via localhost
        url = f"http://localhost:{PORT}/ui/devtools.html"
        print(f"Loading: {url}")
        page.goto(url)

        page.wait_for_selector('h1:has-text("Tab Sorter Developer Tools")')

        # Click and wait for the section to become active
        page.click('button[data-target="view-strategies"]')

        try:
             page.wait_for_selector('#view-strategies.active', state='visible', timeout=5000)
        except Exception as e:
             print(f"Wait failed: {e}")

        # Verify "Move groups to new window" checkbox
        separate_window = page.locator('#strat-separate-window')
        if separate_window.is_visible():
            print("SUCCESS: 'Move groups to new window' checkbox is visible.")
        else:
            print("FAILURE: 'Move groups to new window' checkbox not found.")

        # Verify "Sort Groups" checkbox (relocated)
        sort_groups = page.locator('#strat-sortgroups')
        if sort_groups.is_visible():
            print("SUCCESS: 'Sort Groups' checkbox is visible.")
            # Check if it's under the "Group Sorting" header
            header = page.locator('h4:has-text("Group Sorting")')
            if header.is_visible():
                print("SUCCESS: 'Group Sorting' header is visible.")
            else:
                 print("FAILURE: 'Group Sorting' header not found.")
        else:
            print("FAILURE: 'Sort Groups' checkbox not found.")

        # Verify new Sort section text
        sort_header = page.locator('h3:has-text("Sort tabs within groups by the following fields")')
        if sort_header.is_visible():
             print("SUCCESS: Sort section header updated correctly.")
        else:
             print("FAILURE: Sort section header not updated.")

        page.screenshot(path="verification/verification_ui.png")
        browser.close()

if __name__ == "__main__":
    verify_ui()
