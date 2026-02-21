export const getStoredValue = async <T>(key: string): Promise<T | null> => {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (items) => {
      if (chrome.runtime.lastError) {
        console.error("Storage error (get):", chrome.runtime.lastError);
        resolve(null);
        return;
      }
      resolve((items?.[key] as T) ?? null);
    });
  });
};

export const setStoredValue = async <T>(key: string, value: T): Promise<void> => {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) {
        console.error("Storage error (set):", chrome.runtime.lastError);
      }
      resolve();
    });
  });
};
