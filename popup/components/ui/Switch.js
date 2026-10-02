import useStorageKeyState from "../../utilities/useStorageKeyState";

// A tri-state control is a checkbox in ARIA terms; a two-state one is a switch.
export const Switch = ({ id, checked, onCheckedChange, ready = true, label }) => {
  const mixed = checked === "indeterminate";

  return (
    <button
      type="button"
      id={id}
      role={mixed ? "checkbox" : "switch"}
      aria-checked={mixed ? "mixed" : checked === true}
      aria-label={label}
      data-ready={ready ? "" : undefined}
      className="zm-switch"
      onClick={() => onCheckedChange(checked !== true)}
    >
      <span className="zm-switch-thumb" />
    </button>
  );
};

export const SwitchRow = ({ id, label, description, checked, onCheckedChange, ready }) => (
  <div className="zm-row">
    <div className="zm-row-text">
      <label htmlFor={id} className="zm-label">
        {label}
      </label>
      {description && <p className="zm-description">{description}</p>}
    </div>
    <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} ready={ready} />
  </div>
);

const StorageSwitch = ({ storageKey, label, description }) => {
  const [checked, setChecked, loaded] = useStorageKeyState(storageKey);

  return <SwitchRow id={storageKey} label={label} description={description} checked={checked} onCheckedChange={setChecked} ready={loaded} />;
};

export default StorageSwitch;
