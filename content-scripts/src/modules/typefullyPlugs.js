import selectors from "../selectors";
import svgAssets from "./svgAssets";
import addStyles, { removeStyles } from "./utilities/addStyles";
import addTooltip from "./utilities/addTooltip";
import { createTypefullyUrl } from "./utilities/createTypefullyUrl";
import addTypefullyBox from "./utilities/addTypefullyBox";

const MODAL_PLUG_ID = "typefully-link";
const INLINE_PLUG_ID = "typefully-link-inline";
const REPLY_PLUG_ID = "typefully-reply-link";
const OWNED_IDS = [MODAL_PLUG_ID, INLINE_PLUG_ID, REPLY_PLUG_ID, "typefully-writermode-link", "typefully-callout-box", "typefully-schedule-button", "typefully-tooltip", "typefully-schedule-tooltip", "typefully-image-download-button", "typefully-gif-download-button", "typefully-video-download-button"];
let enhancementsEnabled = true;
let replyListenerInstalled = false;
let pendingReply;
let replyModal;
let calloutPending = false;

const isVisible = (element) => {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return !!(rect.width && rect.height && style.display !== "none" && style.visibility !== "hidden");
};
const composerEditors = (root) => Array.from(root.querySelectorAll('[contenteditable="true"][data-testid^="tweetTextarea_"]')).filter((editor) => /^tweetTextarea_\d+$/.test(editor.dataset.testid));
const getComposerModal = () => Array.from(document.querySelectorAll('[role="dialog"]')).reverse().find((modal) => isVisible(modal) && composerEditors(modal).some(isVisible));
const getActiveComposerRoot = () => getComposerModal() || document.querySelector(selectors.mainColumn);

const removeOwnedElements = () => {
  OWNED_IDS.forEach((id) => document.querySelectorAll(`[id="${id}"]`).forEach((element) => element.remove()));
  removeStyles(INLINE_PLUG_ID);
};

export const areTypefullyEnhancementsEnabled = () => enhancementsEnabled;

export const setTypefullyEnhancementsEnabled = (enabled) => {
  enhancementsEnabled = enabled;
  if (enabled) {
    // Capture an immediate native Reply click before asynchronous DOM updates.
    saveCurrentReplyToLink();
  } else {
    removeOwnedElements();
    document.removeEventListener("click", rememberReply, true);
    replyListenerInstalled = false;
    pendingReply = undefined;
    replyModal = undefined;
  }
};

const addCallout = async (root, innerHTML, options) => {
  if (!enhancementsEnabled || calloutPending || document.getElementById("typefully-callout-box")) return;
  calloutPending = true;
  try {
    await addTypefullyBox(root, innerHTML, options);
    if (!enhancementsEnabled || !root.isConnected) root.querySelectorAll('[id="typefully-callout-box"]').forEach((element) => element.remove());
  } finally {
    calloutPending = false;
  }
};

export const addTypefullyComposerPlug = () => {
  if (!enhancementsEnabled) return;
  const modal = getComposerModal();
  if (modal && !modal.querySelector(`#${MODAL_PLUG_ID}, #${REPLY_PLUG_ID}`)) {
    const element = createTypefullyLinkElement(MODAL_PLUG_ID, "typefully-save-draft-button");
    const text = document.createElement("span");
    text.textContent = "Save draft to Typefully";
    element.append(createTypefullyLogo(), text);
    element.addEventListener("click", () => getCurrentTextAndSendToTypefully(null, null, modal));
    modal.appendChild(element);
    const url = createTypefullyUrl({ utm_content: "save-draft-callout" });
    addCallout(modal, `<ul><li>💬 Share your drafts and get comments</li><li>🤖 Improve your tweets with AI</li><li>📈 Track your growth with insights and metrics</li><li>📆 Schedule for later</li></ul><p>Powered by <a href="${url}" target="_blank" rel="noopener noreferrer">Typefully</a>, the makers of the Minimal Twitter extension.</p>`, { withArrow: true });
  }

  const root = document.querySelector(selectors.mainColumn);
  const button = root?.querySelector('[data-testid="tweetButtonInline"]');
  if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") {
    document.getElementById(INLINE_PLUG_ID)?.remove();
    document.getElementById("typefully-tooltip")?.remove();
    removeStyles(INLINE_PLUG_ID);
    return;
  }
  if (document.getElementById(INLINE_PLUG_ID)) return;
  const element = createTypefullyLinkElement(INLINE_PLUG_ID, "typefully-save-draft-button ghost");
  element.appendChild(createTypefullyLogo());
  element.addEventListener("click", () => getCurrentTextAndSendToTypefully(null, null, root));
  button.parentElement.appendChild(element);
  addStyles(INLINE_PLUG_ID, `[data-testid="primaryColumn"] [data-testid="tweetButtonInline"] { margin-left: 8px; order: 2; }`);
  addTooltip(element, { id: "typefully-tooltip", title: "Save draft in Typefully", description: "Save all your post ideas, enhance with AI, schedule, and boost engagement." });
};

const getPostLink = (tweet) => {
  if (!tweet) return null;
  const links = Array.from(tweet.querySelectorAll('a[href*="/status/"]')).filter((link) => {
    if (link.closest('[data-testid="tweet"]') !== tweet || link.parentElement.closest('[data-testid="quoteTweet"], div[role="link"]')) return false;
    const url = new URL(link.href);
    return url.origin === location.origin && /^\/[^/]+\/status\/\d+(?:\/|$)/.test(url.pathname);
  });
  const link = links.find((candidate) => candidate.querySelector("time")) || links[0];
  if (!link) return null;
  const url = new URL(link.href);
  return url.origin + url.pathname.split("/").slice(0, 4).join("/");
};

function rememberReply(event) {
  if (!enhancementsEnabled || !(event.target instanceof Element)) return;
  const reply = event.target.closest('[data-testid="reply"]');
  if (reply) {
    pendingReply = getPostLink(reply.closest('[data-testid="tweet"]'));
    replyModal = undefined;
  } else if (event.target.closest('[aria-label="Close"], [data-testid="SideNav_NewTweet_Button"]')) {
    pendingReply = undefined;
    replyModal = undefined;
  }
}

export const saveCurrentReplyToLink = () => {
  if (!enhancementsEnabled || replyListenerInstalled) return;
  document.addEventListener("click", rememberReply, true);
  replyListenerInstalled = true;
};

export const addTypefullyReplyPlug = () => {
  if (!enhancementsEnabled) return;
  if (replyModal && !replyModal.isConnected) {
    pendingReply = undefined;
    replyModal = undefined;
  }
  const modal = getComposerModal();
  if (!modal || !modal.querySelector('[data-testid="toolBar"]') || !modal.querySelector('[data-testid="tweetButton"]')) return;
  const replyingTo = getPostLink(modal.querySelector('[data-testid="tweet"]')) || pendingReply;
  if (!replyingTo || modal.querySelector(`#${REPLY_PLUG_ID}`)) return;
  replyModal = modal;
  const element = createTypefullyLinkElement(REPLY_PLUG_ID, "typefully-reply-button");
  const text = document.createElement("span");
  text.textContent = "Reply with Typefully";
  element.append(createTypefullyLogo(), text);
  element.addEventListener("click", () => getCurrentTextAndSendToTypefully(replyingTo, null, modal));
  const draft = modal.querySelector(`#${MODAL_PLUG_ID}`);
  if (draft) draft.replaceWith(element);
  else modal.appendChild(element);
};

export const addTypefullySecurityAndAccountAccessPlug = () => {
  if (!enhancementsEnabled) return;
  const root = document.querySelector(selectors.securityAndAccountAccess);
  if (!root) return;
  const url = createTypefullyUrl({ utm_content: "typefully-teams-callout" });
  addCallout(root, `<p>You can use <a href="${url}" target="_blank" rel="noopener noreferrer">Typefully</a> to easily collaborate on multiple Twitter accounts with your team or clients and to share &amp; comment on draft posts.</p>`, { className: "typefully-teams-box", withArrow: false });
};

export const addTypefullySchedulePlug = () => {
  if (!enhancementsEnabled) return;
  const nativeButton = document.querySelector('[data-testid="scheduledConfirmationPrimaryAction"]');
  if (!nativeButton || document.getElementById("typefully-schedule-button")) return;
  const button = nativeButton.cloneNode(false);
  button.removeAttribute("data-testid");
  button.removeAttribute("disabled");
  button.removeAttribute("aria-disabled");
  button.removeAttribute("aria-labelledby");
  button.removeAttribute("aria-describedby");
  button.id = "typefully-schedule-button";
  button.type = "button";
  button.setAttribute("aria-label", "Schedule with Typefully");
  const text = document.createElement("span");
  text.textContent = "Schedule with Typefully";
  button.append(createTypefullyLogo(), text);
  button.addEventListener("click", () => getCurrentTextAndSendToTypefully(null, "schedule-button"));
  nativeButton.parentElement.insertBefore(button, nativeButton);
  addTooltip(button, { id: "typefully-schedule-tooltip", title: "Schedule with Typefully", description: "Grow an audience faster with Typefully's social media scheduling tool." });
};

export const createTypefullyLinkElement = (id, className) => {
  const element = document.createElement("a");
  element.id = id;
  element.className = className;
  element.setAttribute("role", "button");
  element.tabIndex = 0;
  element.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    element.click();
  });
  return element;
};

export const createTypefullyLogo = () => {
  const logo = document.createElement("div");
  logo.className = "typefully-logo";
  logo.innerHTML = svgAssets.typefully.logo;
  logo.style.position = "relative";
  return logo;
};

const readDraftNode = (node) => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeName === "BR") return "\n";
  if (node.nodeName === "IMG") return node.getAttribute("alt") || "";
  return Array.from(node.childNodes).map(readDraftNode).join("");
};

const readEditor = (editor) => {
  const blocks = Array.from(editor.querySelectorAll(".public-DraftStyleDefault-block"));
  if (!blocks.length) return editor.innerText.replace(/\r\n?/g, "\n");
  return blocks.map((block) => {
    const text = readDraftNode(block);
    return text === "\n" ? "" : text;
  }).join("\n");
};

export const getCurrentTextAndSendToTypefully = (replyingToLink, utm_content, root = getActiveComposerRoot()) => {
  if (!enhancementsEnabled || !root) return;
  const editors = composerEditors(root).sort((a, b) => Number(a.dataset.testid.split("_")[1]) - Number(b.dataset.testid.split("_")[1]));
  if (!editors.length) return;
  const content = editors.map(readEditor).join("---typefully-split---");
  const url = createTypefullyUrl({ utm_content: utm_content ?? "save-draft-button", new: content, ...(replyingToLink && { replyTo: replyingToLink }) });
  window.open(url, "_blank", "noopener,noreferrer");
};
