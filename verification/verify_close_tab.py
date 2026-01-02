
import os
import time
from playwright.sync_api import sync_playwright, Page, expect

def test_close_tab_button(page: Page):
    # Mock chrome API
    page.add_init_script("""
        window.chrome = {
            runtime: {
                sendMessage: (msg, callback) => {
                    if (msg.type === 'loadPreferences') {
                         if (callback) callback({ ok: true, data: { popupVariant: 'default' } });
                    }
                }
            },
            tabs: {
                query: (queryInfo) => {
                    return Promise.resolve([
                        {
                            id: 1,
                            index: 0,
                            windowId: 1,
                            groupId: -1,
                            title: 'Google',
                            url: 'https://google.com',
                            status: 'complete',
                            active: true,
                            pinned: false,
                            openerTabId: undefined,
                            lastAccessed: Date.now()
                        },
                         {
                            id: 2,
                            index: 1,
                            windowId: 1,
                            groupId: -1,
                            title: 'GitHub',
                            url: 'https://github.com',
                            status: 'complete',
                            active: false,
                            pinned: false,
                            openerTabId: undefined,
                            lastAccessed: Date.now()
                        }
                    ]);
                },
                update: (tabId, updateProperties) => {},
                remove: (tabId) => {
                    console.log('chrome.tabs.remove called with', tabId);
                    window.removedTabId = tabId;

                    // Simulate removal callback
                     if (window.onRemovedListener) {
                        window.onRemovedListener(tabId, { isWindowClosing: false, windowId: 1 });
                    }
                },
                onUpdated: {
                    addListener: (listener) => {}
                },
                onRemoved: {
                    addListener: (listener) => {
                        window.onRemovedListener = listener;
                    }
                }
            },
            windows: {
                update: (windowId, updateInfo) => {}
            }
        };
    """)

    # Navigate to the page
    page.goto("http://localhost:8000/ui/devtools.html")

    # Wait for table to populate
    # The script in devtools.ts runs on DOMContentLoaded which happens after scripts run.
    # However, since we mock chrome.tabs.query to return a promise, we need to wait for it to resolve and render.

    # Check if rows are rendered
    row_selector = "#tabsTable tbody tr"
    page.wait_for_selector(row_selector)

    rows = page.locator(row_selector)
    expect(rows).to_have_count(2)

    # Check for Close button
    close_btn = rows.nth(0).locator(".close-tab-btn")
    expect(close_btn).to_be_visible()
    expect(close_btn).to_have_text("Close")

    # Check styles
    # expect(close_btn).to_have_css("background-color", "rgb(220, 53, 69)") # #dc3545

    # Click close button on first row (id=1)
    close_btn.click()

    # Verify remove was called
    removed_id = page.evaluate("window.removedTabId")
    assert removed_id == 1, f"Expected removedTabId to be 1, got {removed_id}"

    # Take screenshot
    page.screenshot(path="verification/devtools_close_button.png")
    print("Screenshot saved to verification/devtools_close_button.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_close_tab_button(page)
        except Exception as e:
            print(f"Test failed: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()
