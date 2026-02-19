import { appState } from "./state.js";
import { setCustomStrategies } from "../../background/groupingStrategies.js";
import { renderAlgorithmsView, showModal } from "./components.js";
import { renderStrategyConfig } from "./simulation.js";
import { Preferences, CustomStrategy } from "../../shared/types.js";
import { STRATEGIES } from "../../shared/strategyRegistry.js";
import { logInfo } from "../../shared/logger.js";
import { escapeHtml } from "../../shared/utils.js";

export async function loadPreferencesAndInit() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'loadPreferences' });
        if (response && response.ok && response.data) {
            const prefs = response.data as Preferences;
            appState.localCustomStrategies = prefs.customStrategies || [];
            setCustomStrategies(appState.localCustomStrategies);
            renderStrategyLoadOptions();
            renderStrategyListTable();
        }
    } catch (e) {
        console.error("Failed to load preferences", e);
    }
}

export function renderStrategyLoadOptions() {
    const select = document.getElementById('strategy-load-select') as HTMLSelectElement | null;
    if (!select) return;

    const customOptions = appState.localCustomStrategies
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label))
        .map(strategy => `
            <option value="${escapeHtml(strategy.id)}">${escapeHtml(strategy.label)} (${escapeHtml(strategy.id)})</option>
        `).join('');

    const builtInOptions = STRATEGIES
        .filter(s => !appState.localCustomStrategies.some(cs => cs.id === s.id))
        .map(strategy => `
            <option value="${escapeHtml(strategy.id as string)}">${escapeHtml(strategy.label)} (Built-in)</option>
        `).join('');

    select.innerHTML = `<option value="">Load saved strategy...</option>` +
        (customOptions ? `<optgroup label="Custom Strategies">${customOptions}</optgroup>` : '') +
        (builtInOptions ? `<optgroup label="Built-in Strategies">${builtInOptions}</optgroup>` : '');
}

export function renderStrategyListTable() {
    const tableBody = document.getElementById('strategy-table-body');
    if (!tableBody) return;

    const customIds = new Set(appState.localCustomStrategies.map(strategy => strategy.id));
    const builtInRows = STRATEGIES.map(strategy => ({
        ...strategy,
        sourceLabel: 'Built-in',
        configSummary: '—',
        autoRunLabel: '—',
        actions: ''
    }));

    const customRows = appState.localCustomStrategies.map(strategy => {
        const overridesBuiltIn = customIds.has(strategy.id) && STRATEGIES.some(builtIn => builtIn.id === strategy.id);
        return {
            id: strategy.id,
            label: strategy.label,
            isGrouping: true,
            isSorting: true,
            sourceLabel: overridesBuiltIn ? 'Custom (overrides built-in)' : 'Custom',
            configSummary: `Filters: ${strategy.filters?.length || 0}, Groups: ${strategy.groupingRules?.length || 0}, Sorts: ${strategy.sortingRules?.length || 0}`,
            autoRunLabel: strategy.autoRun ? 'Yes' : 'No',
            actions: `<button class="delete-strategy-row" data-id="${escapeHtml(strategy.id)}" style="color: red;">Delete</button>`
        };
    });

    const allRows = [...builtInRows, ...customRows];

    if (allRows.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="color: #888;">No strategies found.</td></tr>';
        return;
    }

    tableBody.innerHTML = allRows.map(row => {
        const capabilities = [row.isGrouping ? 'Grouping' : null, row.isSorting ? 'Sorting' : null].filter(Boolean).join(', ');
        return `
        <tr>
            <td>${escapeHtml(row.label)}</td>
            <td>${escapeHtml(String(row.id))}</td>
            <td>${escapeHtml(row.sourceLabel)}</td>
            <td>${escapeHtml(capabilities)}</td>
            <td>${escapeHtml(row.configSummary)}</td>
            <td>${escapeHtml(row.autoRunLabel)}</td>
            <td>${row.actions}</td>
        </tr>
        `;
    }).join('');

    tableBody.querySelectorAll('.delete-strategy-row').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = (e.target as HTMLElement).dataset.id;
            if (id && confirm(`Delete strategy "${id}"?`)) {
                await deleteCustomStrategy(id);
            }
        });
    });
}

export async function deleteCustomStrategy(id: string) {
    try {
        logInfo("Deleting strategy", { id });
        const response = await chrome.runtime.sendMessage({ type: 'loadPreferences' });
        if (response && response.ok && response.data) {
            const prefs = response.data as Preferences;
            const newStrategies = (prefs.customStrategies || []).filter(s => s.id !== id);

            await chrome.runtime.sendMessage({
                type: 'savePreferences',
                payload: { customStrategies: newStrategies }
            });

            appState.localCustomStrategies = newStrategies;
            setCustomStrategies(appState.localCustomStrategies);
            renderStrategyLoadOptions();
            renderStrategyListTable();
            renderAlgorithmsView();
            renderStrategyConfig();
        }
    } catch (e) {
        console.error("Failed to delete strategy", e);
    }
}

export async function saveStrategy(strat: CustomStrategy, showSuccess: boolean): Promise<boolean> {
    try {
        logInfo("Saving strategy", { id: strat.id });
        const response = await chrome.runtime.sendMessage({ type: 'loadPreferences' });
        if (response && response.ok && response.data) {
            const prefs = response.data as Preferences;
            let currentStrategies = prefs.customStrategies || [];

            // Find existing to preserve props (like autoRun)
            const existing = currentStrategies.find(s => s.id === strat.id);
            if (existing) {
                strat.autoRun = existing.autoRun;
            }

            // Remove existing if same ID
            currentStrategies = currentStrategies.filter(s => s.id !== strat.id);
            currentStrategies.push(strat);

            await chrome.runtime.sendMessage({
                type: 'savePreferences',
                payload: { customStrategies: currentStrategies }
            });

            appState.localCustomStrategies = currentStrategies;
            setCustomStrategies(appState.localCustomStrategies);

            renderStrategyLoadOptions();
            renderStrategyListTable();
            renderAlgorithmsView();
            renderStrategyConfig();
            if (showSuccess) alert("Strategy saved!");
            return true;
        }
        return false;
    } catch (e) {
        console.error("Failed to save strategy", e);
        alert("Error saving strategy");
        return false;
    }
}

export function exportAllStrategies() {
    logInfo("Exporting all strategies", { count: appState.localCustomStrategies.length });
    const json = JSON.stringify(appState.localCustomStrategies, null, 2);
    const content = `
        <p>Copy the JSON below (contains ${appState.localCustomStrategies.length} strategies):</p>
        <textarea style="width: 100%; height: 300px; font-family: monospace;">${escapeHtml(json)}</textarea>
    `;
    showModal("Export All Strategies", content);
}

export function importAllStrategies() {
    const content = document.createElement('div');
    content.innerHTML = `
        <p>Paste Strategy List JSON below:</p>
        <p style="font-size: 0.9em; color: #666;">Note: Strategies with matching IDs will be overwritten.</p>
        <textarea id="import-all-area" style="width: 100%; height: 200px; font-family: monospace; margin-bottom: 10px;"></textarea>
        <button id="import-all-confirm" class="success-btn">Import All</button>
    `;

    const btn = content.querySelector('#import-all-confirm');
    btn?.addEventListener('click', async () => {
        const txt = (content.querySelector('#import-all-area') as HTMLTextAreaElement).value;
        try {
            const json = JSON.parse(txt);
            if (!Array.isArray(json)) {
                alert("Invalid format: Expected an array of strategies.");
                return;
            }

            // Validate items
            const invalid = json.find(s => !s.id || !s.label);
            if (invalid) {
                alert("Invalid strategy in list: missing ID or Label.");
                return;
            }

            // Merge logic (Upsert)
            const stratMap = new Map(appState.localCustomStrategies.map(s => [s.id, s]));

            let count = 0;
            json.forEach((s: CustomStrategy) => {
                stratMap.set(s.id, s);
                count++;
            });

            const newStrategies = Array.from(stratMap.values());

            logInfo("Importing all strategies", { count: newStrategies.length });

            // Save
            await chrome.runtime.sendMessage({
                type: 'savePreferences',
                payload: { customStrategies: newStrategies }
            });

            // Update local state
            appState.localCustomStrategies = newStrategies;
            setCustomStrategies(appState.localCustomStrategies);

            renderStrategyLoadOptions();
            renderStrategyListTable();
            renderAlgorithmsView();
            renderStrategyConfig();

            alert(`Imported ${count} strategies.`);
            document.querySelector('.modal-overlay')?.remove();

        } catch(e) {
            alert("Invalid JSON: " + e);
        }
    });

    showModal("Import All Strategies", content);
}

export function initStrategies() {
    const exportAllBtn = document.getElementById('strategy-list-export-btn');
    const importAllBtn = document.getElementById('strategy-list-import-btn');
    if (exportAllBtn) exportAllBtn.addEventListener('click', exportAllStrategies);
    if (importAllBtn) importAllBtn.addEventListener('click', importAllStrategies);
}
