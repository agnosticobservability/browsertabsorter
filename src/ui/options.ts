import { Preferences, SortingStrategy } from "../shared/types.js";

const primarySelect = document.getElementById("primaryGrouping") as HTMLSelectElement;
const secondarySelect = document.getElementById("secondaryGrouping") as HTMLSelectElement;
const sortList = document.getElementById("sortList") as HTMLUListElement;
const debugMode = document.getElementById("debugMode") as HTMLInputElement;
const saveButton = document.getElementById("save") as HTMLButtonElement;
const toast = document.getElementById("toast") as HTMLElement;

let autoGroupNewTabs = false;

// Define all available strategies with labels
const STRATEGIES: { id: SortingStrategy; label: string }[] = [
  { id: "pinned", label: "Pinned before others" },
  { id: "recency", label: "Most recent first" },
  { id: "hierarchy", label: "Parents before children" },
  { id: "title", label: "Alphabetical by title" },
  { id: "url", label: "Alphabetical by URL" },
  { id: "youtube-channel", label: "YouTube Channel" },
  { id: "context", label: "Context (AI/Keyword)" }
];

const ICONS = {
  drag: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>`
};

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

const renderSortList = (activeStrategies: SortingStrategy[]) => {
  sortList.innerHTML = "";

  // Create a merged list: Active strategies first (in order), then remaining strategies
  const activeSet = new Set(activeStrategies);
  const orderedItems = [
    ...activeStrategies.map(id => STRATEGIES.find(s => s.id === id)!),
    ...STRATEGIES.filter(s => !activeSet.has(s.id))
  ].filter(Boolean); // Filter out any undefined if strategies changed

  orderedItems.forEach((strategy, index) => {
    const li = document.createElement("li");
    li.className = "sort-item";
    li.draggable = true;
    li.dataset.id = strategy.id;

    // Drag Handle
    const handle = document.createElement("div");
    handle.className = "sort-handle";
    handle.innerHTML = ICONS.drag;

    // Content
    const content = document.createElement("label");
    content.className = "sort-content";

    // Numbering (Hierarchy visual)
    const number = document.createElement("span");
    number.className = "sort-number";
    number.textContent = `${index + 1}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = activeSet.has(strategy.id);

    const text = document.createElement("span");
    text.textContent = strategy.label;

    content.append(number, checkbox, text);
    li.append(handle, content);

    // Drag Events
    li.addEventListener("dragstart", handleDragStart);
    li.addEventListener("dragover", handleDragOver);
    li.addEventListener("drop", handleDrop);
    li.addEventListener("dragenter", handleDragEnter);
    li.addEventListener("dragleave", handleDragLeave);
    li.addEventListener("dragend", handleDragEnd);

    sortList.appendChild(li);
  });
};

// --- Drag and Drop Logic ---

let dragSrcEl: HTMLElement | null = null;
let dropPosition: "before" | "after" | null = null;

function handleDragStart(this: HTMLElement, e: DragEvent) {
  this.style.opacity = "0.4";
  dragSrcEl = this;
  e.dataTransfer!.effectAllowed = "move";
  e.dataTransfer!.setData("text/html", this.innerHTML);
  this.classList.add("dragging");
}

function handleDragOver(this: HTMLElement, e: DragEvent) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer!.dropEffect = "move";

  // Calculate mouse position relative to the element
  const rect = this.getBoundingClientRect();
  const offset = e.clientY - rect.top;
  const height = rect.height;

  // Remove existing classes
  this.classList.remove("over-top", "over-bottom");

  // If hovering over the top 50%, insert before. Else, insert after.
  if (offset < height / 2) {
    this.classList.add("over-top");
    dropPosition = "before";
  } else {
    this.classList.add("over-bottom");
    dropPosition = "after";
  }

  return false;
}

function handleDragEnter(this: HTMLElement) {
  // Logic handled in dragover for continuous updates
}

function handleDragLeave(this: HTMLElement) {
  this.classList.remove("over-top", "over-bottom");
  dropPosition = null;
}

function handleDrop(this: HTMLElement, e: DragEvent) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }

  if (dragSrcEl !== this && dropPosition) {
    // Insert based on dropPosition
    if (dropPosition === "before") {
      this.before(dragSrcEl!);
    } else {
      this.after(dragSrcEl!);
    }

    updateListNumbers();
  }

  // Clean up
  this.classList.remove("over-top", "over-bottom");
  dropPosition = null;

  return false;
}

function handleDragEnd(this: HTMLElement) {
  this.style.opacity = "1";
  this.classList.remove("dragging");

  const items = sortList.querySelectorAll(".sort-item");
  items.forEach((item) => {
    item.classList.remove("over-top", "over-bottom");
  });

  dropPosition = null;
}

const updateListNumbers = () => {
  const items = sortList.querySelectorAll(".sort-item");
  items.forEach((item, index) => {
    const num = item.querySelector(".sort-number");
    if (num) num.textContent = `${index + 1}`;
  });
};

// --- Load / Save ---

const loadPreferences = async () => {
  const response = (await chrome.runtime.sendMessage({ type: "loadPreferences" })) as {
    ok: boolean;
    data?: Preferences;
  };
  if (!response.ok || !response.data) return;
  const prefs = response.data;

  primarySelect.value = prefs.primaryGrouping;
  secondarySelect.value = prefs.secondaryGrouping;
  debugMode.checked = prefs.debug;
  autoGroupNewTabs = prefs.autoGroupNewTabs;

  renderSortList(prefs.sorting);
};

const savePreferences = async () => {
  // Extract sorting from list order + checked state
  const items = Array.from(sortList.querySelectorAll(".sort-item")) as HTMLElement[];
  const newSorting: SortingStrategy[] = [];

  items.forEach(item => {
    const id = item.dataset.id as SortingStrategy;
    const checked = (item.querySelector("input[type='checkbox']") as HTMLInputElement).checked;
    if (checked) {
      newSorting.push(id);
    }
  });

  const prefs: Preferences = {
    primaryGrouping: primarySelect.value as Preferences["primaryGrouping"],
    secondaryGrouping: secondarySelect.value as Preferences["secondaryGrouping"],
    sorting: newSorting.length ? newSorting : ["pinned", "recency"], // Fallback default
    debug: debugMode.checked,
    autoGroupNewTabs
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
