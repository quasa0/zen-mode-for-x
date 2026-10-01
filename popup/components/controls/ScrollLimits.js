import { useEffect, useState } from "react";
import { defaultPreferences, KeyMindfulScrolling, KeyScrollLimitMinutes, KeyScrollReminderIntensity } from "../../../storage-keys";
import { useStorageValue, useStorageValueState } from "../../utilities/useStorageKeyState";
import SwitchControl from "../ui/SwitchControl";

export default function ScrollLimits() {
  const [minutes, setMinutes] = useState(String(defaultPreferences[KeyScrollLimitMinutes]));
  const [storedMinutes, saveMinutes, minutesLoaded] = useStorageValueState(KeyScrollLimitMinutes);
  const [storedIntensity, saveIntensity, intensityLoaded] = useStorageValueState(KeyScrollReminderIntensity);
  const enabled = useStorageValue(KeyMindfulScrolling) === "on";
  const intensity = storedIntensity === "clear" ? "clear" : "gentle";

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
    <div className="flex flex-col gap-y-2">
      <SwitchControl
        label="Mindful Scrolling"
        description="Shows amber edges near your scrolling limit and red edges at the limit. The clock runs only after feed scrolling, pauses while writing or idle, and resets after a two-minute break."
        storageKey={KeyMindfulScrolling}
      />
      <fieldset disabled={!minutesLoaded || !intensityLoaded || !enabled} className="flex flex-col gap-y-2 disabled:opacity-40">
        <div className="flex items-center justify-between gap-x-3">
          <label htmlFor={KeyScrollLimitMinutes} className="text-sm">Scrolling limit</label>
          <div className="flex items-center gap-x-2">
            <input
              id={KeyScrollLimitMinutes}
              type="number"
              min="1"
              max="120"
              step="1"
              value={minutes}
              aria-label="Scrolling limit in minutes"
              className="w-16 rounded-md border border-gray-300 bg-transparent px-2 py-1 text-sm dark:border-gray-600"
              onChange={(event) => {
                const value = event.target.value;
                setMinutes(value);
                const number = Number(value);
                if (value !== "" && Number.isInteger(number) && number >= 1 && number <= 120) saveMinutes(number);
              }}
              onBlur={(event) => commitMinutes(event.currentTarget.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitMinutes(event.currentTarget.value); } }}
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">min</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-x-3">
          <label htmlFor={KeyScrollReminderIntensity} className="text-sm">Reminder intensity</label>
          <select
            id={KeyScrollReminderIntensity}
            value={intensity}
            className="rounded-md border border-gray-300 bg-transparent px-2 py-1 text-sm dark:border-gray-600"
            onChange={(event) => saveIntensity(event.target.value)}
          >
            <option value="gentle">Gentle</option><option value="clear">Clear</option>
          </select>
        </div>
      </fieldset>
    </div>
  );
}
