import { appState } from "./state.js";
import { showModal } from "./components.js";
import { saveStrategy, renderStrategyLoadOptions, renderStrategyListTable } from "./strategies.js";
import { renderStrategyConfig, renderLiveView } from "./simulation.js";
import { getMappedTabs } from "./data.js";
import { loadTabs } from "./tabsTable.js";
import { STRATEGIES, getStrategies } from "../../shared/strategyRegistry.js";
import { CustomStrategy, RuleCondition, GroupingRule, SortingRule } from "../../shared/types.js";
import { groupTabs, setCustomStrategies } from "../../background/groupingStrategies.js";
import { sortTabs } from "../../background/sortingStrategies.js";
import { logInfo } from "../../shared/logger.js";
import { escapeHtml } from "../../shared/utils.js";

const FIELD_OPTIONS = `
                <option value="url">URL</option>
                <option value="title">Title</option>
                <option value="domain">Domain</option>
                <option value="subdomain">Subdomain</option>
                <option value="id">ID</option>
                <option value="index">Index</option>
                <option value="windowId">Window ID</option>
                <option value="groupId">Group ID</option>
                <option value="active">Active</option>
                <option value="selected">Selected</option>
                <option value="pinned">Pinned</option>
                <option value="status">Status</option>
                <option value="openerTabId">Opener ID</option>
                <option value="parentTitle">Parent Title</option>
                <option value="lastAccessed">Last Accessed</option>
                <option value="genre">Genre</option>
                <option value="context">Context Summary</option>
                <option value="contextData.siteName">Site Name</option>
                <option value="contextData.canonicalUrl">Canonical URL</option>
                <option value="contextData.normalizedUrl">Normalized URL</option>
                <option value="contextData.platform">Platform</option>
                <option value="contextData.objectType">Object Type</option>
                <option value="contextData.objectId">Object ID</option>
                <option value="contextData.title">Extracted Title</option>
                <option value="contextData.description">Description</option>
                <option value="contextData.authorOrCreator">Author/Creator</option>
                <option value="contextData.publishedAt">Published At</option>
                <option value="contextData.modifiedAt">Modified At</option>
                <option value="contextData.language">Language</option>
                <option value="contextData.isAudible">Is Audible</option>
                <option value="contextData.isMuted">Is Muted</option>
                <option value="contextData.hasUnsavedChangesLikely">Unsaved Changes</option>
                <option value="contextData.isAuthenticatedLikely">Authenticated</option>`;

const OPERATOR_OPTIONS = `
                <option value="contains">contains</option>
                <option value="doesNotContain">does not contain</option>
                <option value="matches">matches regex</option>
                <option value="equals">equals</option>
                <option value="startsWith">starts with</option>
                <option value="endsWith">ends with</option>
                <option value="exists">exists</option>
                <option value="doesNotExist">does not exist</option>
                <option value="isNull">is null</option>
                <option value="isNotNull">is not null</option>`;

export function initStrategyBuilder() {
    const addFilterGroupBtn = document.getElementById('add-filter-group-btn');
    const addGroupBtn = document.getElementById('add-group-btn');
    const addSortBtn = document.getElementById('add-sort-btn');
    const loadSelect = document.getElementById('strategy-load-select') as HTMLSelectElement | null;

    // New: Group Sorting
    const addGroupSortBtn = document.getElementById('add-group-sort-btn');
    const groupSortCheck = document.getElementById('strat-sortgroups-check');

    const saveBtn = document.getElementById('builder-save-btn');
    const runBtn = document.getElementById('builder-run-btn');
    const runLiveBtn = document.getElementById('builder-run-live-btn');
    const clearBtn = document.getElementById('builder-clear-btn');

    const exportBtn = document.getElementById('builder-export-btn');
    const importBtn = document.getElementById('builder-import-btn');

    if (exportBtn) exportBtn.addEventListener('click', exportBuilderStrategy);
    if (importBtn) importBtn.addEventListener('click', importBuilderStrategy);

    if (addFilterGroupBtn) addFilterGroupBtn.addEventListener('click', () => addFilterGroupRow());
    if (addGroupBtn) addGroupBtn.addEventListener('click', () => addBuilderRow('group'));
    if (addSortBtn) addSortBtn.addEventListener('click', () => addBuilderRow('sort'));
    if (addGroupSortBtn) addGroupSortBtn.addEventListener('click', () => addBuilderRow('groupSort'));

    if (groupSortCheck) {
        groupSortCheck.addEventListener('change', (e) => {
            const checked = (e.target as HTMLInputElement).checked;
            const container = document.getElementById('group-sort-rows-container');
            const addBtn = document.getElementById('add-group-sort-btn');
            if (container && addBtn) {
                container.style.display = checked ? 'block' : 'none';
                addBtn.style.display = checked ? 'block' : 'none';
            }
        });
    }

    if (saveBtn) saveBtn.addEventListener('click', () => saveCustomStrategyFromBuilder(true));
    if (runBtn) runBtn.addEventListener('click', runBuilderSimulation);
    if (runLiveBtn) runLiveBtn.addEventListener('click', runBuilderLive);
    if (clearBtn) clearBtn.addEventListener('click', clearBuilder);

    if (loadSelect) {
        loadSelect.addEventListener('change', () => {
            const selectedId = loadSelect.value;
            if (!selectedId) return;

            let strat = appState.localCustomStrategies.find(s => s.id === selectedId);
            if (!strat) {
                strat = getBuiltInStrategyConfig(selectedId) || undefined;
            }

            if (strat) {
                populateBuilderFromStrategy(strat);
            }
        });
    }
}

export function getBuiltInStrategyConfig(id: string): CustomStrategy | null {
    const base: CustomStrategy = {
        id: id,
        label: STRATEGIES.find(s => s.id === id)?.label || id,
        filters: [],
        groupingRules: [],
        sortingRules: [],
        groupSortingRules: [],
        fallback: 'Misc',
        sortGroups: false,
        autoRun: false
    };

    switch (id) {
        case 'domain':
            base.groupingRules = [{ source: 'field', value: 'domain', transform: 'stripTld', color: 'random' }];
            base.sortingRules = [{ field: 'domain', order: 'asc' }];
            break;
        case 'domain_full':
             base.groupingRules = [{ source: 'field', value: 'domain', transform: 'none', color: 'random' }];
             base.sortingRules = [{ field: 'domain', order: 'asc' }];
             break;
        case 'topic':
            base.groupingRules = [{ source: 'field', value: 'genre', color: 'random' }];
            break;
        case 'context':
            base.groupingRules = [{ source: 'field', value: 'context', color: 'random' }];
            break;
        case 'lineage':
            base.groupingRules = [{ source: 'field', value: 'parentTitle', color: 'random' }];
            break;
        case 'pinned':
             base.sortingRules = [{ field: 'pinned', order: 'desc' }];
             base.groupingRules = [{ source: 'field', value: 'pinned', color: 'random' }];
             break;
        case 'recency':
            base.sortingRules = [{ field: 'lastAccessed', order: 'desc' }];
            break;
        case 'age':
             base.sortingRules = [{ field: 'lastAccessed', order: 'desc' }];
             break;
        case 'url':
            base.sortingRules = [{ field: 'url', order: 'asc' }];
            break;
        case 'title':
            base.sortingRules = [{ field: 'title', order: 'asc' }];
            break;
        case 'nesting':
             base.sortingRules = [{ field: 'parentTitle', order: 'asc' }];
             break;
    }

    return base;
}

export function addFilterGroupRow(conditions?: RuleCondition[]) {
    const container = document.getElementById('filter-rows-container');
    if (!container) return;

    const groupDiv = document.createElement('div');
    groupDiv.className = 'filter-group-row';

    groupDiv.innerHTML = `
        <div class="filter-group-header">
            <span class="filter-group-title">Group (AND)</span>
            <button class="small-btn btn-del-group">Delete Group</button>
        </div>
        <div class="conditions-container"></div>
        <button class="small-btn btn-add-condition">+ Add Condition</button>
    `;

    groupDiv.querySelector('.btn-del-group')?.addEventListener('click', () => {
        groupDiv.remove();
        updateBreadcrumb();
    });

    const conditionsContainer = groupDiv.querySelector('.conditions-container') as HTMLElement;
    const addConditionBtn = groupDiv.querySelector('.btn-add-condition');

    const addCondition = (data?: RuleCondition) => {
        const div = document.createElement('div');
        div.className = 'builder-row condition-row';
        div.style.display = 'flex';
        div.style.gap = '5px';
        div.style.marginBottom = '5px';
        div.style.alignItems = 'center';

        div.innerHTML = `
            <select class="field-select">
                ${FIELD_OPTIONS}
            </select>
            <span class="operator-container">
                <select class="operator-select">
                    ${OPERATOR_OPTIONS}
                </select>
            </span>
            <span class="value-container">
                <input type="text" class="value-input" placeholder="Value">
            </span>
            <button class="small-btn btn-del-condition" style="background: none; border: none; color: red;">&times;</button>
        `;

        const fieldSelect = div.querySelector('.field-select') as HTMLSelectElement;
        const operatorContainer = div.querySelector('.operator-container') as HTMLElement;
        const valueContainer = div.querySelector('.value-container') as HTMLElement;

        const updateState = (initialOp?: string, initialVal?: string) => {
            const val = fieldSelect.value;
            // Handle boolean fields
            if (['selected', 'pinned'].includes(val)) {
                operatorContainer.innerHTML = `<select class="operator-select" disabled style="background: #eee; color: #555;"><option value="equals">is</option></select>`;
                valueContainer.innerHTML = `
                    <select class="value-input">
                        <option value="true">True</option>
                        <option value="false">False</option>
                    </select>
                `;
            } else {
                // Check if already in standard mode to avoid unnecessary DOM thrashing
                if (!operatorContainer.querySelector('select:not([disabled])')) {
                    operatorContainer.innerHTML = `<select class="operator-select">${OPERATOR_OPTIONS}</select>`;
                    valueContainer.innerHTML = `<input type="text" class="value-input" placeholder="Value">`;
                }
            }

            // Restore values if provided (especially when switching back or initializing)
            if (initialOp || initialVal) {
                 const opEl = div.querySelector('.operator-select') as HTMLInputElement | HTMLSelectElement;
                 const valEl = div.querySelector('.value-input') as HTMLInputElement | HTMLSelectElement;
                 if (opEl && initialOp) opEl.value = initialOp;
                 if (valEl && initialVal) valEl.value = initialVal;
            }

            // Re-attach listeners to new elements
            div.querySelectorAll('input, select').forEach(el => {
                el.removeEventListener('change', updateBreadcrumb);
                el.removeEventListener('input', updateBreadcrumb);
                el.addEventListener('change', updateBreadcrumb);
                el.addEventListener('input', updateBreadcrumb);
            });
        };

        fieldSelect.addEventListener('change', () => {
            updateState();
            updateBreadcrumb();
        });

        if (data) {
            fieldSelect.value = data.field;
            updateState(data.operator, data.value);
        } else {
            updateState();
        }

        div.querySelector('.btn-del-condition')?.addEventListener('click', () => {
            div.remove();
            updateBreadcrumb();
        });

        conditionsContainer.appendChild(div);
    };

    addConditionBtn?.addEventListener('click', () => addCondition());

    if (conditions && conditions.length > 0) {
        conditions.forEach(c => addCondition(c));
    } else {
        // Add one empty condition by default
        addCondition();
    }

    container.appendChild(groupDiv);
    updateBreadcrumb();
}

export function addBuilderRow(type: 'group' | 'sort' | 'groupSort', data?: any) {
    let containerId = '';
    if (type === 'group') containerId = 'group-rows-container';
    else if (type === 'sort') containerId = 'sort-rows-container';
    else if (type === 'groupSort') containerId = 'group-sort-rows-container';

    const container = document.getElementById(containerId);
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'builder-row';
    div.dataset.type = type;

    if (type === 'group') {
        div.style.flexWrap = 'wrap';
        div.innerHTML = `
            <span class="row-number"></span>
            <select class="source-select">
                <option value="field">Field</option>
                <option value="fixed">Fixed Value</option>
            </select>

            <span class="input-container">
                 <!-- Will be populated based on source selection -->
                 <select class="field-select value-input-field">
                    ${FIELD_OPTIONS}
                 </select>
                 <input type="text" class="value-input-text" placeholder="Group Name" style="display:none;">
            </span>

            <span style="margin-left: 10px;">Transform:</span>
            <select class="transform-select">
                <option value="none">None</option>
                <option value="stripTld">Strip TLD</option>
                <option value="domain">Get Domain</option>
                <option value="hostname">Get Hostname</option>
                <option value="lowercase">Lowercase</option>
                <option value="uppercase">Uppercase</option>
                <option value="firstChar">First Char</option>
                <option value="regex">Regex Extraction</option>
                <option value="regexReplace">Regex Replace</option>
            </select>

            <div class="regex-container" style="display:none; flex-basis: 100%; margin-top: 8px; padding: 8px; background: #f8f9fa; border: 1px dashed #ced4da; border-radius: 4px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                    <span style="font-weight: 500; font-size: 0.9em;">Pattern:</span>
                    <input type="text" class="transform-pattern" placeholder="e.g. ^(\w+)-(\d+)$" style="flex:1;">
                    <span title="For extraction: Captures all groups and concatenates them. Example: 'user-(\d+)' -> '123'. For replacement: Standard JS regex." style="cursor: help; color: #007bff; font-weight: bold; background: #e7f1ff; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 12px;">?</span>
                </div>
                <div class="replacement-container" style="display:none; align-items: center; gap: 8px; margin-bottom: 5px;">
                    <span style="font-weight: 500; font-size: 0.9em;">Replace:</span>
                    <input type="text" class="transform-replacement" placeholder="e.g. $2 $1" style="flex:1;">
                </div>
                <div style="display: flex; gap: 8px; align-items: center; font-size: 0.9em;">
                    <span style="font-weight: 500;">Test:</span>
                    <input type="text" class="regex-test-input" placeholder="Test String" style="flex: 1;">
                    <span>&rarr;</span>
                    <span class="regex-test-result" style="font-family: monospace; background: white; padding: 2px 5px; border: 1px solid #ddd; border-radius: 3px; min-width: 60px;">(preview)</span>
                </div>
            </div>

            <span style="margin-left: 10px;">Window:</span>
            <select class="window-mode-select">
                <option value="current">Current</option>
                <option value="compound">Compound</option>
                <option value="new">New</option>
            </select>

            <span style="margin-left: 10px;">Color:</span>
            <select class="color-input">
                <option value="grey">Grey</option>
                <option value="blue">Blue</option>
                <option value="red">Red</option>
                <option value="yellow">Yellow</option>
                <option value="green">Green</option>
                <option value="pink">Pink</option>
                <option value="purple">Purple</option>
                <option value="cyan">Cyan</option>
                <option value="orange">Orange</option>
                <option value="match">Match Value</option>
                <option value="field">Color by Field</option>
            </select>
            <select class="color-field-select" style="display:none;">
                ${FIELD_OPTIONS}
            </select>
            <span class="color-transform-container" style="display:none; margin-left: 5px; align-items: center;">
                <span style="font-size: 0.9em; margin-right: 3px;">Trans:</span>
                <select class="color-transform-select">
                    <option value="none">None</option>
                    <option value="stripTld">Strip TLD</option>
                    <option value="domain">Get Domain</option>
                    <option value="hostname">Get Hostname</option>
                    <option value="lowercase">Lowercase</option>
                    <option value="uppercase">Uppercase</option>
                    <option value="firstChar">First Char</option>
                    <option value="regex">Regex</option>
                </select>
                <input type="text" class="color-transform-pattern" placeholder="Regex" style="display:none; width: 80px; margin-left: 3px;">
            </span>
            <label><input type="checkbox" class="random-color-check" checked> Random</label>

            <div class="row-actions">
                <button class="small-btn btn-del" style="background: #ffcccc; color: darkred;">Delete</button>
            </div>
        `;

        // Add specific listeners for Group row
        const sourceSelect = div.querySelector('.source-select') as HTMLSelectElement;
        const fieldSelect = div.querySelector('.value-input-field') as HTMLElement;
        const textInput = div.querySelector('.value-input-text') as HTMLElement;
        const colorInput = div.querySelector('.color-input') as HTMLSelectElement;
        const colorFieldSelect = div.querySelector('.color-field-select') as HTMLSelectElement;
        const colorTransformContainer = div.querySelector('.color-transform-container') as HTMLElement;
        const colorTransformSelect = div.querySelector('.color-transform-select') as HTMLSelectElement;
        const colorTransformPattern = div.querySelector('.color-transform-pattern') as HTMLInputElement;
        const randomCheck = div.querySelector('.random-color-check') as HTMLInputElement;

        // Regex Logic
        const transformSelect = div.querySelector('.transform-select') as HTMLSelectElement;
        const regexContainer = div.querySelector('.regex-container') as HTMLElement;
        const patternInput = div.querySelector('.transform-pattern') as HTMLInputElement;
        const replacementInput = div.querySelector('.transform-replacement') as HTMLInputElement;
        const testInput = div.querySelector('.regex-test-input') as HTMLInputElement;
        const testResult = div.querySelector('.regex-test-result') as HTMLElement;

        const toggleTransform = () => {
            const val = transformSelect.value;
            if (val === 'regex' || val === 'regexReplace') {
                regexContainer.style.display = 'block';
                const repContainer = div.querySelector('.replacement-container') as HTMLElement;
                if (repContainer) {
                    repContainer.style.display = val === 'regexReplace' ? 'flex' : 'none';
                }
            } else {
                regexContainer.style.display = 'none';
            }
            updateBreadcrumb();
        };
        transformSelect.addEventListener('change', toggleTransform);

        const updateTest = () => {
            const pat = patternInput.value;
            const txt = testInput.value;
            if (!pat || !txt) {
                 testResult.textContent = "(preview)";
                 testResult.style.color = "#555";
                 return;
            }
            try {
                if (transformSelect.value === 'regexReplace') {
                    const rep = replacementInput.value || "";
                    const res = txt.replace(new RegExp(pat, 'g'), rep);
                    testResult.textContent = res;
                    testResult.style.color = "green";
                } else {
                    const regex = new RegExp(pat);
                    const match = regex.exec(txt);
                    if (match) {
                         let extracted = "";
                         for (let i = 1; i < match.length; i++) {
                             extracted += match[i] || "";
                         }
                         testResult.textContent = extracted || "(empty group)";
                         testResult.style.color = "green";
                    } else {
                         testResult.textContent = "(no match)";
                         testResult.style.color = "red";
                    }
                }
            } catch (e) {
                testResult.textContent = "(invalid regex)";
                testResult.style.color = "red";
            }
        };
        patternInput.addEventListener('input', () => { updateTest(); updateBreadcrumb(); });
        if (replacementInput) {
            replacementInput.addEventListener('input', () => { updateTest(); updateBreadcrumb(); });
        }
        testInput.addEventListener('input', updateTest);


        // Toggle input type
        const toggleInput = () => {
            if (sourceSelect.value === 'field') {
                fieldSelect.style.display = 'inline-block';
                textInput.style.display = 'none';
            } else {
                fieldSelect.style.display = 'none';
                textInput.style.display = 'inline-block';
            }
            updateBreadcrumb();
        };
        sourceSelect.addEventListener('change', toggleInput);

        // Toggle color transform pattern
        const toggleColorTransform = () => {
             if (colorTransformSelect.value === 'regex') {
                 colorTransformPattern.style.display = 'inline-block';
             } else {
                 colorTransformPattern.style.display = 'none';
             }
             updateBreadcrumb();
        };
        colorTransformSelect.addEventListener('change', toggleColorTransform);
        colorTransformPattern.addEventListener('input', updateBreadcrumb);

        // Toggle color input
        const toggleColor = () => {
            if (randomCheck.checked) {
                colorInput.disabled = true;
                colorInput.style.opacity = '0.5';
                colorFieldSelect.style.display = 'none';
                colorTransformContainer.style.display = 'none';
            } else {
                colorInput.disabled = false;
                colorInput.style.opacity = '1';
                if (colorInput.value === 'field') {
                    colorFieldSelect.style.display = 'inline-block';
                    colorTransformContainer.style.display = 'inline-flex';
                } else {
                    colorFieldSelect.style.display = 'none';
                    colorTransformContainer.style.display = 'none';
                }
            }
        };
        randomCheck.addEventListener('change', toggleColor);
        colorInput.addEventListener('change', toggleColor);
        toggleColor(); // init

    } else if (type === 'sort' || type === 'groupSort') {
        div.innerHTML = `
            <select class="field-select">
                ${FIELD_OPTIONS}
            </select>
            <select class="order-select">
                <option value="asc">a to z (asc)</option>
                <option value="desc">z to a (desc)</option>
            </select>
            <div class="row-actions">
                 <button class="small-btn btn-del" style="background: #ffcccc; color: darkred;">Delete</button>
            </div>
        `;
    }

    // Populate data if provided (for editing)
    if (data) {
        if (type === 'group') {
            const sourceSelect = div.querySelector('.source-select') as HTMLSelectElement;
            const fieldSelect = div.querySelector('.value-input-field') as HTMLSelectElement;
            const textInput = div.querySelector('.value-input-text') as HTMLInputElement;
            const transformSelect = div.querySelector('.transform-select') as HTMLSelectElement;
            const colorInput = div.querySelector('.color-input') as HTMLSelectElement;
            const colorFieldSelect = div.querySelector('.color-field-select') as HTMLSelectElement;
            const colorTransformSelect = div.querySelector('.color-transform-select') as HTMLSelectElement;
            const colorTransformPattern = div.querySelector('.color-transform-pattern') as HTMLInputElement;
            const randomCheck = div.querySelector('.random-color-check') as HTMLInputElement;
            const windowModeSelect = div.querySelector('.window-mode-select') as HTMLSelectElement;

            if (data.source) sourceSelect.value = data.source;

            // Trigger toggle to show correct input
            sourceSelect.dispatchEvent(new Event('change'));

            if (data.source === 'field') {
                if (data.value) fieldSelect.value = data.value;
            } else {
                if (data.value) textInput.value = data.value;
            }

            if (data.transform) transformSelect.value = data.transform;
            if (data.transformPattern) (div.querySelector('.transform-pattern') as HTMLInputElement).value = data.transformPattern;
            if (data.transformReplacement) (div.querySelector('.transform-replacement') as HTMLInputElement).value = data.transformReplacement;

            // Trigger toggle for regex UI
            transformSelect.dispatchEvent(new Event('change'));

            if (data.windowMode) windowModeSelect.value = data.windowMode;

            if (data.color && data.color !== 'random') {
                randomCheck.checked = false;
                colorInput.value = data.color;
                if (data.color === 'field' && data.colorField) {
                    colorFieldSelect.value = data.colorField;
                    if (data.colorTransform) {
                         colorTransformSelect.value = data.colorTransform;
                         if (data.colorTransformPattern) colorTransformPattern.value = data.colorTransformPattern;
                    }
                }
            } else {
                randomCheck.checked = true;
            }
             // Trigger toggle color
            randomCheck.dispatchEvent(new Event('change'));
            colorTransformSelect.dispatchEvent(new Event('change'));
        } else if (type === 'sort' || type === 'groupSort') {
             if (data.field) (div.querySelector('.field-select') as HTMLSelectElement).value = data.field;
             if (data.order) (div.querySelector('.order-select') as HTMLSelectElement).value = data.order;
        }
    }

    // Listeners (General)
    div.querySelector('.btn-del')?.addEventListener('click', () => {
        div.remove();
        updateBreadcrumb();
    });

    // AND / OR listeners (Visual mainly, or appending new rows)
    div.querySelector('.btn-and')?.addEventListener('click', () => {
        addBuilderRow(type); // Just add another row
    });

    div.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('change', updateBreadcrumb);
        el.addEventListener('input', updateBreadcrumb);
    });

    container.appendChild(div);
    updateBreadcrumb();
}

export function clearBuilder() {
    (document.getElementById('strat-name') as HTMLInputElement).value = '';
    (document.getElementById('strat-desc') as HTMLInputElement).value = '';

    (document.getElementById('strat-autorun') as HTMLInputElement).checked = false;
    (document.getElementById('strat-separate-window') as HTMLInputElement).checked = false;

    const sortGroupsCheck = (document.getElementById('strat-sortgroups-check') as HTMLInputElement);
    if (sortGroupsCheck) {
        sortGroupsCheck.checked = false;
        // Trigger change to hide container
        sortGroupsCheck.dispatchEvent(new Event('change'));
    }

    const loadSelect = document.getElementById('strategy-load-select') as HTMLSelectElement;
    if (loadSelect) loadSelect.value = '';

    ['filter-rows-container', 'group-rows-container', 'sort-rows-container', 'group-sort-rows-container'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });

    const builderResults = document.getElementById('builder-results');
    if (builderResults) builderResults.innerHTML = '';

    addFilterGroupRow(); // Reset with one empty filter group
    updateBreadcrumb();
}

export function updateBreadcrumb() {
    const breadcrumb = document.getElementById('strategy-breadcrumb');
    if (!breadcrumb) return;

    let text = 'All';

    // Filters
    const filters = document.getElementById('filter-rows-container')?.querySelectorAll('.builder-row');
    if (filters && filters.length > 0) {
        filters.forEach(row => {
             const field = (row.querySelector('.field-select') as HTMLSelectElement).value;
             const op = (row.querySelector('.operator-select') as HTMLSelectElement).value;
             const val = (row.querySelector('.value-input') as HTMLInputElement).value;
             if (val) text += ` > ${field} ${op} ${val}`;
        });
    }

    // Groups
    const groups = document.getElementById('group-rows-container')?.querySelectorAll('.builder-row');
    if (groups && groups.length > 0) {
        groups.forEach(row => {
             const source = (row.querySelector('.source-select') as HTMLSelectElement).value;
             let val = "";
             if (source === 'field') {
                 val = (row.querySelector('.value-input-field') as HTMLSelectElement).value;
                 text += ` > Group by Field: ${val}`;
             } else {
                 val = (row.querySelector('.value-input-text') as HTMLInputElement).value;
                 text += ` > Group by Name: "${val}"`;
             }
        });
    }

    // Group Sorts
    const groupSorts = document.getElementById('group-sort-rows-container')?.querySelectorAll('.builder-row');
    if (groupSorts && groupSorts.length > 0) {
        groupSorts.forEach(row => {
            const field = (row.querySelector('.field-select') as HTMLSelectElement).value;
            const order = (row.querySelector('.order-select') as HTMLSelectElement).value;
            text += ` > Group sort by ${field} (${order})`;
        });
    }

    // Sorts
    const sorts = document.getElementById('sort-rows-container')?.querySelectorAll('.builder-row');
    if (sorts && sorts.length > 0) {
        sorts.forEach(row => {
             const field = (row.querySelector('.field-select') as HTMLSelectElement).value;
             const order = (row.querySelector('.order-select') as HTMLSelectElement).value;
             text += ` > Sort by ${field} (${order})`;
        });
    }

    breadcrumb.textContent = text;
}

export function getBuilderStrategy(ignoreValidation: boolean = false): CustomStrategy | null {
    const idInput = document.getElementById('strat-name') as HTMLInputElement;
    const labelInput = document.getElementById('strat-desc') as HTMLInputElement;

    let id = idInput ? idInput.value.trim() : '';
    let label = labelInput ? labelInput.value.trim() : '';
    const fallback = 'Misc'; // Fallback removed from UI, default to Misc
    const sortGroups = (document.getElementById('strat-sortgroups-check') as HTMLInputElement).checked;

    if (!ignoreValidation && (!id || !label)) {
        return null;
    }

    if (ignoreValidation) {
        if (!id) id = 'temp_sim_id';
        if (!label) label = 'Simulation';
    }

    const filterGroups: RuleCondition[][] = [];
    const filterContainer = document.getElementById('filter-rows-container');

    // Parse filter groups
    if (filterContainer) {
        const groupRows = filterContainer.querySelectorAll('.filter-group-row');
        if (groupRows.length > 0) {
            groupRows.forEach(groupRow => {
                const conditions: RuleCondition[] = [];
                groupRow.querySelectorAll('.builder-row').forEach(row => {
                    const field = (row.querySelector('.field-select') as HTMLSelectElement).value;
                    const operator = (row.querySelector('.operator-select') as HTMLSelectElement).value as any;
                    const value = (row.querySelector('.value-input') as HTMLInputElement).value;
                    // Only add if value is present or operator doesn't require it
                    if (value || ['exists', 'doesNotExist', 'isNull', 'isNotNull'].includes(operator)) {
                        conditions.push({ field, operator, value });
                    }
                });
                if (conditions.length > 0) {
                    filterGroups.push(conditions);
                }
            });
        }
    }

    // For backward compatibility / simple strategies, populate filters with the first group
    const filters: RuleCondition[] = filterGroups.length > 0 ? filterGroups[0] : [];

    const groupingRules: GroupingRule[] = [];
    document.getElementById('group-rows-container')?.querySelectorAll('.builder-row').forEach(row => {
        const source = (row.querySelector('.source-select') as HTMLSelectElement).value as "field" | "fixed";
        let value = "";
        if (source === 'field') {
            value = (row.querySelector('.value-input-field') as HTMLSelectElement).value;
        } else {
            value = (row.querySelector('.value-input-text') as HTMLInputElement).value;
        }

        const transform = (row.querySelector('.transform-select') as HTMLSelectElement).value as any;
        const transformPattern = (row.querySelector('.transform-pattern') as HTMLInputElement).value;
        const transformReplacement = (row.querySelector('.transform-replacement') as HTMLInputElement).value;
        const windowMode = (row.querySelector('.window-mode-select') as HTMLSelectElement).value as any;

        const randomCheck = row.querySelector('.random-color-check') as HTMLInputElement;
        const colorInput = row.querySelector('.color-input') as HTMLSelectElement;
        const colorFieldSelect = row.querySelector('.color-field-select') as HTMLSelectElement;
        const colorTransformSelect = row.querySelector('.color-transform-select') as HTMLSelectElement;
        const colorTransformPattern = row.querySelector('.color-transform-pattern') as HTMLInputElement;

        let color = 'random';
        let colorField: string | undefined;
        let colorTransform: string | undefined;
        let colorTransformPatternValue: string | undefined;

        if (!randomCheck.checked) {
            color = colorInput.value;
            if (color === 'field') {
                colorField = colorFieldSelect.value;
                colorTransform = colorTransformSelect.value as any;
                if (colorTransform === 'regex') {
                    colorTransformPatternValue = colorTransformPattern.value;
                }
            }
        }

        if (value) {
            groupingRules.push({
                source,
                value,
                color,
                colorField,
                colorTransform: colorTransform as any,
                colorTransformPattern: colorTransformPatternValue,
                transform,
                transformPattern: (transform === 'regex' || transform === 'regexReplace') ? transformPattern : undefined,
                transformReplacement: transform === 'regexReplace' ? transformReplacement : undefined,
                windowMode
            });
        }
    });

    const sortingRules: SortingRule[] = [];
    document.getElementById('sort-rows-container')?.querySelectorAll('.builder-row').forEach(row => {
        const field = (row.querySelector('.field-select') as HTMLSelectElement).value;
        const order = (row.querySelector('.order-select') as HTMLSelectElement).value as any;
        sortingRules.push({ field, order });
    });

    const groupSortingRules: SortingRule[] = [];
    document.getElementById('group-sort-rows-container')?.querySelectorAll('.builder-row').forEach(row => {
        const field = (row.querySelector('.field-select') as HTMLSelectElement).value;
        const order = (row.querySelector('.order-select') as HTMLSelectElement).value as any;
        groupSortingRules.push({ field, order });
    });
    const appliedGroupSortingRules = sortGroups ? groupSortingRules : [];

    return {
        id,
        label,
        filters,
        filterGroups,
        groupingRules,
        sortingRules,
        groupSortingRules: appliedGroupSortingRules,
        fallback,
        sortGroups
    };
}

export function runBuilderSimulation() {
    // Pass true to ignore validation so we can simulate without ID/Label
    const strat = getBuilderStrategy(true);
    const resultContainer = document.getElementById('builder-results');
    const newStatePanel = document.getElementById('new-state-panel');

    if (!strat) return; // Should not happen with ignoreValidation=true

    logInfo("Running builder simulation", { strategy: strat.id });

    // For simulation, we can mock an ID/Label if missing
    const simStrat: CustomStrategy = strat;

    if (!resultContainer || !newStatePanel) return;

    // Show the panel
    newStatePanel.style.display = 'flex';

    // Update localCustomStrategies temporarily for Sim
    const originalStrategies = [...appState.localCustomStrategies];

    try {
        // Replace or add
        const existingIdx = appState.localCustomStrategies.findIndex(s => s.id === simStrat.id);
        if (existingIdx !== -1) {
            appState.localCustomStrategies[existingIdx] = simStrat;
        } else {
            appState.localCustomStrategies.push(simStrat);
        }
        setCustomStrategies(appState.localCustomStrategies);

        // Run Logic
        let tabs = getMappedTabs();

        if (tabs.length === 0) {
            resultContainer.innerHTML = '<p>No tabs found to simulate.</p>';
            return;
        }

        // Apply Simulated Selection Override
        if (appState.simulatedSelection.size > 0) {
            tabs = tabs.map(t => ({
                ...t,
                selected: appState.simulatedSelection.has(t.id)
            }));
        }

        // Sort using this strategy?
        // sortTabs expects SortingStrategy[].
        // If we use this strategy for sorting...
        tabs = sortTabs(tabs, [simStrat.id]);

        // Group using this strategy
        const groups = groupTabs(tabs, [simStrat.id]);

        // Check if we should show a fallback result (e.g. Sort Only)
        // If no groups were created, but we have tabs, and the strategy is not a grouping strategy,
        // we show the tabs as a single list.
        if (groups.length === 0) {
            const stratDef = getStrategies(appState.localCustomStrategies).find(s => s.id === simStrat.id);
            if (stratDef && !stratDef.isGrouping) {
                groups.push({
                    id: 'sim-sorted',
                    windowId: 0,
                    label: 'Sorted Results (No Grouping)',
                    color: 'grey',
                    tabs: tabs,
                    reason: 'Sort Only'
                });
            }
        }

        // Render Results
        if (groups.length === 0) {
            resultContainer.innerHTML = '<p>No groups created.</p>';
            return;
        }

        resultContainer.innerHTML = groups.map(group => `
    <div class="group-result" style="margin-bottom: 10px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden;">
      <div class="group-header" style="border-left: 5px solid ${group.color}; padding: 5px; background: #f8f9fa; font-size: 0.9em; font-weight: bold; display: flex; justify-content: space-between;">
        <span>${escapeHtml(group.label || 'Ungrouped')}</span>
        <span class="group-meta" style="font-weight: normal; font-size: 0.8em; color: #666;">${group.tabs.length}</span>
      </div>
      <ul class="group-tabs" style="list-style: none; margin: 0; padding: 0;">
        ${group.tabs.map(tab => `
          <li class="group-tab-item" style="padding: 4px 5px; border-top: 1px solid #eee; display: flex; gap: 5px; align-items: center; font-size: 0.85em;">
            <div style="width: 12px; height: 12px; background: #eee; border-radius: 2px; flex-shrink: 0;">
                ${tab.favIconUrl ? `<img src="${escapeHtml(tab.favIconUrl)}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'">` : ''}
            </div>
            <span class="title-cell" title="${escapeHtml(tab.title)}" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(tab.title)}</span>
          </li>
        `).join('')}
      </ul>
    </div>
  `).join('');
    } catch (e) {
        console.error("Simulation failed", e);
        resultContainer.innerHTML = `<p style="color: red;">Simulation failed: ${e}</p>`;
        alert("Simulation failed: " + e);
    } finally {
        // Restore strategies
        appState.localCustomStrategies = originalStrategies;
        setCustomStrategies(appState.localCustomStrategies);
    }
}

export async function saveCustomStrategyFromBuilder(showSuccess = true): Promise<boolean> {
    const strat = getBuilderStrategy();
    if (!strat) {
        alert("Please fill in ID and Label.");
        return false;
    }
    return saveStrategy(strat, showSuccess);
}

export async function runBuilderLive() {
    const strat = getBuilderStrategy();
    if (!strat) {
        alert("Please fill in ID and Label to run live.");
        return;
    }

    logInfo("Applying strategy live", { id: strat.id });

    // Save silently first to ensure backend has the definition
    const saved = await saveStrategy(strat, false);
    if (!saved) return;

    try {
        const response = await chrome.runtime.sendMessage({
            type: 'applyGrouping',
            payload: {
                sorting: [strat.id]
            }
        });

        if (response && response.ok) {
            alert("Applied successfully!");
            loadTabs();
        } else {
            alert("Failed to apply: " + (response.error || 'Unknown error'));
        }
    } catch (e) {
        console.error("Apply failed", e);
        alert("Apply failed: " + e);
    }
}

export function populateBuilderFromStrategy(strat: CustomStrategy) {
    (document.getElementById('strat-name') as HTMLInputElement).value = strat.id;
    (document.getElementById('strat-desc') as HTMLInputElement).value = strat.label;

    const sortGroupsCheck = (document.getElementById('strat-sortgroups-check') as HTMLInputElement);
    const hasGroupSort = !!(strat.groupSortingRules && strat.groupSortingRules.length > 0) || !!strat.sortGroups;
    sortGroupsCheck.checked = hasGroupSort;
    sortGroupsCheck.dispatchEvent(new Event('change'));

    const autoRunCheck = (document.getElementById('strat-autorun') as HTMLInputElement);
    autoRunCheck.checked = !!strat.autoRun;

    ['filter-rows-container', 'group-rows-container', 'sort-rows-container', 'group-sort-rows-container'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });

    if (strat.filterGroups && strat.filterGroups.length > 0) {
        strat.filterGroups.forEach(g => addFilterGroupRow(g));
    } else if (strat.filters && strat.filters.length > 0) {
        addFilterGroupRow(strat.filters);
    }

    strat.groupingRules?.forEach(g => addBuilderRow('group', g));
    strat.sortingRules?.forEach(s => addBuilderRow('sort', s));
    strat.groupSortingRules?.forEach(gs => addBuilderRow('groupSort', gs));

    document.querySelector('#view-strategies')?.scrollIntoView({ behavior: 'smooth' });
    updateBreadcrumb();
}

export function exportBuilderStrategy() {
    const strat = getBuilderStrategy();
    if (!strat) {
        alert("Please define a strategy to export (ID and Label required).");
        return;
    }
    logInfo("Exporting strategy", { id: strat.id });
    const json = JSON.stringify(strat, null, 2);
    const content = `
        <p>Copy the JSON below:</p>
        <textarea style="width: 100%; height: 300px; font-family: monospace;">${escapeHtml(json)}</textarea>
    `;
    showModal("Export Strategy", content);
}

export function importBuilderStrategy() {
    const content = document.createElement('div');
    content.innerHTML = `
        <p>Paste Strategy JSON below:</p>
        <textarea id="import-strat-area" style="width: 100%; height: 200px; font-family: monospace; margin-bottom: 10px;"></textarea>
        <button id="import-strat-confirm" class="success-btn">Load</button>
    `;

    const btn = content.querySelector('#import-strat-confirm');
    btn?.addEventListener('click', () => {
        const txt = (content.querySelector('#import-strat-area') as HTMLTextAreaElement).value;
        try {
            const json = JSON.parse(txt);
            if (!json.id || !json.label) {
                alert("Invalid strategy: ID and Label are required.");
                return;
            }
            logInfo("Importing strategy", { id: json.id });
            populateBuilderFromStrategy(json);
            document.querySelector('.modal-overlay')?.remove();
        } catch(e) {
            alert("Invalid JSON: " + e);
        }
    });

    showModal("Import Strategy", content);
}
