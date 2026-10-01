/**
 * Dynamic features that respond to Twitter's DOM updates:
 * - Writer mode
 * - Navigation buttons
 * - Timeline customizations
 * - View counts
 * - Typefully integration
 * Applied via MutationObserver on relevant DOM changes
 */

import {
  KeyAiSlopButton,
  KeyCommunitiesButton,
  KeyFollowingTimeline,
  KeyHideGrokDrawer,
  KeyHideViewCount,
  KeyListsButton,
  KeyRemoveTimelineTabs,
  KeyRemoveTopicsToFollow,
  KeyTopicsButton,
  KeyTrendsHomeTimeline,
  KeyTypefullyGrowTab,
  KeyVideoResolutionOverlay,
  KeyWriterMode,
  KeyXPremiumButton,
  KeyNavigationButtonsLabels,
  KeyZenWriterModeButton,
} from "../../../../storage-keys";
import { changeAiSlopButton } from "../options/aiSlopButton";
import changeHideViewCounts from "../options/hideViewCount";
import {
  addAnalyticsButton,
  addCommunitiesButton,
  addListsButton,
  addTopicsButton,
  addXPremiumButton,
  addZenWriterModeButton,
  hideGrokDrawer,
  changeNavigationButtonsLabels,
} from "../options/navigation";
import {
  changeFollowingTimeline,
  changeRecentMedia,
  changeTimelineTabs,
  changeTopicsToFollow,
  changeTrendsHomeTimeline,
  enableGrokDrawerOnGrokButtonClick,
} from "../options/timeline";
import { changeVideoResolutionOverlay } from "../options/videoResolutionOverlay";
import { refreshPostFilters } from "../options/postFilters";
import { refreshMindfulScrolling } from "../options/mindfulScrolling";
import { refreshInfluenceWarnings } from "../options/influenceWarnings";
import { changeWriterMode } from "../options/writerMode";
import { addTypefullyComposerPlug, addTypefullyReplyPlug, saveCurrentReplyToLink, addTypefullySecurityAndAccountAccessPlug, addTypefullySchedulePlug } from "../typefullyPlugs";
import hideRightSidebar from "../utilities/hideRightSidebar";
import { updateLeftSidebarPositioning } from "../utilities/leftSidebarPosition";
import { addSmallerSearchBarStyle } from "../utilities/other-styles";
import { getStorage } from "../utilities/storage";
import { extractColorsAsRootVars } from "../utilities/colors";
import throttle from "../utilities/throttle";

export const dynamicFeatures = {
  general: async () => {
    extractColorsAsRootVars();
    refreshPostFilters();
    refreshMindfulScrolling();
    refreshInfluenceWarnings();
    const data = await getStorage([KeyHideViewCount, KeyHideGrokDrawer, KeyAiSlopButton, KeyVideoResolutionOverlay]);

    changeHideViewCounts(data[KeyHideViewCount]);
    changeAiSlopButton(data[KeyAiSlopButton]);
    changeVideoResolutionOverlay(data[KeyVideoResolutionOverlay]);
    changeRecentMedia();
    hideRightSidebar();
    addSmallerSearchBarStyle();
    updateLeftSidebarPositioning();
    enableGrokDrawerOnGrokButtonClick(data[KeyHideGrokDrawer]);
  },
  typefullyPlugs: () => {
    saveCurrentReplyToLink();
    addTypefullyReplyPlug();
    addTypefullyComposerPlug();
    addTypefullySecurityAndAccountAccessPlug();
    addTypefullySchedulePlug();
  },
  navigation: (data) => {
    changeNavigationButtonsLabels(data[KeyNavigationButtonsLabels]);
  },
  sidebarButtons: async (writerMode) => {
    const data = await getStorage([KeyListsButton, KeyCommunitiesButton, KeyTopicsButton, KeyXPremiumButton, KeyTypefullyGrowTab, KeyZenWriterModeButton]);

    if (!data) return;

    if (data[KeyListsButton] === "on") addListsButton();
    if (data[KeyCommunitiesButton] === "on") addCommunitiesButton();
    if (data[KeyTopicsButton] === "on") addTopicsButton();
    if (data[KeyXPremiumButton] === "on") addXPremiumButton();
    if (data[KeyTypefullyGrowTab] === "on") addAnalyticsButton();
    if (data[KeyZenWriterModeButton] === "on") addZenWriterModeButton(writerMode);
  },
  writerMode: async (data) => {
    changeWriterMode(data[KeyWriterMode]);
    if (data[KeyWriterMode] !== "on") {
      changeTimelineTabs(data[KeyRemoveTimelineTabs], data[KeyWriterMode]);
      changeTopicsToFollow(data[KeyRemoveTopicsToFollow]);
      changeTrendsHomeTimeline(data[KeyTrendsHomeTimeline], data[KeyWriterMode]);
      changeFollowingTimeline(data[KeyFollowingTimeline]);
    }
  },
};

const applyDynamicFeatures = async () => {
  await dynamicFeatures.general();
  const data = await getStorage([
    KeyWriterMode,
    KeyFollowingTimeline,
    KeyTrendsHomeTimeline,
    KeyRemoveTimelineTabs,
    KeyRemoveTopicsToFollow,
    KeyHideGrokDrawer,
    KeyNavigationButtonsLabels,
  ]);

  if (data) {
    dynamicFeatures.typefullyPlugs();
    await dynamicFeatures.sidebarButtons(data[KeyWriterMode]);
    await dynamicFeatures.writerMode(data);
    dynamicFeatures.navigation(data);

    // The Grok drawer appears dynamically, so we need to handle it here as well
    // as in the static features module
    hideGrokDrawer(data?.[KeyHideGrokDrawer]);
  }
};

let applying = false;
let requested = false;
export const runDynamicFeatures = throttle(async () => {
  requested = true;
  if (applying) return;
  applying = true;
  try {
    while (requested) {
      requested = false;
      await applyDynamicFeatures();
    }
  } catch (error) {
    console.error("Zen for X dynamic update failed", error);
  } finally {
    applying = false;
  }
}, 50);
