export const getStoredValue = async (key) => {
    return new Promise((resolve) => {
        chrome.storage.local.get(key, (items) => {
            resolve(items[key] ?? null);
        });
    });
};
export const setStoredValue = async (key, value) => {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [key]: value }, () => resolve());
    });
};
