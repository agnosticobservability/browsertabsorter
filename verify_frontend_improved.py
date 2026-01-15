from playwright.sync_api import sync_playwright
import time

def verify_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()

        # Inject mock
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
        page.on("pageerror", lambda exc: print(f"PAGE ERROR: {exc}"))

        # Navigate
        page.goto("http://localhost:8000/ui/devtools.html")

        # Wait for JS to initialize (e.g. loadPreferences call)
        # We can wait for a console log or just wait a bit
        try:
            page.wait_for_selector('button[data-target="view-strategies"]', state="visible")
            print("Buttons visible")
        except:
            print("Buttons not visible")

        # Click
        print("Clicking Strategy Manager...")
        page.click('button[data-target="view-strategies"]')

        # Wait for section to be active
        try:
            # The JS toggles .active class on the section
            page.wait_for_selector('#view-strategies.active', timeout=2000)
            print("Strategy Manager section is active")
        except:
            print("Strategy Manager section did NOT become active")
            # Take screenshot of failure
            page.screenshot(path="/home/jules/verification/failure.png")

        # Check checkbox
        checkbox = page.get_by_label("Sort Groups")
        if checkbox.is_visible():
            print("Sort Groups checkbox is visible")
        else:
            print("Sort Groups checkbox NOT found")

        page.screenshot(path="/home/jules/verification/verification_ui_improved.png")
        browser.close()

if __name__ == "__main__":
    verify_ui()
