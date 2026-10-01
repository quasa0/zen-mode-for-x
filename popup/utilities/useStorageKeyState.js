import { useCallback, useEffect, useRef, useState } from "react";
import { defaultPreferences } from "../../storage-keys";
import { getStorage, setStorage } from "./chromeStorage";

export function useStorageValueState(storageKey) {
  const [snapshot, setSnapshot] = useState(() => ({ key: storageKey, value: defaultPreferences[storageKey], loaded: false }));
  const currentSession = useRef();

  useEffect(() => {
    const session = { key: storageKey, active: true, revision: 0 };
    currentSession.current = session;
    setSnapshot({ key: storageKey, value: defaultPreferences[storageKey], loaded: false });
    const storageEvents = globalThis.chrome?.storage?.onChanged;
    const onStorageChanged = (changes, area) => {
      if (!session.active || area !== "local" || !Object.hasOwn(changes, storageKey)) return;
      session.revision++;
      setSnapshot({ key: storageKey, value: changes[storageKey].newValue ?? defaultPreferences[storageKey], loaded: true });
    };
    storageEvents?.addListener(onStorageChanged);
    const readRevision = session.revision;
    getStorage(storageKey).then((value) => {
      if (session.active && session.revision === readRevision) setSnapshot({ key: storageKey, value: value ?? defaultPreferences[storageKey], loaded: true });
    }).catch((error) => {
      console.warn(error);
      if (session.active && session.revision === readRevision) setSnapshot({ key: storageKey, value: defaultPreferences[storageKey], loaded: true });
    });
    return () => {
      session.active = false;
      storageEvents?.removeListener(onStorageChanged);
    };
  }, [storageKey]);

  const setValue = useCallback(async (value) => {
    const session = currentSession.current;
    if (!session?.active || session.key !== storageKey) return;
    const revision = ++session.revision;
    setSnapshot({ key: storageKey, value, loaded: true });
    try {
      await setStorage({ [storageKey]: value });
    } catch (error) {
      console.warn(error);
      try {
        const stored = await getStorage(storageKey);
        if (session.active && session.revision === revision) setSnapshot({ key: storageKey, value: stored ?? defaultPreferences[storageKey], loaded: true });
      } catch (readError) { console.warn(readError); }
    }
  }, [storageKey]);

  const current = snapshot.key === storageKey ? snapshot : { value: defaultPreferences[storageKey], loaded: false };
  return [current.value, setValue, current.loaded];
}

export default function useStorageKeyState(storageKey) {
  const [value, setValue, loaded] = useStorageValueState(storageKey);
  const setChecked = useCallback((checked) => setValue(checked === true ? "on" : "off"), [setValue]);
  return [value === "on", setChecked, loaded];
}

export function useStorageValue(storageKey) {
  return useStorageValueState(storageKey)[0];
}
