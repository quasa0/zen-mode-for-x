import selectors from "../../selectors";
import addStyles, { removeStyles, stylesExist } from "../utilities/addStyles";
export { changeRecentMedia } from "./recentMedia";

export const changeTimelineWidth = (timelineWidth) => {
  switch (timelineWidth) {
    case 600:
      addStyles(
        "timelineWidth",
        `
        @media only screen and (min-width: 988px) {
          ${selectors.mainColumn} {
            width: 600px;
            max-width: 600px;
          }
        }
        `
      );
      break;

    case 650:
      addStyles(
        "timelineWidth",
        `
        @media only screen and (min-width: 988px) {
          ${selectors.mainColumn} {
            width: 650px;
            max-width: 650px;
          }
        }
        `
      );
      break;

    case 700:
      addStyles(
        "timelineWidth",
        `
        @media only screen and (min-width: 988px) {
          ${selectors.mainColumn} {
            width: 700px;
            max-width: 700px;
          }
        }
        `
      );
      break;

    case 750:
      addStyles(
        "timelineWidth",
        `
        @media only screen and (min-width: 988px) {
          ${selectors.mainColumn} {
            width: 750px;
            max-width: 750px;
          }
        }
        `
      );
      break;

    case 800:
      addStyles(
        "timelineWidth",
        `
        @media only screen and (min-width: 988px) {
          ${selectors.mainColumn} {
            width: 800px;
            max-width: 800px;
          }
        }
        `
      );
      break;
  }
};

export const changeTimelineBorders = (timelineBorders) => {
  switch (timelineBorders) {
    case "off":
      removeStyles("timelineBorders");
      break;

    case "on":
      addStyles(
        "timelineBorders",
        `
        @media only screen and (min-width: 988px) {
          div${selectors.mainColumn} {
            border-style: hidden;
          }
        }
        `.trim()
      );
      break;
  }
};

export const changeTweetBorders = (tweetBorders) => {
  switch (tweetBorders) {
    case "off":
      removeStyles("tweetBorders");
      break;

    case "on":
      addStyles(
        "tweetBorders",
        `
        ${selectors.mainWrapper} section > div > div > div > div[role="separator"] {
          display: none;
        }
        ${selectors.mainColumn} > div > div:empty {
          background: transparent;
        }
        `.trim()
      );
      break;
  }
};

export const changeStickyHeader = (stickyHeader) => {
  switch (stickyHeader) {
    case "on":
      removeStyles("stickyHeader");
      break;

    case "off":
      addStyles(
        "stickyHeader",
        `
        ${selectors.topHeader} {
          position: static !important;
        }
        `
      );
      break;
  }
};

export const changeTopicsToFollow = (removeTopicsToFollow) => {
  switch (removeTopicsToFollow) {
    case "off":
      removeStyles("removeTopicsToFollow");
      document.querySelectorAll(".mt-whoToFollow").forEach((section) => section.classList.remove("mt-whoToFollow"));
      break;

    case "on":
      addStyles(
        "removeTopicsToFollow",
        `
        ${selectors.mainColumn} section[aria-labelledby^="accessible-list-"] > div[aria-label$="Carousel"],
        ${selectors.mainColumn} a[href*="/i/flow/topics_selector"],
        ${selectors.mainColumn} a[href*="/i/topics/picker/home"] {
          display: none;
        }
        .mt-whoToFollow {
          display: none;
        }
        [aria-label="Lists timeline"] section[aria-labelledby^="accessible-list-"] > div[aria-label$="Carousel"] {
          display: flex;
        }
        `
      );
      hideWhoToFollowSuggestions();
      break;
  }
};

function hideWhoToFollowSuggestions() {
  document.querySelectorAll(".mt-whoToFollow").forEach((section) => section.classList.remove("mt-whoToFollow"));
  const candidates = new Set(document.querySelectorAll(`
    ${selectors.mainColumn} aside[role="complementary"]:has([data-testid="UserCell"]),
    ${selectors.rightSidebar} aside[role="complementary"]:has([data-testid="UserCell"])
  `));
  document.querySelectorAll(`${selectors.mainColumn} h2, ${selectors.mainColumn} [role="heading"]`).forEach((heading) => {
    if (heading.textContent.trim().toLowerCase() !== "who to follow") return;
    const section = heading.closest('[data-testid="cellInnerDiv"], section[aria-labelledby^="accessible-list-"]');
    if (section) candidates.add(section);
  });
  candidates.forEach((section) => {
    if (section.closest('[aria-label="Lists timeline"]') || section.closest(selectors.tweet)) return;
    if (section.querySelector(selectors.tweet) || section.querySelector('[role="textbox"]')) return;
    // User search results and list membership are primary content, not recommendations.
    if (window.location.pathname.startsWith("/i/lists/") && section.closest(selectors.mainColumn)) return;
    section.classList.add("mt-whoToFollow");
  });
}

const isHomeTimeline = () => window.location.pathname === "/home" || window.location.pathname === "/";

export const changeTimelineTabs = (removeTimelineTabs, writerMode) => {
  if (writerMode === "on" || !isHomeTimeline()) {
    removeStyles("removeTimelineTabs");
    return;
  }

  switch (removeTimelineTabs) {
    case "off":
      removeStyles("removeTimelineTabs");
      break;

    case "on":
      if (stylesExist("removeTimelineTabs")) return;

      addStyles(
        "removeTimelineTabs",
        `
        ${selectors.timelineTabs} {
          display: none;
        }
        `
      );
      break;
  }
};

export const changeTrendsHomeTimeline = (trendsHomeTimeline, writerMode) => {
  if (writerMode === "on" || !isHomeTimeline()) {
    removeStyles("trendsHomeTimeline");
    return;
  }

  switch (trendsHomeTimeline) {
    case "off":
      removeStyles("trendsHomeTimeline");
      break;

    case "on":
      if (stylesExist("trendsHomeTimeline")) return;

      addStyles(
        "trendsHomeTimeline",
        `
          @keyframes render {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
              transform: none;
            }
          }
          @media only screen and (min-width: 1265px) {
            ${selectors.rightSidebar} section[aria-labelledby^="accessible-list-"] {
              visibility: visible;
              position: fixed;
              right: 16px;
              top: 66px;
              max-height: 78vh;
              overflow: auto;
              width: 300px;
              border-radius: 16px;
              border-color: var(--border-color);
              border-width: 1px;
              background-color: var(--body-bg-color);
              opacity: 0;
              will-change: opacity;
              animation-name: render;
              animation-duration: 0s;
              animation-fill-mode: forwards;
              animation-delay: 500ms;
              margin-top: 4px;
            }

            [data-testid="primaryColumn"] {
              transform: translateX(-64px);
            }
          }
          `
      );
      break;
  }
};

export const changeFollowingTimeline = (followingTimeline) => {
  if (followingTimeline !== "on" || !isHomeTimeline()) return;

  const tablist = document.querySelector(selectors.timelineTablist);
  const selectedTab = tablist?.querySelector(selectors.timelineTabSelected);

  if (!tablist || !selectedTab) return;

  // Home places Following second; compare elements rather than translated labels.
  const followingTab = tablist.querySelectorAll(selectors.timelineTab)[1];
  if (!followingTab || followingTab === selectedTab || followingTab.getAttribute("aria-selected") === "true") return;
  followingTab.click();
};

const grokButtons = new Set();
let grokHidden = false;
let grokOpenRequested = false;
let grokOpenSeen = false;
let grokObservedHeader;
let grokResizeObserver;

function reconcileGrokDrawer() {
  const drawer = document.querySelector(selectors.grokDrawer);
  const header = drawer?.querySelector(selectors.grokDrawerHeader);
  if (header !== grokObservedHeader) {
    grokResizeObserver?.disconnect();
    grokResizeObserver = undefined;
    grokObservedHeader = header;
    if (header && grokHidden) {
      grokResizeObserver = new ResizeObserver(reconcileGrokDrawer);
      grokResizeObserver.observe(header);
    }
  }
  if (!drawer || !grokHidden || !grokOpenRequested) return;
  const closed = header?.tagName === "BUTTON" || (header?.children.length === 1 && header.children[0].tagName === "BUTTON");
  if (header && !closed) grokOpenSeen = true;
  if (closed && grokOpenSeen) {
    grokOpenRequested = false;
    grokOpenSeen = false;
    drawer.classList.remove("mt-grok-drawer-enabled");
    return;
  }
  if (!drawer.classList.contains("mt-grok-drawer-enabled")) drawer.classList.add("mt-grok-drawer-enabled");
}

const grokClickListener = () => {
  grokOpenRequested = true;
  grokOpenSeen = false;
  reconcileGrokDrawer();
};

export const enableGrokDrawerOnGrokButtonClick = (setting) => {
  grokHidden = setting === "on";
  grokButtons.forEach((button) => {
    if (!grokHidden || !button.isConnected) {
      button.removeEventListener("click", grokClickListener);
      grokButtons.delete(button);
    }
  });
  if (!grokHidden) {
    grokResizeObserver?.disconnect();
    grokResizeObserver = undefined;
    grokObservedHeader = undefined;
    grokOpenRequested = false;
    grokOpenSeen = false;
    document.querySelectorAll(".mt-grok-drawer-enabled").forEach((drawer) => drawer.classList.remove("mt-grok-drawer-enabled"));
    return;
  }
  document.querySelectorAll(selectors.grokSvg).forEach((svg) => {
    const button = svg.closest("button");
    if (!button || grokButtons.has(button)) return;
    button.addEventListener("click", grokClickListener);
    grokButtons.add(button);
  });
  reconcileGrokDrawer();
};
