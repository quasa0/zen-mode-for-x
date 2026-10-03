import selectors from "../../selectors";
import addStyles, { removeStyles } from "../utilities/addStyles";
import { canvasToImageBlob, captureElement, frameAiSlopScreenshot } from "./aiSlopCard";

const BUTTON_CLASS = "mt-ai-slop-button";
const CONTROL_CLASS = "mt-ai-slop-control";
const TWEET_CLASS = "mt-ai-slop-tweet";
const ICON_WRAP_CLASS = "mt-ai-slop-icon-wrap";
const COUNTDOWN_RING_CLASS = "mt-ai-slop-countdown-ring";
const REPORTED_CLASS = "mt-ai-slop-reported";
const REPORTED_NOTICE_CLASS = "mt-ai-slop-reported-notice";
const REPORTED_VIEW_BUTTON_CLASS = "mt-ai-slop-reported-view-button";
const STYLE_ID = "aiSlopButton";
// X renders confirmation sheets, such as "Save post?", as alert dialogs.
const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"]';
const MENU_SELECTOR = '[role="menu"]';
const COMPOSE_PATHNAME = /^\/compose\/(?:post|tweet)\/?$/;
const REPLY_IMAGE_NAME = "ai-slop-report";
const ACTION_SELECTOR = 'button, [role="button"], [role="menuitem"], [role="radio"], label, [tabindex="0"]';
const AI_SLOP_ICON_PATHS = [
  "M12.5771 0.0207988C13.6947 0.287943 14.3854 0.969029 14.6448 2.07458C14.9188 3.24291 14.2004 4.60029 12.9257 5.02293C12.8198 5.05805 12.7816 5.09675 12.7828 5.2101C12.7889 5.77474 12.7856 6.33948 12.7856 6.92736C12.8841 6.92736 12.9688 6.92739 13.0535 6.92736C14.3574 6.92689 15.6613 6.92837 16.9653 6.92549C18.956 6.9211 20.781 8.47885 21.0734 10.4477C21.1272 10.8096 21.1348 11.1783 21.1647 11.5559C21.6477 11.5357 22.124 11.6173 22.5591 11.847C23.6099 12.4018 24.1759 13.2736 24.211 14.4698C24.2236 14.9022 24.2124 15.3352 24.2126 15.7679C24.2134 17.4461 22.9211 18.7522 21.2432 18.7685C21.2153 18.7688 21.1874 18.7685 21.1397 18.7685C21.1397 19.0878 21.1418 19.3971 21.1393 19.7063C21.1226 21.7759 19.6655 23.4577 17.8219 23.8926C17.5606 23.9542 17.2863 23.9871 17.018 23.9877C13.8101 23.994 10.602 23.9714 7.39437 23.9998C5.61627 24.0156 3.90605 22.8213 3.31057 21.0583C3.08786 20.3989 3.08934 19.724 3.08836 19.045C3.08824 18.9587 3.08834 18.8724 3.08834 18.7902C2.84469 18.7623 2.60263 18.7512 2.36752 18.7048C1.10208 18.4553 0.124831 17.3936 0.0398119 16.1015C-0.00720871 15.3868 -0.0325694 14.6516 0.0806584 13.9496C0.312801 12.5103 1.49424 11.5745 2.95465 11.5565C2.98903 11.5561 3.02339 11.5531 3.10669 11.5488C3.10669 11.3279 3.09553 11.1059 3.10856 10.8853C3.17535 9.75455 3.64905 8.81076 4.47231 8.04889C5.28339 7.2983 6.24717 6.91781 7.3628 6.92536C8.68397 6.9343 10.0053 6.9267 11.3265 6.92627C11.3835 6.92625 11.4405 6.92626 11.5079 6.92626C11.5143 6.88001 11.524 6.84229 11.5241 6.80453C11.5253 6.27951 11.5235 5.75447 11.5271 5.22946C11.5278 5.13132 11.5077 5.08266 11.399 5.04921C10.2496 4.6954 9.5208 3.67545 9.54472 2.46821C9.5686 1.2634 10.5929 0.133458 11.7892 0.010513C12.044 -0.0156623 12.3045 0.014516 12.5771 0.0207988ZM13.5795 8.21159C11.595 8.21155 9.6104 8.21083 7.62585 8.21245C7.41299 8.21262 7.19889 8.21421 6.98749 8.23586C5.53308 8.38479 4.36628 9.62603 4.35782 11.0845C4.34106 13.9747 4.33963 16.865 4.35538 19.7551C4.36081 20.7495 4.80779 21.5492 5.61109 22.139C6.15982 22.5418 6.78185 22.709 7.46074 22.708C10.5933 22.7032 13.7259 22.6998 16.8584 22.7068C18.511 22.7104 19.8703 21.3676 19.8825 19.7351C19.9038 16.9027 19.8882 14.07 19.8864 11.2374C19.8861 10.6864 19.7706 10.1589 19.4798 9.688C18.8824 8.72044 18.0112 8.21652 16.8678 8.21117C15.7833 8.2061 14.6987 8.21106 13.5795 8.21159ZM2.15206 17.2862C2.44375 17.4311 2.74566 17.5231 3.08393 17.4755C3.08393 15.9268 3.08393 14.3891 3.08393 12.8512C3.05934 12.8436 3.04361 12.8352 3.02742 12.8342C2.15974 12.7792 1.36677 13.4232 1.28526 14.2929C1.23971 14.779 1.26278 15.2719 1.26385 15.7618C1.2653 16.4279 1.55501 16.934 2.15206 17.2862ZM22.9287 16.0949C22.9365 15.5139 22.987 14.9296 22.9423 14.3527C22.8692 13.412 22.0277 12.7333 21.1491 12.8546C21.1491 14.3939 21.1491 15.9343 21.1491 17.4735C21.9768 17.5633 22.734 16.9821 22.9287 16.0949ZM10.8922 3.03258C11.1768 3.66753 11.7465 3.97528 12.3986 3.84622C12.9908 3.72901 13.4535 3.15536 13.4407 2.55416C13.4275 1.93856 12.9408 1.38591 12.3454 1.28188C11.395 1.11582 10.5281 2.07143 10.8922 3.03258Z",
  "M15.7505 13.1579C16.9235 13.1009 17.8434 13.8895 18.0948 14.8912C18.405 16.1275 17.5591 17.3887 16.274 17.622C15.0384 17.8464 13.8207 16.9284 13.662 15.6846C13.5144 14.5273 14.3519 13.302 15.7505 13.1579ZM16.8202 14.9444C16.7151 14.8239 16.6245 14.6855 16.5023 14.5862C16.175 14.3205 15.7176 14.3143 15.3395 14.5497C15.0062 14.7572 14.8046 15.1925 14.8732 15.5582C14.9545 15.9913 15.2103 16.274 15.6312 16.3892C16.0472 16.5031 16.4137 16.3848 16.6922 16.0618C16.9729 15.7362 17.0171 15.3621 16.8202 14.9444Z",
  "M7.35318 13.3881C8.86194 12.6669 10.4721 13.7374 10.5828 15.2324C10.6832 16.5886 9.52058 17.7618 8.19192 17.6554C7.1788 17.5743 6.3645 16.8713 6.12905 15.8744C5.91634 14.9737 6.35091 13.9921 7.19072 13.4776C7.2397 13.4476 7.29154 13.4223 7.35318 13.3881ZM7.33545 15.1317C7.22089 15.5337 7.33602 15.8725 7.63292 16.1503C8.06451 16.5541 8.72954 16.5125 9.13422 16.0649C9.50094 15.6593 9.44291 15.009 9.00603 14.6283C8.45666 14.1496 7.63862 14.3841 7.33545 15.1317Z",
];
const BUTTON_COLOR = "rgb(113, 118, 123)";
const CONFIRM_COLOR = "rgb(244, 33, 46)";
const CONFIRMATION_WINDOW_MS = 3000;
const confirmationTimeouts = new WeakMap();
const confirmationStartTimes = new WeakMap();
const confirmationIdentities = new WeakMap();
const reportedTweetStatusIds = new Set();
const reportedChildDisplays = new WeakMap();
const buttonResetTimeouts = new Map();
let aiSlopEnabled = false;
let aiSlopReplyEnabled = false;
let activeAction;

// X shows the reply composer on its own route. The thread stays mounted below it.
const isActionRoute = (context) => location.pathname === context.pathname || (context.composing && COMPOSE_PATHNAME.test(location.pathname));

const assertActionActive = (context) => {
  if (context && (context.signal.aborted || !aiSlopEnabled || !isActionRoute(context) || getTweetStatusId(context.tweet) !== context.statusId)) {
    throw new Error("AI Slop action canceled");
  }
};

const sleep = (ms, context) => new Promise((resolve, reject) => {
  if (context?.signal.aborted) { reject(new Error("AI Slop action canceled")); return; }
  const cancel = () => { clearTimeout(timer); reject(new Error("AI Slop action canceled")); };
  const timer = setTimeout(() => { context?.signal.removeEventListener("abort", cancel); resolve(); }, ms);
  context?.signal.addEventListener("abort", cancel, { once: true });
});

const normalizeText = (text) => (text || "").replace(/\s+/g, " ").trim();

const isVisible = (element) => {
  if (!element || !(element instanceof HTMLElement)) return false;

  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
};

const isActionable = (element) => isVisible(element) && !element.disabled && element.getAttribute("aria-disabled") !== "true";

const waitFor = async (callback, timeout = 4000, context) => {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    assertActionActive(context);
    const result = callback();
    if (result) return result;
    await sleep(100, context);
  }

  throw new Error("Timed out waiting for X action dialog");
};

const matchesAny = (text, patterns) => {
  const normalized = normalizeText(text);
  return patterns.some((pattern) => pattern.test(normalized));
};

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findVisibleByText = (patterns, { root = document, selector = ACTION_SELECTOR, predicate = () => true } = {}) =>
  Array.from(root.querySelectorAll(selector)).find(
    (element) => isActionable(element) && matchesAny(element.innerText || element.textContent || element.getAttribute("aria-label"), patterns) && predicate(element)
  );

const clickVisibleByText = (patterns, options, context) => {
  assertActionActive(context);
  const element = findVisibleByText(patterns, options);
  if (!element) return false;

  element.click();
  return true;
};

const getLatestDialog = () => {
  const dialogs = Array.from(document.querySelectorAll(DIALOG_SELECTOR)).filter(isVisible);
  return dialogs[dialogs.length - 1];
};

const getLatestMenu = () => {
  const menus = Array.from(document.querySelectorAll(MENU_SELECTOR)).filter(isVisible);
  return menus[menus.length - 1];
};

const clickDialogAction = (patterns, context) => {
  assertActionActive(context);
  const dialog = getLatestDialog();
  if (!dialog) return false;

  const element = findVisibleByText(patterns, {
    root: dialog,
    selector: 'button, [role="button"]',
  });

  if (!element) return false;

  element.click();
  return normalizeText(element.textContent || element.getAttribute("aria-label"));
};

const closeDialogIfPresent = () => {
  const dialog = getLatestDialog();
  if (!dialog) return;

  const closeButton = dialog.querySelector('[aria-label="Close"]');
  if (isVisible(closeButton)) closeButton.click();
};

const closeMenuIfPresent = () => {
  if (!getLatestMenu()) return;

  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Escape",
      key: "Escape",
      keyCode: 27,
      which: 27,
    })
  );
};

const isSelectedChoice = (element) =>
  element.getAttribute("aria-checked") === "true" || element.getAttribute("aria-selected") === "true" || Boolean(element.closest('[aria-checked="true"], [aria-selected="true"]'));

const getTweetStatusLink = (tweet) => {
  const links = Array.from(tweet.querySelectorAll('a[href*="/status/"]')).filter((link) => {
    if (link.closest(selectors.tweet) !== tweet || link.parentElement.closest('[data-testid="quoteTweet"], div[role="link"]')) return false;
    try {
      const url = new URL(link.href);
      return url.origin === location.origin && /^\/[^/]+\/status\/\d+(?:\/|$)/.test(url.pathname);
    } catch {
      return false;
    }
  });
  return links.find((link) => link.querySelector("time")) || links[0];
};

const getTweetAuthorHandle = (tweet) => {
  const statusLink = getTweetStatusLink(tweet);

  if (!statusLink) return null;

  try {
    return new URL(statusLink.href).pathname.split("/")[1];
  } catch {
    return null;
  }
};

const getStatusIdFromPathname = (pathname) => pathname.match(/^\/[^/]+\/status\/(\d+)/)?.[1] || null;

const getCurrentStatusId = () => getStatusIdFromPathname(activeAction?.composing && isActionRoute(activeAction) ? activeAction.pathname : window.location.pathname);

const getTweetStatusId = (tweet) => {
  const statusLink = getTweetStatusLink(tweet);

  if (!statusLink) return null;

  try {
    return getStatusIdFromPathname(new URL(statusLink.href).pathname);
  } catch {
    return null;
  }
};

const isConfirmationForTweet = (button, tweet) => {
  const identity = confirmationIdentities.get(button);
  return Boolean(identity && identity.statusId === getTweetStatusId(tweet) && identity.authorHandle === getTweetAuthorHandle(tweet) && identity.pathname === location.pathname);
};

const isEligibleReplyTweet = (tweet) => {
  const rootStatusId = getCurrentStatusId();
  const statusId = getTweetStatusId(tweet);
  return Boolean(rootStatusId && statusId && statusId !== rootStatusId && isVisible(tweet));
};

const openTweetMenu = async (tweet, context) => {
  assertActionActive(context);
  if (getLatestDialog() || getLatestMenu()) throw new Error("Close the current X dialog or menu before using AI Slop");
  const caret = Array.from(tweet.querySelectorAll('[data-testid="caret"]')).find((button) => button.closest(selectors.tweet) === tweet && !button.closest('[data-testid="quoteTweet"], div[role="link"]'));
  if (!caret) throw new Error("Could not find X post menu button");

  caret.click();

  return waitFor(getLatestMenu, 4000, context);
};

const findTweetMenuItem = (menu, patterns) =>
  findVisibleByText(patterns, {
    root: menu,
    selector: '[role="menuitem"], [role="menuitemradio"], [role="button"]',
  });

const completeSpamReport = async (context) => {
  await waitFor(getLatestDialog, 6000, context);

  let selectedSpam = false;
  let reportSubmitted = false;
  for (let step = 0; step < 10; step++) {
    assertActionActive(context);
    const dialog = getLatestDialog();
    if (!dialog) {
      if (reportSubmitted) return;
      throw new Error("X spam report was closed before submission");
    }

    if (reportSubmitted && clickDialogAction([/^done$/i], context)) {
      await sleep(300, context);
      return;
    }

    if (!reportSubmitted) {
      const action = clickDialogAction(selectedSpam ? [/^next$/i, /^continue$/i, /^submit$/i, /^report$/i] : [/^next$/i, /^continue$/i], context);
      if (action) {
        if (selectedSpam && /^(?:submit|report)$/i.test(action)) reportSubmitted = true;
        await sleep(700, context);
        continue;
      }

      if (
        clickVisibleByText([/^spam\b/i, /^it['’]s spam\b/i, /^it is spam\b/i], {
          root: dialog,
          selector: ACTION_SELECTOR,
          predicate: (element) => !isSelectedChoice(element),
        }, context)
      ) {
        selectedSpam = true;
        await sleep(500, context);
        continue;
      }
    }

    await sleep(500, context);
  }

  closeDialogIfPresent();
  throw new Error("Could not complete X spam report flow");
};

const reportTweetAsSpam = async (tweet, context) => {
  const menu = await openTweetMenu(tweet, context);
  const reportItem = findTweetMenuItem(menu, [/^report post$/i, /^report tweet$/i, /^report$/i]);

  if (!reportItem) {
    closeMenuIfPresent();
    throw new Error("Could not find X report menu action");
  }

  assertActionActive(context);
  reportItem.click();
  return completeSpamReport(context);
};

const discardReplyComposer = async () => {
  if (!getLatestDialog()?.querySelector('[data-testid="tweetButton"]')) return;

  closeDialogIfPresent();
  // A composer with an attachment asks whether to save the draft.
  await waitFor(() => clickDialogAction([/^discard$/i]) || !getLatestDialog(), 3000).catch(() => {});
};

// Posts the framed capture as a reply. Any failure discards the draft and stops the workflow before the report.
const postScreenshotReply = async (tweet, authorHandle, context) => {
  const replyButton = Array.from(tweet.querySelectorAll('[data-testid="reply"]')).find((button) => button.closest(selectors.tweet) === tweet && !button.closest('[data-testid="quoteTweet"], div[role="link"]'));
  if (!isActionable(replyButton)) throw new Error("X does not allow a reply to this post");

  const capture = await captureElement(tweet, { hideSelector: `.${CONTROL_CLASS}` });
  const image = await canvasToImageBlob(frameAiSlopScreenshot(capture, { iconPaths: AI_SLOP_ICON_PATHS }));
  assertActionActive(context);
  if (getLatestDialog() || getLatestMenu()) throw new Error("Close the current X dialog or menu before using AI Slop");

  context.composing = true;
  try {
    replyButton.click();
    const composer = await waitFor(() => {
      const dialog = getLatestDialog();
      return dialog?.querySelector('input[type="file"]') && dialog.querySelector('[data-testid="tweetButton"]') ? dialog : null;
    }, 6000, context);
    if (!new RegExp(`@${escapeRegExp(authorHandle)}\\b`, "i").test(normalizeText(composer.innerText))) throw new Error("X reply composer does not identify the expected author");

    const files = new DataTransfer();
    files.items.add(new File([image], `${REPLY_IMAGE_NAME}.${image.type === "image/jpeg" ? "jpg" : "png"}`, { type: image.type }));
    const input = composer.querySelector('input[type="file"]');
    input.files = files.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    const postButton = await waitFor(() => {
      const button = composer.querySelector('[data-testid="tweetButton"]');
      return composer.querySelector('[data-testid="attachments"]') && isActionable(button) ? button : null;
    }, 20000, context);
    postButton.click();
    await waitFor(() => !composer.isConnected && location.pathname === context.pathname, 20000, context);
  } catch (error) {
    await discardReplyComposer().catch(() => {});
    throw error;
  } finally {
    context.composing = false;
  }
};

const blockTweetAuthor = async (tweet, authorHandle, context) => {
  if (!authorHandle) throw new Error("Could not identify the X post author");
  const blockPatterns = [new RegExp(`^block\\s+@?${escapeRegExp(authorHandle)}$`, "i")];
  const unblockPatterns = [new RegExp(`^unblock\\s+@?${escapeRegExp(authorHandle)}$`, "i")];

  const menu = await openTweetMenu(tweet, context);
  const unblockItem = findTweetMenuItem(menu, unblockPatterns);

  if (unblockItem) {
    closeMenuIfPresent();
    return;
  }

  const blockItem = findTweetMenuItem(menu, blockPatterns);

  if (!blockItem) {
    closeMenuIfPresent();
    throw new Error("Could not find X block menu action");
  }

  assertActionActive(context);
  blockItem.click();
  const dialog = await waitFor(getLatestDialog, 5000, context);
  if (!new RegExp(`@${escapeRegExp(authorHandle)}\\b`, "i").test(normalizeText(dialog.textContent))) throw new Error("X block confirmation does not identify the expected author");

  if (!clickDialogAction([/^block$/i], context)) {
    throw new Error("Could not confirm X block dialog");
  }
};

const setButtonState = (button, state, label) => {
  button.dataset.state = state;
  button.title = label;
  button.setAttribute("aria-label", label);
};

const clearConfirmationTimeout = (button) => {
  const timeout = confirmationTimeouts.get(button);
  if (timeout) clearTimeout(timeout);
  confirmationTimeouts.delete(button);
  confirmationStartTimes.delete(button);
  confirmationIdentities.delete(button);
};

const clearButtonResetTimeout = (button) => {
  clearTimeout(buttonResetTimeouts.get(button));
  buttonResetTimeouts.delete(button);
};

const removeCountdownRing = (button) => {
  button.querySelectorAll(`.${COUNTDOWN_RING_CLASS}`).forEach((ring) => ring.remove());
};

const resetAiSlopButton = (button) => {
  clearConfirmationTimeout(button);
  removeCountdownRing(button);
  setButtonState(button, "idle", "AI slop");
};

const addCountdownRing = (button) => {
  removeCountdownRing(button);

  const iconWrap = button.querySelector(`.${ICON_WRAP_CLASS}`) || button;
  const ring = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  ring.setAttribute("viewBox", "0 0 44 44");
  ring.setAttribute("aria-hidden", "true");
  ring.setAttribute("class", COUNTDOWN_RING_CLASS);

  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", "22");
  circle.setAttribute("cy", "22");
  circle.setAttribute("r", "21");
  circle.setAttribute("fill", "none");
  circle.setAttribute("pathLength", "100");
  ring.appendChild(circle);

  iconWrap.appendChild(ring);
  syncCountdownRing(button);
};

const armAiSlopButton = (button, target, tweet) => {
  clearButtonResetTimeout(button);
  clearConfirmationTimeout(button);
  confirmationStartTimes.set(button, Date.now());
  confirmationIdentities.set(button, { statusId: getTweetStatusId(tweet), authorHandle: getTweetAuthorHandle(tweet), pathname: location.pathname });
  setButtonState(button, "confirming", `Click again within 3 seconds to ${aiSlopReplyEnabled ? "reply with a screenshot, " : ""}report this post as spam and block ${target}`);
  addCountdownRing(button);

  const timeout = setTimeout(() => {
    if (button.dataset.state === "confirming") resetAiSlopButton(button);
  }, CONFIRMATION_WINDOW_MS);

  confirmationTimeouts.set(button, timeout);
};

const syncCountdownRing = (button) => {
  const ring = button.querySelector(`.${COUNTDOWN_RING_CLASS}`);
  if (!ring) return;

  const elapsed = Math.min(Date.now() - (confirmationStartTimes.get(button) || Date.now()), CONFIRMATION_WINDOW_MS);
  ring.style.animationDuration = `${CONFIRMATION_WINDOW_MS}ms`;
  ring.style.animationDelay = `-${elapsed}ms`;
};

const revealReportedTweet = (tweet, forget = true) => {
  const statusId = getTweetStatusId(tweet);
  if (forget && statusId) reportedTweetStatusIds.delete(statusId);

  tweet.classList.remove(REPORTED_CLASS);
  tweet.querySelectorAll(`.${REPORTED_NOTICE_CLASS}`).forEach((notice) => notice.remove());
  Array.from(tweet.children).forEach((child) => {
    if (child.dataset.aiSlopReportedHidden !== "true") return;

    const previous = reportedChildDisplays.get(child);
    if (previous?.value) child.style.setProperty("display", previous.value, previous.priority);
    else child.style.removeProperty("display");
    reportedChildDisplays.delete(child);
    delete child.dataset.aiSlopReportedHidden;
  });
};

const createReportedNotice = (tweet) => {
  const notice = document.createElement("div");
  notice.className = REPORTED_NOTICE_CLASS;

  const message = document.createElement("div");
  message.className = `${REPORTED_NOTICE_CLASS}-message`;
  message.textContent = "You reported this Post.";

  const actions = document.createElement("div");
  actions.className = `${REPORTED_NOTICE_CLASS}-actions`;

  const viewButton = document.createElement("button");
  viewButton.type = "button";
  viewButton.className = REPORTED_VIEW_BUTTON_CLASS;
  viewButton.textContent = "View";
  viewButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    revealReportedTweet(tweet);
  });

  actions.appendChild(viewButton);
  notice.append(message, actions);

  return notice;
};

const collapseReportedTweet = (tweet) => {
  if (!tweet) return;

  const statusId = getTweetStatusId(tweet);
  if (statusId) reportedTweetStatusIds.add(statusId);

  let notice = tweet.querySelector(`:scope > .${REPORTED_NOTICE_CLASS}`);
  if (!notice) {
    notice = createReportedNotice(tweet);
    tweet.appendChild(notice);
  }
  notice.dataset.aiSlopStatusId = statusId || "";

  tweet.classList.add(REPORTED_CLASS);
  Array.from(tweet.children).forEach((child) => {
    if (child === notice) return;
    if (child.dataset.aiSlopReportedHidden !== "true") reportedChildDisplays.set(child, { value: child.style.getPropertyValue("display"), priority: child.style.getPropertyPriority("display") });
    child.style.setProperty("display", "none", "important");
    child.dataset.aiSlopReportedHidden = "true";
  });
};

const getDirectChild = (ancestor, descendant) => {
  let child = descendant;

  while (child?.parentElement && child.parentElement !== ancestor) {
    child = child.parentElement;
  }

  return child?.parentElement === ancestor ? child : null;
};

const getTweetActionPlacement = (tweet) => {
  const caret = Array.from(tweet.querySelectorAll('[data-testid="caret"]')).find((button) => button.closest(selectors.tweet) === tweet && !button.closest('[data-testid="quoteTweet"], div[role="link"]'));
  if (!caret) return null;

  const grokButton = Array.from(tweet.querySelectorAll('button[aria-label="Grok actions"]')).find((button) => button.closest(selectors.tweet) === tweet && !button.closest('[data-testid="quoteTweet"], div[role="link"]'));
  let actionsContainer = null;

  if (grokButton) {
    let node = caret.parentElement;

    while (node && node !== tweet) {
      if (node.contains(grokButton) && node.contains(caret)) {
        actionsContainer = node;
        break;
      }

      node = node.parentElement;
    }
  }

  if (!actionsContainer) {
    actionsContainer = caret.parentElement?.parentElement;
  }

  const caretSlot = actionsContainer ? getDirectChild(actionsContainer, caret) : null;
  const grokSlot = actionsContainer && grokButton ? getDirectChild(actionsContainer, grokButton) : null;

  if (!actionsContainer || !caretSlot) return null;

  return { actionsContainer, caretSlot, grokSlot };
};

const tintAiSlopButton = (button) => {
  button.style.color = BUTTON_COLOR;

  button.querySelectorAll("[style]").forEach((element) => {
    element.style.color = BUTTON_COLOR;
  });
};

const createAiSlopIcon = (className) => {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 25 24");
  icon.setAttribute("aria-hidden", "true");
  if (className) icon.setAttribute("class", className);

  AI_SLOP_ICON_PATHS.forEach((pathData) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    path.setAttribute("fill", "currentColor");
    icon.appendChild(path);
  });

  return icon;
};

const replaceButtonIcon = (button) => {
  const existingIcon = button.querySelector("svg");
  const icon = createAiSlopIcon(existingIcon?.getAttribute("class"));
  const wrapper = document.createElement("span");
  wrapper.className = ICON_WRAP_CLASS;
  wrapper.appendChild(icon);

  if (existingIcon) {
    existingIcon.replaceWith(wrapper);
  } else {
    button.appendChild(wrapper);
  }
};

const createFallbackAiSlopControl = () => {
  const wrapper = document.createElement("div");
  wrapper.className = CONTROL_CLASS;

  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("role", "button");
  button.className = BUTTON_CLASS;
  replaceButtonIcon(button);
  wrapper.appendChild(button);

  return wrapper;
};

const createAiSlopControl = (sourceSlot) => {
  const wrapper = sourceSlot ? sourceSlot.cloneNode(true) : createFallbackAiSlopControl();
  wrapper.classList.add(CONTROL_CLASS);
  wrapper.removeAttribute("id");
  wrapper.removeAttribute("data-testid");
  wrapper.querySelectorAll("[id], [data-testid]").forEach((element) => { element.removeAttribute("id"); element.removeAttribute("data-testid"); });

  const button = wrapper.querySelector("button") || wrapper;
  button.classList.add(BUTTON_CLASS);
  button.type = "button";
  button.dataset.state = "idle";
  button.removeAttribute("aria-expanded");
  button.removeAttribute("aria-haspopup");
  button.removeAttribute("aria-controls");
  button.removeAttribute("aria-describedby");
  button.removeAttribute("aria-labelledby");
  button.removeAttribute("data-testid");
  setButtonState(button, "idle", "AI slop");
  replaceButtonIcon(button);
  tintAiSlopButton(button);
  button.addEventListener("click", handleAiSlopClick);

  return wrapper;
};

const handleAiSlopClick = async (event) => {
  event.preventDefault();
  event.stopPropagation();

  const button = event.currentTarget;
  const tweet = button.closest(selectors.tweet);
  if (!aiSlopEnabled || !tweet || !isEligibleReplyTweet(tweet) || activeAction) return;
  const authorHandle = getTweetAuthorHandle(tweet);
  if (!authorHandle) return;
  const target = authorHandle ? `@${authorHandle}` : "this account";

  if (button.dataset.state === "loading") return;
  if (button.dataset.state !== "confirming" || !isConfirmationForTweet(button, tweet) || Date.now() - confirmationStartTimes.get(button) >= CONFIRMATION_WINDOW_MS) {
    armAiSlopButton(button, target, tweet);
    return;
  }

  const controller = new AbortController();
  const context = { controller, signal: controller.signal, tweet, statusId: getTweetStatusId(tweet), pathname: location.pathname };
  activeAction = context;
  try {
    clearConfirmationTimeout(button);
    removeCountdownRing(button);
    setButtonState(button, "loading", "working");
    if (aiSlopReplyEnabled) {
      await postScreenshotReply(tweet, authorHandle, context);
      await sleep(600, context);
    }
    await reportTweetAsSpam(tweet, context);
    await sleep(300, context);
    await blockTweetAuthor(tweet, authorHandle, context);
    assertActionActive(context);
    setButtonState(button, "done", "blocked");
    collapseReportedTweet(tweet);
  } catch (error) {
    if (!context.signal.aborted) {
      console.warn("Zen mode for X: AI Slop action failed", error);
      setButtonState(button, "error", "failed");
    }
  } finally {
    if (activeAction === context) activeAction = undefined;
    if (!context.signal.aborted && button.isConnected) {
      const timeout = setTimeout(() => { buttonResetTimeouts.delete(button); resetAiSlopButton(button); }, 2500);
      buttonResetTimeouts.set(button, timeout);
    }
  }
};

const addAiSlopButtonToTweet = (tweet) => {
  const statusId = getTweetStatusId(tweet);

  const notice = tweet.querySelector(`:scope > .${REPORTED_NOTICE_CLASS}`);
  if (notice && notice.dataset.aiSlopStatusId !== statusId) revealReportedTweet(tweet, false);
  if (notice?.isConnected || (statusId && reportedTweetStatusIds.has(statusId))) {
    collapseReportedTweet(tweet);
    return;
  }

  if (!isEligibleReplyTweet(tweet)) return;

  const placement = getTweetActionPlacement(tweet);
  if (!placement) return;

  tweet.classList.add(TWEET_CLASS);

  const control = tweet.querySelector(`.${CONTROL_CLASS}`) || createAiSlopControl(placement.grokSlot || placement.caretSlot);
  const reference = placement.grokSlot || placement.caretSlot;
  const button = control.querySelector(`.${BUTTON_CLASS}`);
  if (button?.dataset.state === "confirming") syncCountdownRing(button);

  if (control.parentElement !== placement.actionsContainer || control.nextSibling !== reference) {
    placement.actionsContainer.insertBefore(control, reference);
  }
};

const removeAiSlopButtons = () => {
  activeAction?.controller.abort();
  buttonResetTimeouts.forEach(clearTimeout);
  buttonResetTimeouts.clear();
  document.querySelectorAll(`.${BUTTON_CLASS}`).forEach(clearConfirmationTimeout);
  document.querySelectorAll(`.${CONTROL_CLASS}`).forEach((control) => control.remove());
  reportedTweetStatusIds.clear();
  document.querySelectorAll(selectors.tweet).forEach((tweet) => {
    const hasReportedNotice = Boolean(tweet.querySelector(`:scope > .${REPORTED_NOTICE_CLASS}`));
    const hasHiddenReportedChild = Array.from(tweet.children).some((child) => child.dataset.aiSlopReportedHidden === "true");
    if (tweet.classList.contains(REPORTED_CLASS) || hasReportedNotice || hasHiddenReportedChild) revealReportedTweet(tweet);
  });
  document.querySelectorAll(`.${TWEET_CLASS}`).forEach((tweet) => tweet.classList.remove(TWEET_CLASS));
};

const removeIneligibleAiSlopButtons = () => {
  if (activeAction && (!isActionRoute(activeAction) || getTweetStatusId(activeAction.tweet) !== activeAction.statusId)) activeAction.controller.abort();
  document.querySelectorAll(`.${TWEET_CLASS}`).forEach((tweet) => {
    if (isEligibleReplyTweet(tweet)) {
      tweet.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button) => {
        if (button.dataset.state === "confirming" && !isConfirmationForTweet(button, tweet)) resetAiSlopButton(button);
      });
      return;
    }

    tweet.querySelectorAll(`.${CONTROL_CLASS}`).forEach((control) => {
      control.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button) => { clearConfirmationTimeout(button); clearButtonResetTimeout(button); });
      control.remove();
    });
    tweet.classList.remove(TWEET_CLASS);
  });
};

const addAiSlopStyles = () => {
  addStyles(
    STYLE_ID,
    `
    .${BUTTON_CLASS} {
      align-items: center;
      background: transparent !important;
      border: 0 !important;
      box-sizing: border-box;
      color: ${BUTTON_COLOR} !important;
      cursor: pointer;
      display: inline-flex;
      flex: 0 0 auto;
      height: 100%;
      justify-content: center;
      margin: 0;
      min-height: 0;
      min-width: 0;
      padding: 0 !important;
      position: relative;
      width: 100%;
    }

    .${BUTTON_CLASS} [style] {
      color: ${BUTTON_COLOR} !important;
    }

    .${BUTTON_CLASS}[data-state="confirming"],
    .${BUTTON_CLASS}[data-state="confirming"] [style] {
      color: ${CONFIRM_COLOR} !important;
    }

    .${BUTTON_CLASS} svg,
    .${BUTTON_CLASS} path {
      color: currentColor;
      fill: currentColor;
    }

    .${BUTTON_CLASS} svg {
      display: block;
      flex: 0 0 auto;
      height: 18.75px;
      max-height: 18.75px;
      max-width: 18.75px;
      transform: scale(0.9);
      transform-origin: center;
      width: 18.75px;
    }

    .${ICON_WRAP_CLASS} {
      align-items: center;
      display: inline-flex;
      height: 18.75px;
      justify-content: center;
      line-height: 0;
      position: relative;
      width: 18.75px;
    }

    .${ICON_WRAP_CLASS} > svg:not(.${COUNTDOWN_RING_CLASS}) {
      height: 18.75px;
      max-height: 18.75px;
      max-width: 18.75px;
      width: 18.75px;
    }

    .${CONTROL_CLASS} {
      align-items: center;
      box-sizing: border-box;
      display: inline-flex;
      flex: 0 0 auto;
      height: auto;
      justify-content: center;
      margin: 0 !important;
      min-height: 0;
      min-width: 0;
      width: auto;
    }

    .${BUTTON_CLASS}:hover,
    .${BUTTON_CLASS}:focus-visible {
      outline: none;
    }

    .${BUTTON_CLASS}[data-state="loading"] {
      cursor: wait;
      opacity: 0.75;
    }

    .${COUNTDOWN_RING_CLASS} {
      height: 20.625px !important;
      left: 50%;
      overflow: visible;
      pointer-events: none;
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%) rotate(-90deg) !important;
      width: 20.625px !important;
    }

    .${COUNTDOWN_RING_CLASS} circle {
      animation: mt-ai-slop-countdown ${CONFIRMATION_WINDOW_MS}ms linear forwards;
      stroke: ${CONFIRM_COLOR};
      stroke-dasharray: 100;
      stroke-dashoffset: 0;
      stroke-linecap: round;
      stroke-width: 2;
    }

    @keyframes mt-ai-slop-countdown {
      to {
        stroke-dashoffset: 100;
      }
    }

    .${REPORTED_CLASS} > :not(.${REPORTED_NOTICE_CLASS}) {
      display: none !important;
    }

    .${REPORTED_NOTICE_CLASS} {
      align-items: center;
      background-color: rgb(22, 24, 28);
      border: 1px solid rgb(32, 35, 39);
      border-radius: 16px;
      box-sizing: border-box;
      display: flex;
      font-family: TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
      gap: 12px;
      justify-content: space-between;
      margin: 12px 0;
      min-height: 0;
      padding: 6px 4px;
      width: 100%;
    }

    .${REPORTED_NOTICE_CLASS}-message {
      color: ${BUTTON_COLOR};
      font-size: 15px;
      line-height: 20px;
      margin: 0 12px;
      min-width: 0;
    }

    .${REPORTED_NOTICE_CLASS}-actions {
      align-items: center;
      display: flex;
      flex-shrink: 0;
    }

    .${REPORTED_VIEW_BUTTON_CLASS} {
      align-items: center;
      background: transparent;
      border: 1px solid rgba(0, 0, 0, 0);
      border-radius: 9999px;
      color: rgb(239, 243, 244);
      cursor: pointer;
      display: inline-flex;
      font-family: inherit;
      font-size: 15px;
      font-weight: 700;
      justify-content: center;
      line-height: 20px;
      min-height: 32px;
      min-width: 32px;
      padding: 0 12px;
    }

    .${REPORTED_VIEW_BUTTON_CLASS}:hover {
      background: rgba(239, 243, 244, 0.1);
    }

    `
  );
};

export const changeAiSlopReply = (aiSlopReply) => {
  aiSlopReplyEnabled = aiSlopReply === "on";
};

export const changeAiSlopButton = (aiSlopButton) => {
  switch (aiSlopButton) {
    case "off":
      aiSlopEnabled = false;
      removeAiSlopButtons();
      removeStyles(STYLE_ID);
      break;

    case "on":
      aiSlopEnabled = true;
      addAiSlopStyles();
      removeIneligibleAiSlopButtons();
      document.querySelectorAll(selectors.tweet).forEach(addAiSlopButtonToTweet);
      break;
  }
};
