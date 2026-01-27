import os
import time
import json
import subprocess
from playwright.sync_api import sync_playwright

def verify_sharing_screenshots():
    # Start server
    subprocess.run(["pkill", "-f", "python3 -m http.server 8000"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    server = subprocess.Popen(["python3", "-m", "http.server", "8000"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.set_viewport_size({"width": 1280, "height": 800})

            # Mock chrome API
            page.add_init_script("""
                window.chrome = {
                    runtime: {
                        sendMessage: (msg) => {
                            if (msg.type === 'loadPreferences') {
                                return Promise.resolve({ ok: true, data: { customStrategies: [] } });
                            }
                            if (msg.type === 'savePreferences') {
                                return Promise.resolve({ ok: true });
                            }
                            return Promise.resolve({ ok: true });
                        },
                        onMessage: { addListener: () => {} }
                    },
                    tabs: {
                        query: () => Promise.resolve([]),
                        onUpdated: { addListener: () => {} },
                        onRemoved: { addListener: () => {} }
                    },
                    tabGroups: {
                        query: () => Promise.resolve([]),
                        onRemoved: { addListener: () => {} }
                    },
                    storage: {
                        local: {
                            get: () => Promise.resolve({}),
                            set: () => Promise.resolve({})
                        }
                    }
                };
            """)

            page.goto("http://localhost:8000/ui/devtools.html")

            # 1. Builder Buttons
            page.click("button[data-target='view-strategies']")
            page.wait_for_selector("#view-strategies.active", state="visible")
            page.wait_for_selector("#builder-export-btn", state="visible")

            # Screenshot of the builder header
            # The first algo-card in view-strategies is the builder
            page.locator("#view-strategies .algo-card").first.screenshot(path="verification/builder_ui.png")

            # 2. Builder Modal
            page.click("#builder-import-btn")
            page.wait_for_selector(".modal", state="visible")
            page.screenshot(path="verification/import_modal.png")

            # Close modal
            page.click(".modal-close")
            page.wait_for_selector(".modal", state="detached")

            # 3. List Buttons
            page.click("button[data-target='view-strategy-list']")
            page.wait_for_selector("#view-strategy-list.active", state="visible")
            page.wait_for_selector("#strategy-list-export-btn", state="visible")
            page.locator("#view-strategy-list .algo-card").screenshot(path="verification/list_ui.png")

            browser.close()
    finally:
        server.terminate()

if __name__ == "__main__":
    verify_sharing_screenshots()
