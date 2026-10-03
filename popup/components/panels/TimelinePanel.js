import {
  KeyAiSlopButton,
  KeyAiSlopReply,
  KeyFollowingTimeline,
  KeyHideViewCount,
  KeyRecentMedia,
  KeyRemoveAiPosts,
  KeyRemovePaidPartnershipPosts,
  KeyRemovePromotedPosts,
  KeyRemoveTimelineBorders,
  KeyRemoveTimelineTabs,
  KeyRemoveTopicsToFollow,
  KeyRemoveTweetBorders,
  KeyStickyHeader,
  KeyTrendsHomeTimeline,
  KeyVideoResolutionOverlay,
} from "../../../storage-keys";
import HiddenCounts from "../controls/HiddenCounts";
import TimelineWidthSlider from "../controls/TimelineWidthSlider";
import Group from "../ui/Group";
import StorageSwitch from "../ui/Switch";

const TimelinePanel = () => (
  <>
    <Group>
      <TimelineWidthSlider />
    </Group>
    <Group title="Hide from the feed">
      <StorageSwitch storageKey={KeyRemovePromotedPosts} label="Promoted posts" description="Ads and promoted placements. Organic posts are left alone." />
      <StorageSwitch storageKey={KeyRemovePaidPartnershipPosts} label="Paid partnerships" description="Posts that carry X's Paid partnership disclosure." />
      <StorageSwitch storageKey={KeyRemoveAiPosts} label="Made with AI" description="Posts that carry X's Made with AI label. The post text is not judged." />
      <StorageSwitch storageKey={KeyRemoveTopicsToFollow} label="Follow suggestions" description="Modules that suggest topics or accounts to follow." />
    </Group>
    <Group title="Hide counts">
      <HiddenCounts />
      <StorageSwitch storageKey={KeyHideViewCount} label="View counts" description="Hides public view totals on posts." />
    </Group>
    <Group title="Layout">
      <StorageSwitch storageKey={KeyStickyHeader} label="Sticky header" description="Keeps the timeline header in view while you scroll." />
      <StorageSwitch storageKey={KeyFollowingTimeline} label="Always open Following" description="Switches Home from For you to Following when that tab exists." />
      <StorageSwitch storageKey={KeyRemoveTimelineTabs} label="Hide timeline tabs" description="Removes the For you, Following and list tabs above the feed." />
      <StorageSwitch storageKey={KeyRemoveTimelineBorders} label="Hide timeline borders" description="Removes the frame around the center column." />
      <StorageSwitch storageKey={KeyRemoveTweetBorders} label="Hide post dividers" description="Removes the lines between posts." />
    </Group>
    <Group title="Additions">
      <StorageSwitch storageKey={KeyTrendsHomeTimeline} label="Trends on Home" description="Shows the trends panel beside the feed on wide screens." />
      <StorageSwitch storageKey={KeyRecentMedia} label="Recent media on profiles" description="Shows photos from loaded profile posts in a side panel on wide screens." />
      <StorageSwitch storageKey={KeyVideoResolutionOverlay} label="Video resolution overlay" description="Labels each video with its resolution and aspect ratio." />
      <StorageSwitch storageKey={KeyAiSlopButton} label="AI slop button" description="Adds an “ai slop” action to replies. It reports the reply as spam, then blocks the author." />
      <StorageSwitch storageKey={KeyAiSlopReply} label="Reply with a screenshot" description="Before the report, the AI slop action posts a framed image of the reply from your account." />
    </Group>
  </>
);

export default TimelinePanel;
