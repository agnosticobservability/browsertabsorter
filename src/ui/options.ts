import { Preferences } from "../shared/types.js";

const primarySelect = document.getElementById("primaryGrouping") as HTMLSelectElement;
const secondarySelect = document.getElementById("secondaryGrouping") as HTMLSelectElement;
const sortPinned = document.getElementById("sortPinned") as HTMLInputElement;
const sortRecency = document.getElementById("sortRecency") as HTMLInputElement;
const sortHierarchy = document.getElementById("sortHierarchy") as HTMLInputElement;
const debugMode = document.getElementById("debugMode") as HTMLInputElement;
const saveButton = document.getElementById("save") as HTMLButtonElement;
const toast = document.getElementById("toast") as HTMLElement;

const populateOptions = () => {
  [primarySelect, secondarySelect].forEach((select) => {
    ["domain", "semantic", "navigation"].forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  });
};

const loadPreferences = async () => {
  const response = (await chrome.runtime.sendMessage({ type: "loadPreferences" })) as {
    ok: boolean;
    data?: Preferences;
  };
  if (!response.ok || !response.data) return;
  const prefs = response.data;
  primarySelect.value = prefs.primaryGrouping;
  secondarySelect.value = prefs.secondaryGrouping;
  sortPinned.checked = prefs.sorting.includes("pinned");
  sortRecency.checked = prefs.sorting.includes("recency");
  sortHierarchy.checked = prefs.sorting.includes("hierarchy");
  debugMode.checked = prefs.debug;
};

const savePreferences = async () => {
  const sorting = [
    sortPinned.checked ? "pinned" : null,
    sortRecency.checked ? "recency" : null,
    sortHierarchy.checked ? "hierarchy" : null
  ].filter(Boolean) as Preferences["sorting"];

  const prefs: Preferences = {
    primaryGrouping: primarySelect.value as Preferences["primaryGrouping"],
    secondaryGrouping: secondarySelect.value as Preferences["secondaryGrouping"],
    sorting: sorting.length ? sorting : ["pinned", "recency"],
    debug: debugMode.checked
  };

  const response = await chrome.runtime.sendMessage({ type: "savePreferences", payload: prefs });
  if (response.ok) {
    toast.textContent = "Saved preferences";
    setTimeout(() => (toast.textContent = ""), 2000);
  }
};

populateOptions();
loadPreferences();
saveButton.addEventListener("click", savePreferences);
