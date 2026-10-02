import { allSettingsKeys, KeyExtensionStatus } from "../../storage-keys";
import { applyStaticFeatures } from "./modules/features/static";
import { runDynamicFeatures } from "./modules/features/dynamic";
import { initializeExtension } from "./modules/initialize";
import { getStorage } from "./modules/utilities/storage";

/**
 * Extension Lifecycle:
 * 1. Extension Load:
 *    - Initialize observers, listeners, styles
 *    - Apply static features
 *    - Start dynamic feature monitoring
 *
 * 2. Settings Changes:
 *    - Reapply affected static features
 *    - Dynamic features auto-update on DOM changes
 */

const hasStorageApi = () => Boolean(chrome?.storage?.local);

// Listen to settings changes
try {
  if (hasStorageApi()) {
    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area !== "local") return;
      if (!Object.keys(changes).some(key => allSettingsKeys.includes(key))) return;
      try {
        if (changes[KeyExtensionStatus]?.newValue !== changes[KeyExtensionStatus]?.oldValue) {
          window.location.reload();
          return;
        }

        const status = await getStorage(KeyExtensionStatus);
        if (status === "off") return;

        // Apply a complete snapshot so dependent features remain consistent.
        await applyStaticFeatures(await getStorage(allSettingsKeys));
        runDynamicFeatures();
      } catch (error) {
        console.error("Zen mode for X settings update failed", error);
      }
    });
  }
} catch {
  // Existing tabs can keep stale content scripts after the extension reloads.
}

// Initialize extension
const init = async () => {
  const status = await getStorage(KeyExtensionStatus);
  if (status === "off") return;

  await initializeExtension();
};

init().catch((error) => {
  console.error("Zen mode for X initialization failed", error);
});
