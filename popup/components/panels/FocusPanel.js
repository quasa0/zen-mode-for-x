import { KeyWriterMode } from "../../../storage-keys";
import InfluenceWarnings from "../controls/InfluenceWarnings";
import ScrollLimits from "../controls/ScrollLimits";
import Group from "../ui/Group";
import StorageSwitch from "../ui/Switch";

const FocusPanel = () => (
  <>
    <Group title="Writing">
      <StorageSwitch storageKey={KeyWriterMode} label="Zen writer mode" description="Clears the timeline around the composer while you write." />
    </Group>
    <Group title="Scrolling">
      <ScrollLimits />
    </Group>
    <Group title="Reading">
      <InfluenceWarnings />
    </Group>
  </>
);

export default FocusPanel;
