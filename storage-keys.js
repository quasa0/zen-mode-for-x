import { KeyInfluenceWarnings, KeyInfluenceSensitivity, KeyInfluenceDailyLimit } from "./influence-shared.js";
export { KeyInfluenceWarnings, KeyInfluenceSensitivity, KeyInfluenceDailyLimit };

export const KeyExtensionStatus = "extensionStatus";
export const KeyListsButton = "listsButton";
export const KeyCommunitiesButton = "communitiesButton";
export const KeyTopicsButton = "topicsButton";
export const KeyXPremiumButton = "xPremiumButton";
export const KeyVerifiedOrgsButton = "verifiedOrgsButton";
export const KeyZenWriterModeButton = "zenWriterModeButton";
export const KeyGrokButton = "grokButton";
export const KeyFollowingTimeline = "followingTimeline";
export const KeyTrendsHomeTimeline = "trendsHomeTimeline";
export const KeyRemoveTimelineTabs = "removeTimelineTabs";
export const KeyWriterMode = "writerMode";
export const KeyTimelineWidth = "timelineWidth";
export const KeyRemoveTimelineBorders = "timelineBorders";
export const KeyRemoveTweetBorders = "tweetBorders";
export const KeyStickyHeader = "stickyHeader";
export const KeySidebarLogo = "sidebarLogo";
export const KeyHomeButton = "homeButton";
export const KeyExploreButton = "exploreButton";
export const KeyNotificationsButton = "notificationsButton";
export const KeyMessagesButton = "messagesButton";
export const KeyBookmarksButton = "bookmarksButton";
export const KeyJobsButton = "jobsButton";
export const KeyArticlesButton = "articles";
export const KeyProfileButton = "profileButton";
export const KeyNavigationButtonsLabels = "navigationButtonsLabels";
export const KeyNavigationCenter = "navigationCenter";
export const KeyUnreadCountBadge = "unreadCountBadge";
export const KeyReplyCount = "replyCount";
export const KeyRetweetCount = "retweetCount";
export const KeyLikeCount = "likeCount";
export const KeyFollowCount = "followCount";
export const KeyTweetButton = "tweetButton";
export const KeySearchBar = "searchBar";
export const KeyTransparentSearch = "transparentSearch";
export const KeyRemovePromotedPosts = "removePromotedPosts";
export const KeyRemovePaidPartnershipPosts = "removePaidPartnershipPosts";
export const KeyRemoveAiPosts = "removeAiPosts";
export const KeyMindfulScrolling = "mindfulScrolling";
export const KeyScrollLimitMinutes = "scrollLimitMinutes";
export const KeyScrollReminderIntensity = "scrollReminderIntensity";
export const KeyRemoveTopicsToFollow = "removeTopicsToFollow";
export const KeyRecentMedia = "recentMedia";
export const KeyInterFont = "interFont";
export const KeyTitleNotifications = "titleNotifications";
export const KeyCustomCss = "customCss";
export const KeyHideViewCount = "hideViewCount";
export const KeyHideGrokDrawer = "hideGrokDrawer";
export const KeyAiSlopButton = "aiSlopButton";
export const KeyAiSlopReply = "aiSlopReply";
export const KeyVideoResolutionOverlay = "videoResolutionOverlay";

export const allSettingsKeys = [
  // Extension Status
  KeyExtensionStatus,

  // Timeline Features
  KeyTimelineWidth,
  KeyRemoveTimelineBorders,
  KeyRemoveTweetBorders,
  KeyStickyHeader,
  KeyWriterMode,
  KeyVideoResolutionOverlay,
  KeyFollowingTimeline,
  KeyHideViewCount,
  KeyRecentMedia,
  KeyTrendsHomeTimeline,
  KeyRemovePromotedPosts,
  KeyRemovePaidPartnershipPosts,
  KeyRemoveAiPosts,
  KeyMindfulScrolling,
  KeyInfluenceWarnings,
  KeyInfluenceSensitivity,
  KeyInfluenceDailyLimit,
  KeyScrollLimitMinutes,
  KeyScrollReminderIntensity,
  KeyRemoveTopicsToFollow,
  KeyRemoveTimelineTabs,
  KeyAiSlopButton,
  KeyAiSlopReply,
  KeyFollowCount,
  KeyReplyCount,
  KeyRetweetCount,
  KeyLikeCount,

  // Navigation Features
  KeySidebarLogo,
  KeyNavigationButtonsLabels,
  KeyNavigationCenter,
  KeyUnreadCountBadge,
  KeyHideGrokDrawer,

  // Interface Features
  KeyInterFont,
  KeySearchBar,
  KeyTransparentSearch,
  KeyTitleNotifications,
  KeyTweetButton,

  // Sidebar Features
  KeyHomeButton,
  KeyExploreButton,
  KeyNotificationsButton,
  KeyMessagesButton,
  KeyGrokButton,
  KeyXPremiumButton,
  KeyListsButton,
  KeyBookmarksButton,
  KeyJobsButton,
  KeyCommunitiesButton,
  KeyArticlesButton,
  KeyTopicsButton,
  KeyVerifiedOrgsButton,
  KeyZenWriterModeButton,
  KeyProfileButton,

  // Advanced Features
  KeyCustomCss,

];

export const defaultPreferences = {
  // Extension Status
  [KeyExtensionStatus]: "on",

  // Timeline Features
  [KeyTimelineWidth]: 700,
  [KeyRemoveTimelineBorders]: "off",
  [KeyRemoveTweetBorders]: "off",
  [KeyStickyHeader]: "on",
  [KeyWriterMode]: "off",
  [KeyVideoResolutionOverlay]: "off",
  [KeyFollowingTimeline]: "off",
  [KeyHideViewCount]: "off",
  [KeyRecentMedia]: "off",
  [KeyTrendsHomeTimeline]: "off",
  [KeyRemovePromotedPosts]: "on",
  [KeyRemovePaidPartnershipPosts]: "off",
  [KeyRemoveAiPosts]: "off",
  [KeyMindfulScrolling]: "off",
  [KeyInfluenceWarnings]: "off",
  [KeyInfluenceSensitivity]: 0.9,
  [KeyInfluenceDailyLimit]: 200,
  [KeyScrollLimitMinutes]: 10,
  [KeyScrollReminderIntensity]: "gentle",
  [KeyRemoveTopicsToFollow]: "on",
  [KeyRemoveTimelineTabs]: "off",
  [KeyAiSlopButton]: "on",
  [KeyAiSlopReply]: "on",
  [KeyFollowCount]: "on",
  [KeyReplyCount]: "on",
  [KeyRetweetCount]: "on",
  [KeyLikeCount]: "on",

  // Navigation Features
  [KeySidebarLogo]: "off",
  [KeyNavigationButtonsLabels]: "never",
  [KeyNavigationCenter]: "off",
  [KeyUnreadCountBadge]: "off",
  [KeyHideGrokDrawer]: "on",

  // Interface Features
  [KeyInterFont]: "off",
  [KeySearchBar]: "on",
  [KeyTransparentSearch]: "off",
  [KeyTitleNotifications]: "on",
  [KeyTweetButton]: "on",

  // Sidebar Features
  [KeyHomeButton]: "on",
  [KeyExploreButton]: "on",
  [KeyNotificationsButton]: "on",
  [KeyMessagesButton]: "on",
  [KeyGrokButton]: "on",
  [KeyXPremiumButton]: "off",
  [KeyListsButton]: "on",
  [KeyBookmarksButton]: "on",
  [KeyJobsButton]: "off",
  [KeyCommunitiesButton]: "on",
  [KeyArticlesButton]: "off",
  [KeyTopicsButton]: "off",
  [KeyVerifiedOrgsButton]: "off",
  [KeyZenWriterModeButton]: "on",
  [KeyProfileButton]: "on",

  // Advanced Features
  [KeyCustomCss]: "",
};
