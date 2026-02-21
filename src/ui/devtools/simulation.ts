import { appState } from "./state.js";
import { getMappedTabs } from "./data.js";
import { loadTabs } from "./tabsTable.js";
import { addDnDListeners } from "./components.js";
import { getStrategies, StrategyDefinition } from "../../shared/strategyRegistry.js";
import { sortTabs, compareBy, compareBySortingRules } from "../../background/sortingStrategies.js";
import { groupTabs, getCustomStrategies } from "../../background/groupingStrategies.js";
import { SortingStrategy } from "../../shared/types.js";
import { escapeHtml } from "../../shared/utils.js";

export function runSimulation() {
  const groupingList = document.getElementById('sim-grouping-list');
  const sortingList = document.getElementById('sim-sorting-list');
  const resultContainer = document.getElementById('simResults');

  if (!groupingList || !sortingList || !resultContainer) return;

  const groupingStrats = getEnabledStrategiesFromUI(groupingList);
  const sortingStrats = getEnabledStrategiesFromUI(sortingList);

  // Combine strategies to match Live behavior (which uses a single list)
  // Deduplicate while preserving order (grouping first, then sorting)
  const combinedStrategies = Array.from(new Set([...groupingStrats, ...sortingStrats]));

  // Prepare data
  let tabs = getMappedTabs();

  // 1. Group (on raw tabs, matching Live behavior)
  const groups = groupTabs(tabs, combinedStrategies);

  // 2. Sort tabs within groups
  groups.forEach(group => {
      group.tabs = sortTabs(group.tabs, combinedStrategies);
  });

  // 3. Sort Groups
  // Check for group sorting strategy in the active list
  const customStrats = getCustomStrategies();
  let groupSorterStrategy = null;

  for (const id of combinedStrategies) {
      const strategy = customStrats.find(s => s.id === id);
      if (strategy && (strategy.sortGroups || (strategy.groupSortingRules && strategy.groupSortingRules.length > 0))) {
          groupSorterStrategy = strategy;
          break;
      }
  }

  if (groupSorterStrategy) {
      groups.sort((gA, gB) => {
          // Primary: Keep windows together
          if (gA.windowId !== gB.windowId) return gA.windowId - gB.windowId;

          // Secondary: Sort by strategy using representative tab (first tab)
          const repA = gA.tabs[0];
          const repB = gB.tabs[0];

          if (!repA && !repB) return 0;
          if (!repA) return 1;
          if (!repB) return -1;

          if (groupSorterStrategy.groupSortingRules && groupSorterStrategy.groupSortingRules.length > 0) {
               return compareBySortingRules(groupSorterStrategy.groupSortingRules, repA, repB);
          } else {
               return compareBy(groupSorterStrategy.id, repA, repB);
          }
      });
  } else {
      // Default: Sort by windowId to keep display organized
      groups.sort((a, b) => a.windowId - b.windowId);
  }

  // 4. Render
  if (groups.length === 0) {
      resultContainer.innerHTML = '<p>No groups created (are there any tabs?).</p>';
      return;
  }

  resultContainer.innerHTML = groups.map(group => `
    <div class="group-result">
      <div class="group-header" style="border-left: 5px solid ${group.color}">
        <span>${escapeHtml(group.label || 'Ungrouped')}</span>
        <span class="group-meta">${group.tabs.length} tabs &bull; Reason: ${escapeHtml(group.reason)}</span>
      </div>
      <ul class="group-tabs">
        ${group.tabs.map(tab => `
          <li class="group-tab-item">
            ${tab.favIconUrl ? `<img src="${escapeHtml(tab.favIconUrl)}" class="tab-icon" onerror="this.style.display='none'">` : '<div class="tab-icon"></div>'}
            <span class="title-cell" title="${escapeHtml(tab.title)}">${escapeHtml(tab.title)}</span>
            <span style="color: #999; font-size: 0.8em; margin-left: auto;">${escapeHtml(new URL(tab.url).hostname)}</span>
          </li>
        `).join('')}
      </ul>
    </div>
  `).join('');
}

export async function applyToBrowser() {
    const groupingList = document.getElementById('sim-grouping-list');
    const sortingList = document.getElementById('sim-sorting-list');

    if (!groupingList || !sortingList) return;

    const groupingStrats = getEnabledStrategiesFromUI(groupingList);
    const sortingStrats = getEnabledStrategiesFromUI(sortingList);

    // Combine strategies.
    // We prioritize grouping strategies first, then sorting strategies,
    // as the backend filters them when performing actions.
    // Deduplicate to send a clean list.
    const allStrategies = Array.from(new Set([...groupingStrats, ...sortingStrats]));

    try {
        // 1. Save Preferences
        await chrome.runtime.sendMessage({
            type: 'savePreferences',
            payload: { sorting: allStrategies }
        });

        // 2. Trigger Apply Grouping (which uses the new preferences)
        const response = await chrome.runtime.sendMessage({
            type: 'applyGrouping',
            payload: {
                sorting: allStrategies // Pass explicitly to ensure immediate effect
            }
        });

        if (response && response.ok) {
            alert("Applied successfully!");
            loadTabs(); // Refresh data
        } else {
            alert("Failed to apply: " + (response.error || 'Unknown error'));
        }
    } catch (e) {
        console.error("Apply failed", e);
        alert("Apply failed: " + e);
    }
}

export async function renderLiveView() {
    const container = document.getElementById('live-view-container');
    if (!container) return;

    try {
        const tabs = await chrome.tabs.query({});
        const groups = await chrome.tabGroups.query({});
        const groupMap = new Map(groups.map(g => [g.id, g]));

        const windows = new Set(tabs.map(t => t.windowId));
        const windowIds = Array.from(windows).sort((a, b) => a - b);

        let html = '<div style="font-size: 0.9em; color: #666; margin-bottom: 10px;">Select items below to simulate specific selection states.</div>';

        for (const winId of windowIds) {
            const winTabs = tabs.filter(t => t.windowId === winId);
            const winSelected = winTabs.every(t => t.id && appState.simulatedSelection.has(t.id));

            html += `<div class="selectable-item ${winSelected ? 'selected' : ''}" data-type="window" data-id="${winId}" style="margin-bottom: 15px; border-radius: 4px; padding: 5px;">`;
            html += `<div style="font-weight: bold;">Window ${winId}</div>`;

            // Organize by group
            const winGroups = new Map<number, chrome.tabs.Tab[]>();
            const ungrouped: chrome.tabs.Tab[] = [];

            winTabs.forEach(t => {
                if (t.groupId !== -1) {
                    if (!winGroups.has(t.groupId)) winGroups.set(t.groupId, []);
                    winGroups.get(t.groupId)!.push(t);
                } else {
                    ungrouped.push(t);
                }
            });

            // Render Ungrouped
            if (ungrouped.length > 0) {
                 html += `<div style="margin-left: 10px; margin-top: 5px;">`;
                 html += `<div style="font-size: 0.9em; color: #555;">Ungrouped (${ungrouped.length})</div>`;
                 ungrouped.forEach(t => {
                     const isSelected = t.id && appState.simulatedSelection.has(t.id);
                     html += `<div class="selectable-item ${isSelected ? 'selected' : ''}" data-type="tab" data-id="${t.id}" style="margin-left: 10px; padding: 2px 5px; border-radius: 3px; cursor: pointer; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">- ${escapeHtml(t.title || 'Untitled')}</div>`;
                 });
                 html += `</div>`;
            }

            // Render Groups
            for (const [groupId, gTabs] of winGroups) {
                const groupInfo = groupMap.get(groupId);
                const color = groupInfo?.color || 'grey';
                const title = groupInfo?.title || 'Untitled Group';
                const groupSelected = gTabs.every(t => t.id && appState.simulatedSelection.has(t.id));

                html += `<div class="selectable-item ${groupSelected ? 'selected' : ''}" data-type="group" data-id="${groupId}" style="margin-left: 10px; margin-top: 5px; border-left: 3px solid ${color}; padding-left: 5px; padding: 5px; border-radius: 3px;">`;
                html += `<div style="font-weight: bold; font-size: 0.9em;">${escapeHtml(title)} (${gTabs.length})</div>`;
                gTabs.forEach(t => {
                     const isSelected = t.id && appState.simulatedSelection.has(t.id);
                     html += `<div class="selectable-item ${isSelected ? 'selected' : ''}" data-type="tab" data-id="${t.id}" style="margin-left: 10px; padding: 2px 5px; border-radius: 3px; cursor: pointer; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">- ${escapeHtml(t.title || 'Untitled')}</div>`;
                });
                html += `</div>`;
            }

            html += `</div>`;
        }

        container.innerHTML = html;

    } catch (e) {
        container.innerHTML = `<p style="color:red">Error loading live view: ${e}</p>`;
    }
}

export function renderStrategyConfig() {
  const groupingList = document.getElementById('sim-grouping-list');
  const sortingList = document.getElementById('sim-sorting-list');

  // Use dynamic strategy list
  const strategies: StrategyDefinition[] = getStrategies(appState.localCustomStrategies);

  if (groupingList) {
      // groupingStrategies is just filtered strategies
      const groupingStrategies = strategies.filter(s => s.isGrouping);
      renderStrategyList(groupingList, groupingStrategies, ['domain', 'topic']);
  }

  if (sortingList) {
      const sortingStrategies = strategies.filter(s => s.isSorting);
      renderStrategyList(sortingList, sortingStrategies, ['pinned', 'recency']);
  }
}

export function renderStrategyList(container: HTMLElement, strategies: StrategyDefinition[], defaultEnabled: string[]) {
    container.innerHTML = '';

    // Sort enabled by their index in defaultEnabled
    const enabled = strategies.filter(s => defaultEnabled.includes(s.id as string));
    // Safe indexof check since ids are strings in defaultEnabled
    enabled.sort((a, b) => defaultEnabled.indexOf(a.id as string) - defaultEnabled.indexOf(b.id as string));

    const disabled = strategies.filter(s => !defaultEnabled.includes(s.id as string));

    // Initial render order: Enabled (ordered) then Disabled
    const ordered = [...enabled, ...disabled];

    ordered.forEach(strategy => {
        const isChecked = defaultEnabled.includes(strategy.id);
        const row = document.createElement('div');
        row.className = `strategy-row ${isChecked ? '' : 'disabled'}`;
        row.dataset.id = strategy.id;
        row.draggable = true;

        row.innerHTML = `
            <div class="drag-handle">☰</div>
            <input type="checkbox" ${isChecked ? 'checked' : ''}>
            <span class="strategy-label">${strategy.label}</span>
        `;

        // Add listeners
        const checkbox = row.querySelector('input[type="checkbox"]');
        checkbox?.addEventListener('change', (e) => {
            const checked = (e.target as HTMLInputElement).checked;
            row.classList.toggle('disabled', !checked);
        });

        addDnDListeners(row, container);

        container.appendChild(row);
    });
}

export function getEnabledStrategiesFromUI(container: HTMLElement): SortingStrategy[] {
    return Array.from(container.children)
        .filter(row => (row.querySelector('input[type="checkbox"]') as HTMLInputElement).checked)
        .map(row => (row as HTMLElement).dataset.id as SortingStrategy);
}

export function initSimulation() {
  const runSimBtn = document.getElementById('runSimBtn');
  if (runSimBtn) {
    runSimBtn.addEventListener('click', runSimulation);
  }

  const applyBtn = document.getElementById('applyBtn');
  if (applyBtn) {
    applyBtn.addEventListener('click', applyToBrowser);
  }

  // Initial Live View
  renderLiveView();
  const refreshLiveBtn = document.getElementById('refresh-live-view-btn');
  if (refreshLiveBtn) refreshLiveBtn.addEventListener('click', renderLiveView);

  const liveContainer = document.getElementById('live-view-container');
  if (liveContainer) {
      liveContainer.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          const item = target.closest('.selectable-item') as HTMLElement;
          if (!item) return;

          const type = item.dataset.type;
          const id = Number(item.dataset.id);
          if (!type || isNaN(id)) return;

          if (type === 'tab') {
              if (appState.simulatedSelection.has(id)) appState.simulatedSelection.delete(id);
              else appState.simulatedSelection.add(id);
          } else if (type === 'group') {
              chrome.tabs.query({}).then(tabs => {
                 const groupTabs = tabs.filter(t => t.groupId === id);
                 const allSelected = groupTabs.every(t => t.id && appState.simulatedSelection.has(t.id));
                 groupTabs.forEach(t => {
                     if (t.id) {
                         if (allSelected) appState.simulatedSelection.delete(t.id);
                         else appState.simulatedSelection.add(t.id);
                     }
                 });
                 renderLiveView();
              });
              return; // async update
          } else if (type === 'window') {
              chrome.tabs.query({}).then(tabs => {
                 const winTabs = tabs.filter(t => t.windowId === id);
                 const allSelected = winTabs.every(t => t.id && appState.simulatedSelection.has(t.id));
                 winTabs.forEach(t => {
                     if (t.id) {
                         if (allSelected) appState.simulatedSelection.delete(t.id);
                         else appState.simulatedSelection.add(t.id);
                     }
                 });
                 renderLiveView();
              });
              return; // async update
          }

          renderLiveView();
      });
  }
}
