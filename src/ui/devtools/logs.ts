import { appState } from "./state.js";
import { LogEntry, LogLevel, Preferences } from "../../shared/types.js";
import { escapeHtml } from "../../shared/utils.js";

export async function loadLogs() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'getLogs' });
        if (response && response.ok && response.data) {
            appState.currentLogs = response.data;
            renderLogs();
        }
    } catch (e) {
        console.error("Failed to load logs", e);
    }
}

export async function clearRemoteLogs() {
    try {
        await chrome.runtime.sendMessage({ type: 'clearLogs' });
        loadLogs();
    } catch (e) {
        console.error("Failed to clear logs", e);
    }
}

export function renderLogs() {
    const tbody = document.getElementById('logs-table-body');
    const levelFilter = (document.getElementById('log-level-filter') as HTMLSelectElement).value;
    const searchText = (document.getElementById('log-search') as HTMLInputElement).value.toLowerCase();

    if (!tbody) return;

    tbody.innerHTML = '';

    const filtered = appState.currentLogs.filter(entry => {
        if (levelFilter !== 'all' && entry.level !== levelFilter) return false;
        if (searchText) {
            const text = `${entry.message} ${JSON.stringify(entry.context || {})}`.toLowerCase();
            if (!text.includes(searchText)) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="padding: 10px; text-align: center; color: #888;">No logs found.</td></tr>';
        return;
    }

    filtered.forEach(entry => {
        const row = document.createElement('tr');

        // Color code level
        let color = '#333';
        if (entry.level === 'error' || entry.level === 'critical') color = 'red';
        else if (entry.level === 'warn') color = 'orange';
        else if (entry.level === 'debug') color = 'blue';

        row.innerHTML = `
            <td style="padding: 8px; border-bottom: 1px solid #eee; white-space: nowrap;">${new Date(entry.timestamp).toLocaleTimeString()} (${entry.timestamp})</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; color: ${color}; font-weight: bold;">${entry.level.toUpperCase()}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(entry.message)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">
               <div style="max-height: 100px; overflow-y: auto;">
                  ${entry.context ? `<pre style="margin: 0;">${escapeHtml(JSON.stringify(entry.context, null, 2))}</pre>` : '-'}
               </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

export async function loadGlobalLogLevel() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'loadPreferences' });
        if (response && response.ok && response.data) {
            const prefs = response.data as Preferences;
            const select = document.getElementById('global-log-level') as HTMLSelectElement;
            if (select) {
                select.value = prefs.logLevel || 'info';
            }
        }
    } catch (e) {
        console.error("Failed to load prefs for logs", e);
    }
}

export async function updateGlobalLogLevel() {
    const select = document.getElementById('global-log-level') as HTMLSelectElement;
    if (!select) return;
    const level = select.value as LogLevel;

    try {
        await chrome.runtime.sendMessage({
            type: 'savePreferences',
            payload: { logLevel: level }
        });
    } catch (e) {
        console.error("Failed to save log level", e);
    }
}

export function initLogs() {
  const refreshLogsBtn = document.getElementById('refresh-logs-btn');
  if (refreshLogsBtn) refreshLogsBtn.addEventListener('click', loadLogs);

  const clearLogsBtn = document.getElementById('clear-logs-btn');
  if (clearLogsBtn) clearLogsBtn.addEventListener('click', clearRemoteLogs);

  const logLevelFilter = document.getElementById('log-level-filter');
  if (logLevelFilter) logLevelFilter.addEventListener('change', renderLogs);

  const logSearch = document.getElementById('log-search');
  if (logSearch) logSearch.addEventListener('input', renderLogs);

  const globalLogLevel = document.getElementById('global-log-level');
  if (globalLogLevel) globalLogLevel.addEventListener('change', updateGlobalLogLevel);
}
