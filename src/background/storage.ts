export const getStoredValue = async <T>(key: string, timeout = 1000): Promise<T | null> => {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
        console.warn(`Storage get timed out for key: ${key}`);
        resolve(null);
    }, timeout);

    chrome.storage.local.get(key, (items) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        console.error("Storage error (get):", chrome.runtime.lastError);
        resolve(null);
        return;
      }
      resolve((items?.[key] as T) ?? null);
    });
  });
};

export const setStoredValue = async <T>(key: string, value: T, timeout = 1000): Promise<void> => {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
        console.warn(`Storage set timed out for key: ${key}`);
        resolve();
    }, timeout);

    chrome.storage.local.set({ [key]: value }, () => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        console.error("Storage error (set):", chrome.runtime.lastError);
      }
      resolve();
    });
  });
};
