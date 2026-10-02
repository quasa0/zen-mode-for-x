import { useRef, useState } from "react";
import { KeyExtensionStatus } from "../../storage-keys";
import useStorageKeyState from "../utilities/useStorageKeyState";
import Mark from "./Mark";
import AdvancedPanel from "./panels/AdvancedPanel";
import FocusPanel from "./panels/FocusPanel";
import InterfacePanel from "./panels/InterfacePanel";
import NavigationPanel from "./panels/NavigationPanel";
import TimelinePanel from "./panels/TimelinePanel";
import { Switch } from "./ui/Switch";

const tabs = [
  { id: "timeline", label: "Timeline", Panel: TimelinePanel },
  { id: "focus", label: "Focus", Panel: FocusPanel },
  { id: "navigation", label: "Navigation", Panel: NavigationPanel },
  { id: "interface", label: "Interface", Panel: InterfacePanel },
  { id: "advanced", label: "Advanced", Panel: AdvancedPanel },
];

const Popup = () => {
  const [current, setCurrent] = useState(tabs[0].id);
  const [enabled, setEnabled, loaded] = useStorageKeyState(KeyExtensionStatus);
  const tabList = useRef(null);
  const panels = useRef(null);

  const select = (id) => {
    setCurrent(id);
    if (panels.current) panels.current.scrollTop = 0;
  };
  const onKeyDown = (event) => {
    const index = tabs.findIndex((tab) => tab.id === current);
    const target = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const next = tabs[(target + tabs.length) % tabs.length];
    select(next.id);
    tabList.current?.querySelector(`#tab-${next.id}`)?.focus();
  };

  return (
    <div className="zm-shell">
      <header className="zm-header">
        <div className="zm-identity">
          <Mark className="zm-mark" />
          <h1 className="zm-title">Zen mode for X</h1>
        </div>
        <label className="zm-master">
          <span>{enabled ? "On" : "Paused"}</span>
          <Switch id={KeyExtensionStatus} checked={enabled} onCheckedChange={setEnabled} ready={loaded} label="Extension enabled" />
        </label>
      </header>
      <div ref={tabList} role="tablist" aria-label="Settings" className="zm-tabs" onKeyDown={onKeyDown}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={tab.id === current}
            aria-controls={`panel-${tab.id}`}
            tabIndex={tab.id === current ? 0 : -1}
            className="zm-tab"
            onClick={() => select(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {!enabled && <p className="zm-notice">Paused. X shows its own interface until you turn this back on.</p>}
      <main ref={panels} className="zm-panels">
        {/* Every panel stays mounted so its settings keep listening for storage changes. */}
        {tabs.map(({ id, Panel }) => (
          <div key={id} role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={id !== current} data-paused={!enabled} className="zm-panel">
            <Panel active={id === current} />
          </div>
        ))}
      </main>
    </div>
  );
};

export default Popup;
