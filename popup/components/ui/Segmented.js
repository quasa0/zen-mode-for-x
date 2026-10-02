import { useRef } from "react";
import { defaultPreferences } from "../../../storage-keys";
import { useStorageValueState } from "../../utilities/useStorageKeyState";

export const Segmented = ({ id, label, segments, value, onValueChange, disabled = false }) => {
  const group = useRef(null);
  const move = (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const index = segments.findIndex((segment) => segment.value === value);
    const next = segments[(index + step + segments.length) % segments.length];
    onValueChange(next.value);
    group.current?.querySelector(`[data-value="${next.value}"]`)?.focus();
  };

  return (
    <div ref={group} id={id} role="radiogroup" aria-label={label} className="zm-segments" onKeyDown={move}>
      {segments.map((segment) => (
        <button
          key={segment.value}
          type="button"
          role="radio"
          aria-checked={segment.value === value}
          tabIndex={segment.value === value ? 0 : -1}
          data-value={segment.value}
          disabled={disabled}
          className="zm-segment"
          onClick={() => onValueChange(segment.value)}
        >
          {segment.label}
        </button>
      ))}
    </div>
  );
};

const StorageSegmented = ({ storageKey, label, segments }) => {
  const [stored, setValue, loaded] = useStorageValueState(storageKey);
  const fallback = defaultPreferences[storageKey];
  const known = (candidate) => segments.some((segment) => segment.value === candidate);
  const value = known(stored) ? stored : known(fallback) ? fallback : segments[0].value;

  return <Segmented id={storageKey} label={label} segments={segments} value={value} onValueChange={setValue} disabled={!loaded} />;
};

export default StorageSegmented;
