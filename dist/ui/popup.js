const refreshButton = document.getElementById("refresh");
const saveButton = document.getElementById("saveSession");
const sessionNameInput = document.getElementById("sessionName");
const fetchState = async () => {
    const response = await chrome.runtime.sendMessage({ type: "getState" });
    return response;
};
const applyGrouping = async () => {
    const response = await chrome.runtime.sendMessage({ type: "applyGrouping" });
    return response;
};
const onSaveSession = async () => {
    const name = sessionNameInput.value.trim() || `Session ${new Date().toLocaleString()}`;
    const state = await fetchState();
    if (!state.ok || !state.data)
        return;
    await chrome.runtime.sendMessage({ type: "saveSession", payload: { name, groups: state.data.groups } });
    sessionNameInput.value = "";
};
const initialize = async () => {
    await applyGrouping();
};
refreshButton.addEventListener("click", applyGrouping);
saveButton.addEventListener("click", onSaveSession);
initialize();
export {};
