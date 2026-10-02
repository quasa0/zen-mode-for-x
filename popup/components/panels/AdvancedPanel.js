import { useEffect, useState } from "react";
import Backup from "../controls/Backup";
import CssEditor from "../controls/CssEditor";
import Group from "../ui/Group";

const SOURCE_URL = "https://github.com/quasa0/zen-mode-for-x";

// The editor is the heaviest part of the popup. It mounts the first time this tab opens.
const AdvancedPanel = ({ active }) => {
  const [opened, setOpened] = useState(active);
  const [version, setVersion] = useState("");

  useEffect(() => {
    if (active) setOpened(true);
  }, [active]);
  useEffect(() => {
    setVersion(globalThis.chrome?.runtime?.getManifest?.().version || "");
  }, []);

  return (
    <>
      <Group title="Custom CSS">
        <p className="zm-description">Your own rules for X. They load after every other change and save as you type.</p>
        {opened && <CssEditor active={active} />}
      </Group>
      <Group title="Backup">
        <p className="zm-description">Settings save to a JSON file. The Jev API key is never included.</p>
        <Backup />
      </Group>
      <Group title="About">
        <p className="zm-about">
          <span>Zen mode for X{version && ` ${version}`}</span>
          <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="zm-link">
            Source code
          </a>
        </p>
      </Group>
    </>
  );
};

export default AdvancedPanel;
