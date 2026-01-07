from playwright.sync_api import sync_playwright
import time

def verify_strategies(page):
    page.on("console", lambda msg: print(f"Browser Console: {msg.text}"))
    page.on("pageerror", lambda err: print(f"Browser Error: {err}"))

    # Pre-inject chrome object
    page.add_init_script("""
        window.chrome = {
            runtime: {
                sendMessage: (msg) => {
                    console.log('Mock sendMessage:', msg);
                    if (msg.type === 'loadPreferences') {
                        return Promise.resolve({
                            ok: true,
                            data: {
                                customStrategies: [
                                    { id: 'custom_1', label: 'My Custom Strat', type: 'grouping', rules: [] }
                                ],
                                customGenera: {}
                            }
                        });
                    }
                    return Promise.resolve({ ok: true });
                },
                getURL: (path) => path
            },
            tabs: {
                query: () => Promise.resolve([]),
                onUpdated: { addListener: () => {} },
                onRemoved: { addListener: () => {} }
            },
            windows: {
                getAll: () => Promise.resolve([])
            }
        };
    """)

    # Navigate to the page
    page.goto("http://localhost:8000/ui/devtools.html")

    # Click the tab
    page.click("button[data-target='view-algorithms']")

    # Scroll to bottom
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")

    # Wait
    time.sleep(2)

    # Check for container content
    content = page.evaluate("document.getElementById('custom-strategies-list').innerHTML")
    print("Content of list length:", len(content))

    page.screenshot(path="verification/strategies_list.png")

    # Check for override button
    page.wait_for_selector(".override-strat-btn", timeout=2000)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        try:
            verify_strategies(page)
        except Exception as e:
            print(e)
        finally:
            browser.close()
