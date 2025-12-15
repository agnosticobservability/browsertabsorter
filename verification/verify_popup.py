
from playwright.sync_api import sync_playwright
import os

def run():
    # Ensure ui/popup.html exists
    if not os.path.exists('ui/popup.html'):
        print('Error: ui/popup.html not found')
        return

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Load the popup HTML file directly
        # We need to use absolute path
        cwd = os.getcwd()
        url = f'file://{cwd}/ui/popup.html'
        print(f'Loading {url}')
        page.goto(url)

        # Wait for content to load if necessary (though it's a static file mostly,
        # JS might not run fully without chrome extension environment, but HTML/CSS should render)

        # Take screenshot of the sort options
        # We might need to click something to see the dropdown if it's hidden?
        # Based on HTML, the sort options are in .sort-toggles which seems visible or checkable.

        # Let's take a full page screenshot
        page.screenshot(path='verification/popup_screenshot.png')
        print('Screenshot saved to verification/popup_screenshot.png')

        browser.close()

if __name__ == '__main__':
    run()
