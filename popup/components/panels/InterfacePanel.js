import { KeyInterFont, KeySearchBar, KeyTitleNotifications, KeyTransparentSearch, KeyTweetButton } from "../../../storage-keys";
import Group from "../ui/Group";
import StorageSwitch from "../ui/Switch";

const InterfacePanel = () => (
  <>
    <Group title="Show">
      <StorageSwitch storageKey={KeySearchBar} label="Search bar" description="The search field at the top right. The sidebar Search shortcut is separate." />
      <StorageSwitch storageKey={KeyTweetButton} label="Post button" description="X's compose button in the sidebar." />
      <StorageSwitch storageKey={KeyTitleNotifications} label="Notification count in the tab" description="Counts such as “(1) Home / X” and the red dot on the favicon." />
    </Group>
    <Group title="Appearance">
      <StorageSwitch storageKey={KeyInterFont} label="Inter font" description="Replaces X's Chirp typeface with Inter." />
      <StorageSwitch storageKey={KeyTransparentSearch} label="Transparent search bar" description="Removes the filled background from the search field." />
    </Group>
    <Group title="On X">
      <p className="zm-description">
        <a href="https://x.com/i/display" target="_blank" rel="noreferrer" className="zm-link">
          Display settings
        </a>{" "}
        change X&apos;s own font size, color and background.{" "}
        <a href="https://x.com/settings/mute_and_block" target="_blank" rel="noreferrer" className="zm-link">
          Mute and block settings
        </a>{" "}
        hold your muted words and accounts.
      </p>
    </Group>
  </>
);

export default InterfacePanel;
