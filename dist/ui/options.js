const primarySelect = document.getElementById("primaryGrouping");
const secondarySelect = document.getElementById("secondaryGrouping");
const autoGroupCheckbox = document.getElementById("autoGroup");
const sortPinned = document.getElementById("sortPinned");
const sortRecency = document.getElementById("sortRecency");
const sortHierarchy = document.getElementById("sortHierarchy");
const debugMode = document.getElementById("debugMode");
const saveButton = document.getElementById("save");
const toast = document.getElementById("toast");
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
    const response = (await chrome.runtime.sendMessage({ type: "loadPreferences" }));
    if (!response.ok || !response.data)
        return;
    const prefs = response.data;
    primarySelect.value = prefs.primaryGrouping;
    secondarySelect.value = prefs.secondaryGrouping;
    autoGroupCheckbox.checked = prefs.autoGroupNewTabs;
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
    ].filter(Boolean);
    const prefs = {
        primaryGrouping: primarySelect.value,
        secondaryGrouping: secondarySelect.value,
        sorting: sorting.length ? sorting : ["pinned", "recency"],
        autoGroupNewTabs: autoGroupCheckbox.checked,
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
export {};
