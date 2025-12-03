# Browser Tab Sorter

A Chromium Manifest V3 extension that automatically groups and sorts tabs with adjustable strategies and a clean UI.

## Features
- Deterministic grouping by domain, semantics (title/URL hints), and navigation chains.
- Sorting by pinned status, recency, and hierarchy.
- Popup UI to inspect, refresh, and close grouped tabs.
- Options page to tune grouping/sorting and enable auto-grouping.
- Save sessions to storage for later restoration.

## Project layout
- `manifest.json` – MV3 manifest referencing the compiled background service worker and UI assets.
- `src/` – TypeScript sources for background logic, shared types, and UI scripts.
- `ui/` – Popup and options page HTML/CSS that load compiled JS from `dist/`.
- `dist/` – Generated JS compiled from TypeScript via `npm run build`.

## Building
```bash
npm install
npm run build
```
The build emits compiled files in `dist/` which are referenced by the manifest and UI pages. A prebuild step also generates lightweight placeholder PNG icons into `icons/` so no binary assets need to be tracked in git.

## Loading in Chromium
1. Run the build to produce `dist/`.
2. Open `chrome://extensions` (or equivalent) and enable **Developer mode**.
3. Click **Load unpacked** and choose the repository folder.
4. Pin the extension and open the popup to view grouped tabs.

## Extending strategies
- Add new grouping heuristics in `src/background/groupingStrategies.ts` and register them in the UI drop-downs.
- Add new sorting heuristics in `src/background/sortingStrategies.ts` and expose checkboxes/toggles in `ui/options.html` + `src/ui/options.ts`.
- Use the logger (`logDebug`, `logInfo`) to keep debugging output structured and privacy-aware.
