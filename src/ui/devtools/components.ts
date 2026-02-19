import { escapeHtml } from "../../shared/utils.js";
import { getDragAfterElement } from "../common.js";
import { appState } from "./state.js";
import { GENERA_REGISTRY } from "../../background/extraction/generaRegistry.js";
import {
  domainFromUrl,
  semanticBucket,
  navigationKey,
  groupingKey
} from "../../background/groupingStrategies.js";
import {
  recencyScore,
  hierarchyScore,
  pinnedScore,
  compareBy
} from "../../background/sortingStrategies.js";
import { STRATEGIES, StrategyDefinition, getStrategies } from "../../shared/strategyRegistry.js";

export function showModal(title: string, content: HTMLElement | string) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    modalOverlay.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3>${escapeHtml(title)}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-content"></div>
        </div>
    `;

    const contentContainer = modalOverlay.querySelector('.modal-content') as HTMLElement;
    if (typeof content === 'string') {
        contentContainer.innerHTML = content;
    } else {
        contentContainer.appendChild(content);
    }

    document.body.appendChild(modalOverlay);

    const closeBtn = modalOverlay.querySelector('.modal-close');
    closeBtn?.addEventListener('click', () => {
        document.body.removeChild(modalOverlay);
    });

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
             document.body.removeChild(modalOverlay);
        }
    });
}

export function addDnDListeners(row: HTMLElement, container: HTMLElement) {
  row.addEventListener('dragstart', (e) => {
    row.classList.add('dragging');
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        // Set a transparent image or similar if desired, but default is usually fine
    }
  });

  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
  });

  // The container handles the drop zone logic via dragover
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    const afterElement = getDragAfterElement(container, e.clientY, '.strategy-row:not(.dragging)');
    const draggable = container.querySelector('.dragging');
    if (draggable) {
      if (afterElement == null) {
        container.appendChild(draggable);
      } else {
        container.insertBefore(draggable, afterElement);
      }
    }
  });
}

export function showStrategyDetails(type: string, name: string) {
    let content = "";
    let title = `${name} (${type})`;

    if (type === 'grouping') {
        if (name === 'domain') {
            content = `
<h3>Logic: Domain Extraction</h3>
<pre><code>${escapeHtml(domainFromUrl.toString())}</code></pre>
<h3>Logic: Grouping Key</h3>
<pre><code>${escapeHtml(groupingKey.toString())}</code></pre>
            `;
        } else if (name === 'topic') {
            content = `
<h3>Logic: Semantic Bucketing</h3>
<pre><code>${escapeHtml(semanticBucket.toString())}</code></pre>
<h3>Logic: Grouping Key</h3>
<pre><code>${escapeHtml(groupingKey.toString())}</code></pre>
            `;
        } else if (name === 'lineage') {
            content = `
<h3>Logic: Navigation Key</h3>
<pre><code>${escapeHtml(navigationKey.toString())}</code></pre>
<h3>Logic: Grouping Key</h3>
<pre><code>${escapeHtml(groupingKey.toString())}</code></pre>
            `;
        } else {
            // Check for custom strategy details
            const custom = appState.localCustomStrategies.find(s => s.id === name);
            if (custom) {
                content = `
<h3>Custom Strategy: ${escapeHtml(custom.label)}</h3>
<p><b>Configuration:</b></p>
<pre><code>${escapeHtml(JSON.stringify(custom, null, 2))}</code></pre>
<h3>Logic: Grouping Key</h3>
<pre><code>${escapeHtml(groupingKey.toString())}</code></pre>
                `;
            } else {
                content = `
<h3>Logic: Grouping Key</h3>
<pre><code>${escapeHtml(groupingKey.toString())}</code></pre>
                `;
            }
        }
    } else if (type === 'sorting') {
        content = `
<h3>Logic: Comparison Function</h3>
<pre><code>${escapeHtml(compareBy.toString())}</code></pre>
        `;

        if (name === 'recency') {
             content += `<h3>Logic: Recency Score</h3><pre><code>${escapeHtml(recencyScore.toString())}</code></pre>`;
        } else if (name === 'nesting') {
             content += `<h3>Logic: Hierarchy Score</h3><pre><code>${escapeHtml(hierarchyScore.toString())}</code></pre>`;
        } else if (name === 'pinned') {
             content += `<h3>Logic: Pinned Score</h3><pre><code>${escapeHtml(pinnedScore.toString())}</code></pre>`;
        }
    } else if (type === 'registry' && name === 'genera') {
        const json = JSON.stringify(GENERA_REGISTRY, null, 2);
        content = `
<h3>Genera Registry Data</h3>
<p>Mapping of domain names to categories.</p>
<pre><code>${escapeHtml(json)}</code></pre>
        `;
    }

    showModal(title, content);
}

export function renderAlgorithmsView() {
  const groupingRef = document.getElementById('grouping-ref');
  const sortingRef = document.getElementById('sorting-ref');

  if (groupingRef) {
      // Re-render because strategy list might change
      const allStrategies: StrategyDefinition[] = getStrategies(appState.localCustomStrategies);
      const groupings = allStrategies.filter(s => s.isGrouping);

      groupingRef.innerHTML = groupings.map(g => {
         const isCustom = appState.localCustomStrategies.some(s => s.id === g.id);
         let desc = "Built-in strategy";
         if (isCustom) desc = "Custom strategy defined by rules.";
         else if (g.id === 'domain') desc = 'Groups tabs by their domain name.';
         else if (g.id === 'topic') desc = 'Groups based on keywords in the title.';

         return `
          <div class="strategy-item">
            <div class="strategy-name">${g.label} (${g.id}) ${isCustom ? '<span style="color: blue; font-size: 0.8em;">Custom</span>' : ''}</div>
            <div class="strategy-desc">${desc}</div>
            <button class="strategy-view-btn" data-type="grouping" data-name="${g.id}">View Logic</button>
          </div>
        `;
      }).join('');
  }

  if (sortingRef) {
    // Re-render sorting strategies too
    const allStrategies: StrategyDefinition[] = getStrategies(appState.localCustomStrategies);
    const sortings = allStrategies.filter(s => s.isSorting);

    sortingRef.innerHTML = sortings.map(s => {
        let desc = "Built-in sorting";
        if (s.id === 'recency') desc = 'Sorts by last accessed time (most recent first).';
        else if (s.id === 'nesting') desc = 'Sorts based on hierarchy (roots vs children).';
        else if (s.id === 'pinned') desc = 'Keeps pinned tabs at the beginning of the list.';

        return `
      <div class="strategy-item">
        <div class="strategy-name">${s.label}</div>
        <div class="strategy-desc">${desc}</div>
        <button class="strategy-view-btn" data-type="sorting" data-name="${s.id}">View Logic</button>
      </div>
    `;
    }).join('');
  }

  const registryRef = document.getElementById('registry-ref');
  if (registryRef && registryRef.children.length === 0) {
      registryRef.innerHTML = `
        <div class="strategy-item">
            <div class="strategy-name">Genera Registry</div>
            <div class="strategy-desc">Static lookup table for domain classification (approx ${Object.keys(GENERA_REGISTRY).length} entries).</div>
            <button class="strategy-view-btn" data-type="registry" data-name="genera">View Table</button>
        </div>
      `;
  }
}
