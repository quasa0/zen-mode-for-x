import { KeyWriterMode } from "../../../../storage-keys";
import selectors from "../../selectors";
import svgAssets from "../svgAssets";
import addStyles, { removeStyles } from "../utilities/addStyles";
import { addSidebarButton } from "../utilities/sidebar";
import { getStorage, setStorage } from "../utilities/storage";

// Utilities

export const changeSidebarSetting = (sidebarSelector, state, onAdd) => {
  switch (state) {
    case "off":
      removeStyles(`${sidebarSelector}-force-show`);
      addStyles(
        sidebarSelector,
        `${selectors.sidebarLinks[sidebarSelector]} {
          display: none !important;
        }`,
      );
      break;

    case "on":
      removeStyles(sidebarSelector);
      removeStyles(`${sidebarSelector}-force-show`);
      onAdd?.();
      break;
  }
};

const changeExploreButtonSetting = (state) => {
  changeSidebarSetting("explore", state);

  if (state === "on") {
    addStyles(
      "explore-force-show",
      `${selectors.sidebarLinks.explore} {
        display: flex !important;
      }`,
    );
  }
};

// Functions

export const changeSidebarLogo = (state) => changeSidebarSetting("logo", state);
export const changeHomeButton = (state) => changeSidebarSetting("home", state);
export const changeExploreButton = (state) => changeExploreButtonSetting(state);
export const changeNotificationsButton = (state) => changeSidebarSetting("notifications", state);
export const changeMessagesButton = (state) => changeSidebarSetting("messages", state);
export const changeBookmarksButton = (state) => changeSidebarSetting("bookmarks", state);
export const changeJobsButton = (state) => changeSidebarSetting("jobs", state);
export const changeArticlesButton = (state) => changeSidebarSetting("articles", state);
export const changeVerifiedOrgsButton = (state) => changeSidebarSetting("verifiedOrgs", state);
export const changeProfileButton = (state) => changeSidebarSetting("profile", state);
export const changeXPremiumButton = (state) => changeSidebarSetting("xPremium", state, addXPremiumButton);
export const changeGrokButton = (state) => changeSidebarSetting("grok", state);
export const changeTopicsButton = (state) => changeSidebarSetting("topics", state, addTopicsButton);
export const changeCommunitiesButton = (state) => changeSidebarSetting("communities", state, addCommunitiesButton);
export const changeListsButton = (state) => changeSidebarSetting("lists", state, addListsButton);
export const changeZenWriterModeButton = (state) => changeSidebarSetting("zenWriterMode", state, addZenWriterModeButton);

export const addZenWriterModeButton = (writerMode) => {
  addSidebarButton({
    name: "Zen Writer Mode",
    svgAsset: svgAssets.zenWriterMode.normal,
    onClick: async () => {
      const writerMode = await getStorage(KeyWriterMode);
      await setStorage({ [KeyWriterMode]: writerMode === "on" ? "off" : "on" });
      updateZenWriterModeButtonState(writerMode === "on" ? "off" : "on");
    },
  });

  updateZenWriterModeButtonState(writerMode);
};

export const updateZenWriterModeButtonState = async (writerMode) => {
  const button = document.querySelector(`${selectors.leftSidebarLinks} > .mt-sidebar-button[aria-label="Zen Writer Mode"]`);

  if (!button) return;

  const state = writerMode ?? (await getStorage(KeyWriterMode));
  button.classList.add("mt-zen-writer-mode-button");
  button.classList.toggle("mt-zen-writer-mode-button-active", state === "on");
  button.setAttribute("aria-pressed", String(state === "on"));
};

export const addXPremiumButton = () => {
  addSidebarButton({
    name: "Premium",
    href: "/settings/premium",
    svgAsset: svgAssets.xPremium.normal,
    nativeSelector: selectors.sidebarLinks.xPremium,
  });
};

export const addTopicsButton = () => {
  addSidebarButton({
    name: "Topics",
    userHref: "/topics",
    svgAsset: svgAssets.topics.normal,
  });
};

export const addCommunitiesButton = () => {
  addSidebarButton({
    name: "Communities",
    userHref: "/communities",
    svgAsset: svgAssets.communities.normal,
  });
};

export const addListsButton = () => {
  addSidebarButton({
    name: "Lists",
    userHref: "/lists",
    svgAsset: svgAssets.lists.normal,
  });
};

export const changeUnreadCountBadge = (unreadCountBadge) => {
  switch (unreadCountBadge) {
    case "on":
      removeStyles("unreadCountBadge");
      break;
    case "off":
      addStyles(
        "unreadCountBadge",
        `${selectors.leftSidebarUnreadBadge} {
          display: none;
        }
        ${selectors.accountSwitcherButton} > div > svg+div[aria-label] {
          display: none;
        }`,
      );
      break;
  }
};

const addStyleToRemoveLabels = () => {
  addStyles(
    "removeLabels",
    `
    ${selectors.leftSidebarLinks} > * > div > div + div:last-child {
      display: none;
    }
    ${selectors.accountSwitcherLabel} {
      display: none;
    }
    `,
  );
};

const addStyleToShowLabelsOnHover = () => {
  addStyles(
    "hideLabels",
    `
    ${selectors.leftSidebarLabel},
    ${selectors.accountSwitcherLabel} {
      display: inline-block;
      opacity: 0;
      transition: opacity 0.2s cubic-bezier(0.23, 1, 0.32, 1);
    }
    `,
  );
  addStyles(
    "showLabelsOnHover",
    `
    ${selectors.leftSidebarLabel_hover},
    ${selectors.accountSwitcherLabel_hover} {
      opacity: 1;
    }
    `,
  );
};

export const changeNavigationButtonsLabels = async (setting) => {
  const isMessagesPage = window.location.pathname.startsWith("/messages") || window.location.pathname.startsWith("/i/chat");
  const isSearchPage = window.location.pathname.startsWith("/search");

  if (isMessagesPage || isSearchPage) {
    removeStyles("navigation-position");
    addStyles(
      "customDMsAndSearchStyle",
      `
${selectors.leftSidebar} {
flex: 0.5 1 auto;
}
@media only screen and (min-width: 1200px) {
  ${selectors.leftSidebar} {
    flex: 0.3 1 auto;
  }
}
${selectors.mainWrapper} {
align-items: flex-start;
}
`,
    );
  } else {
    removeStyles("customDMsAndSearchStyle");
  }

  switch (setting) {
    case "never":
      addStyleToRemoveLabels();
      removeStyles("hideLabels");
      removeStyles("showLabelsOnHover");

      break;
    case "always":
      removeStyles("hideLabels");
      removeStyles("removeLabels");
      removeStyles("showLabelsOnHover");

      break;
    case "hover":
      removeStyles("removeLabels");
      addStyleToShowLabelsOnHover();

      break;
  }
};

export const changeNavigationCenter = (navigationCenter) => {
  switch (navigationCenter) {
    case "on":
      addStyles(
        "navigationCenter",
        `
        ${selectors.leftSidebar} > div > div > div {
          justify-content: center !important;
          padding-top: 0 !important;
        }
        `,
      );
      break;

    case "off":
      removeStyles("navigationCenter");
      break;
  }
};

export const hideGrokDrawer = (state) => {
  switch (state) {
    case "on":
      // If mt-grok-drawer-enabled class is present because we added it when grok button from a post is clicked.
      // We don't want to hide the drawer in this case.
      addStyles(
        "grokDrawer",
        `${selectors.grokDrawer}:not(.mt-grok-drawer-enabled) {
          display: none !important;
        }`,
      );
      break;
    case "off":
      removeStyles("grokDrawer");
      break;
  }
};
