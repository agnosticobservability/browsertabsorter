
from playwright.sync_api import sync_playwright

def verify_custom_genera(page):
    # Go to the devtools page
    page.goto('http://localhost:8000/ui/devtools.html')

    # Click on "Algorithms & Simulation" tab
    page.click('button[data-target="view-algorithms"]')

    # Wait for the custom genera container to be visible
    page.wait_for_selector('#custom-genera-container', state='visible')

    # Wait a bit for the mock data to populate the list
    page.wait_for_timeout(1000)

    # Take a screenshot
    page.screenshot(path='verification/custom_genera_ui.png')
    print("Screenshot saved to verification/custom_genera_ui.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Inject mock chrome object before loading the page
        page.add_init_script("""
            window.chrome = {
                tabs: {
                    query: (queryInfo, callback) => {
                         if (callback) callback([]);
                         return Promise.resolve([]);
                    },
                    onUpdated: { addListener: () => {} },
                    onRemoved: { addListener: () => {} },
                    update: () => {},
                    remove: () => {}
                },
                windows: {
                    update: () => {}
                },
                runtime: {
                    sendMessage: async (message) => {
                        console.log('Message sent:', message);
                        if (message.type === 'loadPreferences') {
                            return {
                                ok: true,
                                data: {
                                    customGenera: {
                                        'mysite.com': 'MyCategory',
                                        'test.org': 'Testing'
                                    }
                                }
                            };
                        }
                        if (message.type === 'savePreferences') {
                            return { ok: true };
                        }
                    }
                }
            };
        """)

        try:
            verify_custom_genera(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()
