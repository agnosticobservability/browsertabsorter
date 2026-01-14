import http.server
import socketserver
import threading
import os
import time
from playwright.sync_api import sync_playwright

# Define the port
PORT = 8000

# Set directory to app root
os.chdir('/app')

# Create a handler
Handler = http.server.SimpleHTTPRequestHandler

# Create the server
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at port {PORT}")

    # Run the server in a separate thread
    server_thread = threading.Thread(target=httpd.serve_forever)
    server_thread.daemon = True
    server_thread.start()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Capture console logs
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))

        # Mock chrome API
        page.add_init_script("""
        window.chrome = {
            runtime: {
                sendMessage: (msg, callback) => {
                    // console.log('Message sent:', JSON.stringify(msg));

                    const handleMessage = (cb) => {
                        if (msg.type === 'getState') {
                            setTimeout(() => {
                                cb({
                                    ok: true,
                                    data: {
                                        groups: [],
                                        preferences: {
                                            sorting: [],
                                            customStrategies: [
                                                { id: 'custom-1', label: 'My Custom Strategy', autoRun: true, filters: [], groupingRules: [], sortingRules: [], isCustom: true },
                                                { id: 'custom-2', label: 'Another Strategy', autoRun: false, filters: [], groupingRules: [], sortingRules: [], isCustom: true }
                                            ]
                                        }
                                    }
                                });
                            }, 100);
                        } else if (msg.type === 'savePreferences') {
                             // console.log('Saved prefs:', JSON.stringify(msg.payload));
                             cb({ ok: true, data: {} });
                        } else {
                            cb({ ok: true });
                        }
                    };

                    if (callback) {
                        handleMessage(callback);
                    } else {
                        return new Promise(resolve => handleMessage(resolve));
                    }
                },
                getURL: (path) => path,
                onMessage: { addListener: () => {} },
                onInstalled: { addListener: () => {} }
            },
            windows: {
                getCurrent: () => Promise.resolve({ id: 1, type: 'popup' }),
                getAll: () => Promise.resolve([{ id: 1, tabs: [] }]),
                update: () => Promise.resolve(),
                create: () => Promise.resolve(),
                onRemoved: { addListener: () => {} }
            },
            tabs: {
                query: () => Promise.resolve([]),
                group: () => Promise.resolve(1),
                ungroup: () => Promise.resolve(),
                move: () => Promise.resolve(),
                remove: () => Promise.resolve(),
                update: () => Promise.resolve(),
                onUpdated: { addListener: () => {} },
                onRemoved: { addListener: () => {} },
                onCreated: { addListener: () => {} }
            },
            tabGroups: {
                query: () => Promise.resolve([]),
                update: () => Promise.resolve(),
                onRemoved: { addListener: () => {} },
                onUpdated: { addListener: () => {} }
            },
            storage: {
                local: {
                    get: (keys, cb) => cb({}),
                    set: (items, cb) => cb && cb()
                }
            }
        };
        """)

        try:
            # Navigate to popup
            page.goto(f"http://localhost:{PORT}/ui/popup.html")

            # Wait for strategies to load
            print("Waiting for strategy list...")
            page.wait_for_selector(".strategy-row", timeout=5000)

            print("Waiting for My Custom Strategy...")
            page.wait_for_selector("text=My Custom Strategy", timeout=5000)

            # Check for the auto-run button
            print("Checking for auto-run button...")
            # We look for the button with the auto-run class inside the row for 'custom-1'
            # Since 'custom-1' appears in both grouping and sorting lists, there are two elements.
            # We pick the first one (grouping list).
            custom_row = page.locator('.strategy-row[data-id="custom-1"]').first
            auto_run_btn = custom_row.locator('.action-btn.auto-run')

            if auto_run_btn.count() > 0:
                print("Auto run button found!")
                # Verify it is active
                if "active" in auto_run_btn.get_attribute("class"):
                    print("Auto run button is ACTIVE (Correct)")
                else:
                    print("Auto run button is NOT active (Incorrect)")
            else:
                print("Auto run button NOT found!")

            # Take screenshot
            page.screenshot(path="verification_popup.png")
            print("Screenshot saved to verification_popup.png")

        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification_failed.png")
            print("Saved verification_failed.png")

        browser.close()
