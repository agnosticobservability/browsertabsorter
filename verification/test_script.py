
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Mock chrome API
    page.add_init_script("""
    window.chrome = {
        runtime: {
            sendMessage: (msg) => { console.log("Message:", msg); return Promise.resolve({ ok: true }); },
            getURL: (path) => path,
            onMessage: { addListener: () => {} }
        },
        tabs: {
            query: () => Promise.resolve([]),
            onUpdated: { addListener: () => {} },
            onRemoved: { addListener: () => {} }
        },
        windows: {
            getCurrent: () => Promise.resolve({ id: 1, type: "normal" }),
            getAll: () => Promise.resolve([]),
            onRemoved: { addListener: () => {} }
        },
        storage: {
            local: {
                get: () => Promise.resolve({})
            }
        }
    };
    """)

    # Load file
    import os
    cwd = os.getcwd()
    # We need to serve the file or just load it.
    # Since it uses modules, file:// might fail with CORS/MIME if not careful, but often works in Playwright with restrictions disabled.
    # However, simpler to just run python server.
    pass

    browser.close()

# We will run a server in background
