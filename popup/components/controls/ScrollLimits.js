import { useEffect, useState } from "react";
import { defaultPreferences, KeyMindfulScrolling, KeyScrollLimitMinutes, KeyScrollReminderIntensity } from "../../../storage-keys";
import { useStorageValue, useStorageValueState } from "../../utilities/useStorageKeyState";
import StorageSegmented from "../ui/Segmented";
import StorageSwitch from "../ui/Switch";

export default function ScrollLimits() {
  const [minutes, setMinutes] = useState(String(defaultPreferences[KeyScrollLimitMinutes]));
  const [storedMinutes, saveMinutes, minutesLoaded] = useStorageValueState(KeyScrollLimitMinutes);
  const enabled = useStorageValue(KeyMindfulScrolling) === "on";

  useEffect(() => {
    setMinutes(String(storedMinutes));
  }, [storedMinutes]);
  const commitMinutes = (raw) => {
    const value = Number(raw);
    const normalized = Number.isFinite(value) && raw !== "" ? Math.min(120, Math.max(1, Math.round(value))) : 10;
    setMinutes(String(normalized));
    saveMinutes(normalized);
  };

  return (
    <>
      <StorageSwitch
        storageKey={KeyMindfulScrolling}
        label="Mindful scrolling"
        description="Tints the window edges amber near your limit and red at it. The clock counts feed scrolling only, pauses while you write or sit idle, and resets after a two-minute break."
      />
      <fieldset disabled={!minutesLoaded || !enabled} className="zm-sub">
        <div className="zm-field">
          <label htmlFor={KeyScrollLimitMinutes} className="zm-field-label">
            Scrolling limit
          </label>
          <div className="zm-unit">
            <input
              id={KeyScrollLimitMinutes}
              type="number"
              min="1"
              max="120"
              step="1"
              value={minutes}
              aria-label="Scrolling limit in minutes"
              className="zm-input"
              onChange={(event) => {
                const value = event.target.value;
                setMinutes(value);
                const number = Number(value);
                if (value !== "" && Number.isInteger(number) && number >= 1 && number <= 120) saveMinutes(number);
              }}
              onBlur={(event) => commitMinutes(event.currentTarget.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitMinutes(event.currentTarget.value); } }}
            />
            <span>min</span>
          </div>
        </div>
        <div className="zm-field">
          <span className="zm-field-label">Reminder</span>
          <StorageSegmented
            storageKey={KeyScrollReminderIntensity}
            label="Reminder intensity"
            segments={[
              { value: "gentle", label: "Gentle" },
              { value: "clear", label: "Clear" },
            ]}
          />
        </div>
      </fieldset>
    </>
  );
}
