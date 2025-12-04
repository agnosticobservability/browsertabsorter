import { RuntimeResponse, TabGroup } from "../shared/types.js";

const refreshButton = document.getElementById("refresh") as HTMLButtonElement;
const saveButton = document.getElementById("saveSession") as HTMLButtonElement;
const sessionNameInput = document.getElementById("sessionName") as HTMLInputElement;

const fetchState = async () => {
  const response = await chrome.runtime.sendMessage({ type: "getState" });
  return response as RuntimeResponse<{ groups: TabGroup[] }>;
};

const applyGrouping = async () => {
  const response = await chrome.runtime.sendMessage({ type: "applyGrouping" });
  return response as RuntimeResponse<unknown>;
};

const onSaveSession = async () => {
  const name = sessionNameInput.value.trim() || `Session ${new Date().toLocaleString()}`;
  const state = await fetchState();
  if (!state.ok || !state.data) return;

  await chrome.runtime.sendMessage({ type: "saveSession", payload: { name, groups: state.data.groups } });
  sessionNameInput.value = "";
};

const initialize = async () => {
  await applyGrouping();
};

refreshButton.addEventListener("click", applyGrouping);
saveButton.addEventListener("click", onSaveSession);

initialize();
