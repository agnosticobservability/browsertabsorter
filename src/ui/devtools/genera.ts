import { appState } from "./state.js";
import { loadTabs } from "./tabsTable.js";
import { Preferences } from "../../shared/types.js";
import { logInfo } from "../../shared/logger.js";
import { escapeHtml } from "../../shared/utils.js";

export async function loadCustomGenera() {
    const listContainer = document.getElementById('custom-genera-list');
    if (!listContainer) return;

    try {
        const response = await chrome.runtime.sendMessage({ type: 'loadPreferences' });
        if (response && response.ok && response.data) {
            const prefs = response.data as Preferences;
            renderCustomGeneraList(prefs.customGenera || {});
        }
    } catch (e) {
        console.error("Failed to load custom genera", e);
    }
}

export function renderCustomGeneraList(customGenera: Record<string, string>) {
    const listContainer = document.getElementById('custom-genera-list');
    if (!listContainer) return;

    if (Object.keys(customGenera).length === 0) {
        listContainer.innerHTML = '<p style="color: #888; font-style: italic;">No custom entries.</p>';
        return;
    }

    listContainer.innerHTML = Object.entries(customGenera).map(([domain, category]) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px; border-bottom: 1px solid #f0f0f0;">
            <span><b>${escapeHtml(domain)}</b>: ${escapeHtml(category)}</span>
            <button class="delete-genera-btn" data-domain="${escapeHtml(domain)}" style="background: none; border: none; color: red; cursor: pointer;">&times;</button>
        </div>
    `).join('');

    // Re-attach listeners for delete buttons
    listContainer.querySelectorAll('.delete-genera-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const domain = (e.target as HTMLElement).dataset.domain;
            if (domain) {
                await deleteCustomGenera(domain);
            }
        });
    });
}

export async function addCustomGenera() {
    const domainInput = document.getElementById('new-genera-domain') as HTMLInputElement;
    const categoryInput = document.getElementById('new-genera-category') as HTMLInputElement;

    if (!domainInput || !categoryInput) return;

    const domain = domainInput.value.trim().toLowerCase();
    const category = categoryInput.value.trim();

    if (!domain || !category) {
        alert("Please enter both domain and category.");
        return;
    }

    logInfo("Adding custom genera", { domain, category });

    try {
        // Fetch current to merge
        const response = await chrome.runtime.sendMessage({ type: 'loadPreferences' });
        if (response && response.ok && response.data) {
            const prefs = response.data as Preferences;
            const newCustomGenera = { ...(prefs.customGenera || {}), [domain]: category };

            await chrome.runtime.sendMessage({
                type: 'savePreferences',
                payload: { customGenera: newCustomGenera }
            });

            domainInput.value = '';
            categoryInput.value = '';
            loadCustomGenera();
            loadTabs(); // Refresh tabs to apply new classification if relevant
        }
    } catch (e) {
        console.error("Failed to add custom genera", e);
    }
}

export async function deleteCustomGenera(domain: string) {
    try {
        logInfo("Deleting custom genera", { domain });
        const response = await chrome.runtime.sendMessage({ type: 'loadPreferences' });
        if (response && response.ok && response.data) {
            const prefs = response.data as Preferences;
            const newCustomGenera = { ...(prefs.customGenera || {}) };
            delete newCustomGenera[domain];

            await chrome.runtime.sendMessage({
                type: 'savePreferences',
                payload: { customGenera: newCustomGenera }
            });

            loadCustomGenera();
            loadTabs();
        }
    } catch (e) {
        console.error("Failed to delete custom genera", e);
    }
}

export function initGenera() {
    document.addEventListener('click', (event) => {
        const target = event.target as HTMLElement | null;
        if (target && target.id === 'add-genera-btn') {
            addCustomGenera();
        }
    });
}
