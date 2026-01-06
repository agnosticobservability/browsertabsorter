import { CustomGroupingRule, CustomGroupingStrategy, MatchType, Preferences, RuntimeMessage, RuntimeResponse } from "../shared/types.js";

const strategiesList = document.getElementById("strategies-list") as HTMLDivElement;
const addBtn = document.getElementById("add-strategy-btn") as HTMLButtonElement;
const form = document.getElementById("new-strategy-form") as HTMLDivElement;
const saveBtn = document.getElementById("save-strategy-btn") as HTMLButtonElement;
const cancelBtn = document.getElementById("cancel-strategy-btn") as HTMLButtonElement;
const nameInput = document.getElementById("strategy-name") as HTMLInputElement;
const rulesInput = document.getElementById("strategy-rules") as HTMLTextAreaElement;

let currentPreferences: Preferences | null = null;
let editingId: string | null = null;

const loadPreferences = async () => {
  const response = await chrome.runtime.sendMessage({ type: "loadPreferences" }) as RuntimeResponse<Preferences>;
  if (response.ok && response.data) {
    currentPreferences = response.data;
    renderStrategies();
  }
};

const renderStrategies = () => {
  if (!strategiesList || !currentPreferences) return;
  strategiesList.innerHTML = "";

  if (currentPreferences.customGroupingStrategies.length === 0) {
    strategiesList.innerHTML = "<p>No custom strategies defined.</p>";
    return;
  }

  currentPreferences.customGroupingStrategies.forEach(strategy => {
    const div = document.createElement("div");
    div.className = "strategy-card";
    div.innerHTML = `
      <div class="strategy-header">
        <strong>${escapeHtml(strategy.name)}</strong>
        <div>
          <button class="btn edit-btn" data-id="${strategy.id}">Edit</button>
          <button class="btn btn-danger delete-btn" data-id="${strategy.id}">Delete</button>
        </div>
      </div>
      <div style="font-size: 0.9em; color: #bbb;">
        ${strategy.rules.length} rule(s) defined.
      </div>
    `;
    strategiesList.appendChild(div);
  });

  document.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = (e.target as HTMLElement).dataset.id;
      if (id) startEditing(id);
    });
  });

  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = (e.target as HTMLElement).dataset.id;
      if (id && confirm("Are you sure you want to delete this strategy?")) deleteStrategy(id);
    });
  });
};

const escapeHtml = (text: string) => {
  const div = document.createElement("div");
  div.innerText = text;
  return div.innerHTML;
};

const parseRules = (text: string): CustomGroupingRule[] => {
  const lines = text.split("\n");
  const rules: CustomGroupingRule[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Format: TYPE: PATTERN => TARGET
    const arrowSplit = trimmed.split("=>");
    if (arrowSplit.length !== 2) continue;

    const target = arrowSplit[1].trim();
    const leftPart = arrowSplit[0].trim();

    const colonIndex = leftPart.indexOf(":");
    if (colonIndex === -1) continue;

    const typeStr = leftPart.substring(0, colonIndex).trim().toLowerCase();
    const pattern = leftPart.substring(colonIndex + 1).trim();

    if (["domain", "url-contains", "title-contains", "regex"].includes(typeStr)) {
      rules.push({
        type: typeStr as MatchType,
        pattern,
        target
      });
    }
  }
  return rules;
};

const formatRules = (rules: CustomGroupingRule[]): string => {
  return rules.map(r => `${r.type}: ${r.pattern} => ${r.target}`).join("\n");
};

const startEditing = (id?: string) => {
  editingId = id || null;
  form.style.display = "block";
  addBtn.style.display = "none";

  if (id && currentPreferences) {
    const strategy = currentPreferences.customGroupingStrategies.find(s => s.id === id);
    if (strategy) {
      nameInput.value = strategy.name;
      rulesInput.value = formatRules(strategy.rules);
    }
  } else {
    nameInput.value = "";
    rulesInput.value = "";
  }
};

const saveStrategy = async () => {
  if (!currentPreferences) return;

  const name = nameInput.value.trim();
  const rulesText = rulesInput.value;
  const rules = parseRules(rulesText);

  if (!name) {
    alert("Please enter a strategy name.");
    return;
  }
  if (rules.length === 0) {
    alert("Please define at least one valid rule.");
    return;
  }

  const newStrategy: CustomGroupingStrategy = {
    id: editingId || `custom-${Date.now()}`,
    name,
    rules
  };

  let strategies = [...currentPreferences.customGroupingStrategies];
  if (editingId) {
    strategies = strategies.map(s => s.id === editingId ? newStrategy : s);
  } else {
    strategies.push(newStrategy);
  }

  await chrome.runtime.sendMessage({
    type: "savePreferences",
    payload: { customGroupingStrategies: strategies }
  });

  loadPreferences();
  form.style.display = "none";
  addBtn.style.display = "inline-block";
  editingId = null;
};

const deleteStrategy = async (id: string) => {
  if (!currentPreferences) return;
  const strategies = currentPreferences.customGroupingStrategies.filter(s => s.id !== id);
  await chrome.runtime.sendMessage({
    type: "savePreferences",
    payload: { customGroupingStrategies: strategies }
  });
  loadPreferences();
};

addBtn.addEventListener("click", () => startEditing());
cancelBtn.addEventListener("click", () => {
  form.style.display = "none";
  addBtn.style.display = "inline-block";
  editingId = null;
});
saveBtn.addEventListener("click", saveStrategy);

// Initial Load
loadPreferences();
