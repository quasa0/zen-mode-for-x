import { defaultPreferences } from "../../storage-keys";

/*--
- Docs: https://developer.chrome.com/docs/extensions/reference/storage/
- Use storage.local to allow user to store customizations
--*/

export const getStorage = (storageKeyOrKeys) => {
  try {
    if (typeof storageKeyOrKeys !== "string" && !Array.isArray(storageKeyOrKeys)) {
      throw new Error("storageKeyOrKeys must be a string or an array of strings");
    }
    if (Array.isArray(storageKeyOrKeys)) {
      return getMultipleStorageKeys(storageKeyOrKeys);
    } else {
      return getSingleStorageKey(storageKeyOrKeys);
    }
  } catch (error) {
    console.error(error);
  }
};

const getSingleStorageKey = (key) => {
  return new Promise((resolve, _reject) => {
    chrome?.storage?.local.get([key], (data) => {
      resolve(data[key] ?? defaultPreferences[key]); // Fallback to the default preference
    });
  });
};

const getMultipleStorageKeys = (keysArray) => {
  return new Promise((resolve, _reject) => {
    chrome?.storage?.local.get(keysArray, (data) => {
      const res = keysArray.reduce((acc, cur) => {
        acc[cur] = data[cur] ?? defaultPreferences[cur]; // For each key, fallback to the default preference
        return acc;
      }, {});
      resolve(res);
    });
  });
};

// storage.local has no sync-area write-rate limit. Save each change so rapid
// clicks on different controls cannot replace a pending write for another key.
export const setStorage = (kv) => new Promise((resolve, reject) => {
  chrome.storage.local.set(kv, () => {
    const error = chrome.runtime.lastError;
    if (error) reject(new Error(error.message));
    else resolve(kv);
  });
});
