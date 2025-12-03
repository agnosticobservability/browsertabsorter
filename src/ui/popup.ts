import { RuntimeResponse, TabGroup } from "../shared/types.js";

const groupsContainer = document.getElementById("groups") as HTMLElement;
const refreshButton = document.getElementById("refresh") as HTMLButtonElement;
const saveButton = document.getElementById("saveSession") as HTMLButtonElement;
const sessionNameInput = document.getElementById("sessionName") as HTMLInputElement;

const fetchState = async () => {
  const response = await chrome.runtime.sendMessage({ type: "getState" });
  return response as RuntimeResponse<{ groups: TabGroup[] }>;
};

const applyGrouping = async () => {
  const response = await chrome.runtime.sendMessage({ type: "applyGrouping" });
  return response as RuntimeResponse<{ groups: TabGroup[] }>;
};

const renderGroups = (groups: TabGroup[]) => {
  groupsContainer.innerHTML = "";
  const groupTemplate = document.getElementById("group-template") as HTMLTemplateElement;
  const tabTemplate = document.getElementById("tab-template") as HTMLTemplateElement;
  groups.forEach((group) => {
    const node = groupTemplate.content.cloneNode(true) as HTMLElement;
    const article = node.querySelector(".group") as HTMLElement;
    article.style.borderColor = `var(--${group.color}, #cbd5e1)`;
    const title = node.querySelector(".group-title") as HTMLElement;
    title.textContent = `${group.label} (${group.tabs.length})`;
    const reason = node.querySelector(".group-reason") as HTMLElement;
    reason.textContent = group.reason;
    const list = node.querySelector(".tab-list") as HTMLElement;
    group.tabs.forEach((tab) => {
      const tabNode = tabTemplate.content.cloneNode(true) as HTMLElement;
      const tabEl = tabNode.querySelector(".tab-item") as HTMLElement;
      const titleEl = tabNode.querySelector(".tab-title") as HTMLElement;
      const closeButton = tabNode.querySelector(".close-tab") as HTMLButtonElement;
      titleEl.textContent = tab.title;
      tabEl.title = tab.url;
      closeButton.addEventListener("click", async () => {
        await chrome.tabs.remove(tab.id);
        const state = await fetchState();
        if (state.ok && state.data) renderGroups(state.data.groups);
      });
      list.appendChild(tabNode);
    });
    groupsContainer.appendChild(node);
  });
};

const onSaveSession = async () => {
  const name = sessionNameInput.value.trim() || `Session ${new Date().toLocaleString()}`;
  const state = await fetchState();
  if (!state.ok || !state.data) return;
  await chrome.runtime.sendMessage({ type: "saveSession", payload: { name, groups: state.data.groups } });
  sessionNameInput.value = "";
};

const initialize = async () => {
  const state = await fetchState();
  if (state.ok && state.data) renderGroups(state.data.groups);
};

refreshButton.addEventListener("click", async () => {
  const state = await applyGrouping();
  if (state.ok && state.data) renderGroups(state.data.groups);
});

saveButton.addEventListener("click", onSaveSession);

initialize();
