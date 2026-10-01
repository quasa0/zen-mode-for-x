import { allSettingsKeys } from "../../../storage-keys";
import { runDynamicFeatures } from "./features/dynamic";
import { applyStaticFeatures } from "./features/static";
import addStyleSheet from "./utilities/addStyleSheet";
import { extractColorsAsRootVars, observeThemeColors } from "./utilities/colors";
import debounce from "./utilities/debounce";
import isMutationSkippable from "./utilities/isMutationSkippable";
import { getStorage } from "./utilities/storage";

/**
 * Initialization:
 * - Sets up MutationObserver for dynamic features
 * - Adds load/resize event listeners
 * - Loads and caches required stylesheets
 * - Extracts Twitter theme colors
 */

export const addStylesheets = async () => {
  addStyleSheet("main", chrome.runtime.getURL("css/main.css"));
  addStyleSheet("typefully", chrome.runtime.getURL("css/typefully.css"));

  // Bundled styles keep this fork's tested behavior consistent offline and in releases.
};

const addMutationObserver = () => {
  const observer = new MutationObserver((mutations) => {
    if (!mutations.length || isMutationSkippable(mutations)) return;
    runDynamicFeatures();
  });

  observer.observe(document, {
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["data-testid", "aria-label"],
    subtree: true,
  });
};

const addPageLoadListener = () => {
  document.addEventListener("DOMContentLoaded", () => {
    runDynamicFeatures();
  });
};

const addResizeListener = () => {
  window.addEventListener(
    "resize",
    debounce(() => {
      runDynamicFeatures();
    }, 50)
  );
};

export const initializeExtension = async () => {
  await addStylesheets();

  const allData = await getStorage(allSettingsKeys);
  await applyStaticFeatures(allData);
  runDynamicFeatures();

  addMutationObserver();
  addPageLoadListener();
  addResizeListener();

  extractColorsAsRootVars();
  observeThemeColors();
  setTimeout(() => {
    // Let's extract colors when the page is likely fully loaded again
    extractColorsAsRootVars();
  }, 3000);
};
