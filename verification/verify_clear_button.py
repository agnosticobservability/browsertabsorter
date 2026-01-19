import time
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Inject mock for chrome.runtime and chrome.tabs to avoid errors
    page.add_init_script("""
        window.chrome = {
            runtime: {
                sendMessage: (msg, cb) => {
                    console.log('Mock sendMessage:', msg);
                    if (cb) cb({ok: true, data: {}});
                    return Promise.resolve({ok: true, data: {}});
                },
                onMessage: { addListener: () => {} }
            },
            tabs: {
                query: (query) => Promise.resolve([]),
                onUpdated: { addListener: () => {} },
                onRemoved: { addListener: () => {} }
            },
            windows: {
                onFocusChanged: { addListener: () => {} }
            },
            tabGroups: {
                query: (query) => Promise.resolve([]),
                onUpdated: { addListener: () => {} }
            }
        };
    """)

    # Navigate to the DevTools page served by the local server
    page.goto("http://localhost:8000/ui/devtools.html")

    # Click on "Strategy Manager" tab to make sure we are in the right view
    page.click(".tab-btn[data-target='view-strategies']")

    # Wait for the clear button to be visible
    page.wait_for_selector("#builder-clear-btn")

    # Fill some data to test clearing
    page.fill("#strat-name", "Test Strategy")
    page.fill("#strat-desc", "This is a test description")
    page.check("#strat-autorun")

    # Take a screenshot before clearing
    page.screenshot(path="verification/before_clear.png")

    # Click Clear button
    page.click("#builder-clear-btn")

    # Take a screenshot after clearing
    page.screenshot(path="verification/after_clear.png")

    # Assertions
    name_val = page.input_value("#strat-name")
    desc_val = page.input_value("#strat-desc")
    autorun_checked = page.is_checked("#strat-autorun")

    print(f"Name after clear: '{name_val}'")
    print(f"Desc after clear: '{desc_val}'")
    print(f"AutoRun after clear: {autorun_checked}")

    if name_val == "" and desc_val == "" and not autorun_checked:
        print("VERIFICATION SUCCESS: Fields cleared successfully.")
    else:
        print("VERIFICATION FAILED: Fields not cleared.")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
