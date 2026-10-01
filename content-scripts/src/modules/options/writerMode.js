import { KeyWriterMode } from "../../../../storage-keys";
import selectors from "../../selectors";
import svgAssets from "../svgAssets";
import addStyles, { removeStyles, stylesExist } from "../utilities/addStyles";
import addTooltip, { hideAllTooltips } from "../utilities/addTooltip";
import { getStorage, setStorage } from "../utilities/storage";

const EDITOR = '[data-testid^="tweetTextarea_"][role="textbox"]';
const BUTTON_CLASS = "mt-writer-mode-composer-button";
const FOCUS_CLASSES = ["mt-writer-main", "mt-writer-column", "mt-writer-composer", "mt-writer-dialog", "mt-writer-hidden", "mt-writer-navigation", "mt-writer-shortcut"];
let writerModeEnabled = false;
let writerButtonNumber = 0;

const isHome = () => window.location.pathname === "/home" || window.location.pathname === "/";
const supportsWriterMode = () => isHome() || window.location.pathname === "/compose/post";

function getComposers() {
  return Array.from(document.querySelectorAll(EDITOR)).flatMap((editor) => {
    if (editor.closest(selectors.tweet)) return [];
    const dialog = editor.closest('[role="dialog"]');
    const column = editor.closest(selectors.mainColumn);
    if (!dialog && !column) return [];
    const boundary = dialog || column;
    for (let container = editor.parentElement; container && boundary.contains(container); container = container.parentElement) {
      const toolbar = container.querySelector('[data-testid="toolBar"]');
      if (toolbar) return [{ editor, container, toolbar, dialog }];
      if (container === boundary) break;
    }
    return [];
  });
}

const escKeyListener = (event) => {
  // X owns Escape while a dialog is open, including its draft-close confirmation.
  if (event.key !== "Escape" || event.defaultPrevented || document.querySelector('[role="dialog"]')) return;
  event.preventDefault();
  void toggleWriterMode();
};

function clearFocusLayout() {
  document.body.classList.remove("mt-writer-mode");
  FOCUS_CLASSES.forEach((className) => {
    document.querySelectorAll(`.${className}`).forEach((element) => element.classList.remove(className));
  });
}

function updateWriterButtons() {
  document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button) => {
    const label = writerModeEnabled ? "Close Zen Writer Mode" : "Zen Writer Mode";
    const icon = writerModeEnabled ? svgAssets.composerWriterMode.selected : svgAssets.composerWriterMode.normal;
    if (button.dataset.writerState !== String(writerModeEnabled)) {
      button.dataset.writerState = String(writerModeEnabled);
      button.innerHTML = icon;
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-pressed", String(writerModeEnabled));
      addTooltip(button, { id: "mt-writer-mode-tooltip", title: label });
    }
  });
}

export const changeWriterMode = (setting) => {
  writerModeEnabled = setting === "on" && supportsWriterMode();
  if (!writerModeEnabled) {
    clearFocusLayout();
    document.removeEventListener("keydown", escKeyListener);
    removeStyles("writerMode");
    updateWriterButtons();
    if (supportsWriterMode()) void addWriterModeButton();
    else document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button) => button.remove());
    return;
  }

  const composers = getComposers();
  // A loading Home page or unrelated dialog must never receive a blank focus layout.
  const entering = !document.body.classList.contains("mt-writer-mode");
  clearFocusLayout();
  if (!composers.length) {
    document.removeEventListener("keydown", escKeyListener);
    removeStyles("writerMode");
    return;
  }
  document.body.classList.add("mt-writer-mode");
  document.addEventListener("keydown", escKeyListener);
  composers.forEach(({ container, dialog }) => {
    container.classList.add("mt-writer-composer");
    dialog?.classList.add("mt-writer-dialog");
  });

  if (isHome()) {
    const column = document.querySelector(selectors.mainColumn);
    column?.classList.add("mt-writer-column");
    column?.closest(selectors.mainWrapper)?.classList.add("mt-writer-main");
    column?.querySelectorAll("section").forEach((section) => {
      if (!section.closest(selectors.tweet) && section.querySelector(selectors.tweet) && !section.querySelector(EDITOR)) {
        section.classList.add("mt-writer-hidden");
      }
    });
    document.querySelector(selectors.timelineTabs)?.classList.add("mt-writer-hidden");
    document.querySelector(selectors.rightSidebar)?.classList.add("mt-writer-hidden");
    const navigation = document.querySelector(selectors.leftSidebar);
    navigation?.classList.add("mt-writer-navigation");
    navigation?.querySelectorAll('nav[role="navigation"] > *').forEach((link) => {
      if (link.getAttribute("aria-label") === "Zen Writer Mode") link.classList.add("mt-writer-shortcut");
      else link.classList.add("mt-writer-hidden");
    });
    navigation?.querySelectorAll(`${selectors.accountSwitcherButton}, ${selectors.tweetButton}`).forEach((button) => button.classList.add("mt-writer-hidden"));
  }

  if (!stylesExist("writerMode")) {
    addStyles("writerMode", `
      body.mt-writer-mode { padding-left: 0 !important; }
      .mt-writer-hidden { display: none !important; }
      header[role="banner"].mt-writer-navigation nav[role="navigation"] > .mt-writer-hidden { display: none !important; }
      main.mt-writer-main { flex-basis: 100% !important; min-width: 0; }
      main.mt-writer-main > div { width: 100%; max-width: 100%; }
      ${selectors.mainColumn}.mt-writer-column {
        width: min(700px, 100%) !important;
        max-width: 700px !important;
        margin: 0 auto;
        border-color: transparent;
        transform: none !important;
        padding-top: clamp(16px, 3vh, 40px);
      }
      .mt-writer-composer { min-width: 0; scroll-margin-top: 72px; }
      .mt-writer-composer ${EDITOR}[contenteditable="true"] {
        min-height: clamp(160px, 40vh, 480px);
        overflow-wrap: anywhere;
      }
      .mt-writer-dialog {
        width: min(700px, calc(100vw - 32px)) !important;
        max-width: calc(100vw - 32px) !important;
        max-height: calc(100dvh - 32px) !important;
        overflow-y: auto !important;
      }
      header.mt-writer-navigation {
        position: fixed !important;
        top: 12px;
        left: 12px;
        width: auto !important;
        z-index: 10;
        visibility: hidden !important;
        pointer-events: none;
      }
      header.mt-writer-navigation .mt-writer-shortcut {
        position: fixed !important;
        top: 12px !important;
        left: 12px !important;
        right: auto !important;
        bottom: auto !important;
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        width: 44px !important;
        min-width: 44px !important;
        max-width: 44px !important;
        height: 44px !important;
        margin: 0 !important;
        padding: 10px !important;
        visibility: visible !important;
        pointer-events: auto;
      }
      header.mt-writer-navigation .mt-writer-shortcut > div {
        display: flex !important;
        align-items: center;
        justify-content: center;
        width: 24px !important;
        height: 24px !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      header.mt-writer-navigation .mt-writer-shortcut span,
      header.mt-writer-navigation .mt-writer-shortcut > div > div + div { display: none !important; }
      header.mt-writer-navigation .mt-writer-shortcut svg { width: 24px; height: 24px; }
      @media (max-width: 987px) {
        ${selectors.mainColumn}.mt-writer-column { padding-top: 72px; }
      }
    `);
  }
  void addWriterModeButton();
  updateWriterButtons();
  if (entering) {
    const composer = composers.find(({ dialog }) => dialog) || composers[0];
    composer.editor.focus({ preventScroll: true });
    composer.container.scrollIntoView({ block: "start" });
  }
};

export const addWriterModeButton = () => {
  if (!supportsWriterMode()) return;
  getComposers().forEach(({ toolbar }) => {
    if (toolbar.querySelector(`.${BUTTON_CLASS}`)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.id = document.getElementById("mt-writer-mode-composer-button") ? `mt-writer-mode-composer-button-${++writerButtonNumber}` : "mt-writer-mode-composer-button";
    button.addEventListener("click", toggleWriterMode);
    toolbar.appendChild(button);
  });
  if (!stylesExist("writer-mode-composer-button-style")) {
    addStyles("writer-mode-composer-button-style", `
      .${BUTTON_CLASS} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 36px;
        height: 36px;
        margin: 0 4px;
        padding: 8px;
        border: 0;
        border-radius: 9999px;
        background: transparent;
        color: rgb(var(--accent-color-rgb, 29, 155, 240));
        cursor: pointer;
      }
      .${BUTTON_CLASS} svg { width: 20px; height: 20px; fill: currentColor; }
      .${BUTTON_CLASS}:hover { background: rgba(var(--accent-color-rgb, 29, 155, 240), 0.1); }
      .${BUTTON_CLASS}:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    `);
  }
  updateWriterButtons();
};

const toggleWriterMode = async () => {
  const setting = await getStorage(KeyWriterMode);
  hideAllTooltips();
  await setStorage({ [KeyWriterMode]: setting === "on" ? "off" : "on" });
};
