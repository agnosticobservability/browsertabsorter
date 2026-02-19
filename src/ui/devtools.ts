import { appState } from "./devtools/state.js";
import { initTabsTable, loadTabs } from "./devtools/tabsTable.js";
import { initStrategies, loadPreferencesAndInit } from "./devtools/strategies.js";
import { initStrategyBuilder } from "./devtools/strategyBuilder.js";
import { initLogs, loadLogs, loadGlobalLogLevel } from "./devtools/logs.js";
import { initGenera, loadCustomGenera } from "./devtools/genera.js";
import { initSimulation, renderStrategyConfig } from "./devtools/simulation.js";
import { renderAlgorithmsView, showStrategyDetails } from "./devtools/components.js";
import { logInfo } from "../shared/logger.js";
import { escapeHtml } from "../shared/utils.js";

document.addEventListener('DOMContentLoaded', async () => {
  // Tab Switching Logic
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active class from all buttons and sections
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));

      // Add active class to clicked button
      btn.classList.add('active');

      // Show target section
      const targetId = (btn as HTMLElement).dataset.target;
      if (targetId) {
        document.getElementById(targetId)?.classList.add('active');
        logInfo("Switched view", { targetId });
      }

      // If switching to algorithms, populate reference if empty
      if (targetId === 'view-algorithms') {
         renderAlgorithmsView();
         renderStrategyConfig(); // Update sim list too
      } else if (targetId === 'view-strategy-list') {
         // Strategy list is rendered by renderStrategyListTable which is called in init
         // But maybe we should refresh it?
         // renderStrategyListTable(); // exported from strategies.ts
      } else if (targetId === 'view-logs') {
         loadLogs();
         loadGlobalLogLevel();
      }
    });
  });

  // Global Click Listener for shared actions (context json, goto tab, close tab, strategy view)
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    if (target.matches('.context-json-btn')) {
      const tabId = Number(target.dataset.tabId);
      if (!tabId) return;
      const data = appState.currentContextMap.get(tabId)?.data;
      if (!data) return;
      const json = JSON.stringify(data, null, 2);
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>JSON View</title>
          <style>
            body { font-family: monospace; background-color: #f0f0f0; padding: 20px; }
            pre { background-color: white; padding: 15px; border-radius: 5px; border: 1px solid #ccc; overflow: auto; }
          </style>
        </head>
        <body>
          <h3>JSON Data</h3>
          <pre>${escapeHtml(json)}</pre>
        </body>
        </html>
      `;
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
    } else if (target.matches('.goto-tab-btn')) {
      const tabId = Number(target.dataset.tabId);
      const windowId = Number(target.dataset.windowId);
      if (tabId && windowId) {
        chrome.tabs.update(tabId, { active: true });
        chrome.windows.update(windowId, { focused: true });
      }
    } else if (target.matches('.close-tab-btn')) {
      const tabId = Number(target.dataset.tabId);
      if (tabId) {
        chrome.tabs.remove(tabId);
      }
    } else if (target.matches('.strategy-view-btn')) {
        const type = target.dataset.type;
        const name = target.dataset.name;
        if (type && name) {
            showStrategyDetails(type, name);
        }
    }
  });

  // Initialize Modules
  initTabsTable();
  initStrategies();
  initStrategyBuilder();
  initLogs();
  initGenera();
  initSimulation();

  loadTabs();

  // Pre-render static content
  await loadPreferencesAndInit(); // Load preferences first to init strategies

  renderAlgorithmsView();
  renderStrategyConfig();

  loadCustomGenera();
});
