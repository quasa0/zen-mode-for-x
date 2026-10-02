import { useCallback, useEffect, useRef, useState } from "react";
import { KeyInfluenceWarnings, KeyInfluenceSensitivity, KeyInfluenceDailyLimit } from "../../../storage-keys";
import { InfluenceMessages } from "../../../influence-shared";
import { useStorageValueState } from "../../utilities/useStorageKeyState";
import { Segmented } from "../ui/Segmented";
import StorageSwitch from "../ui/Switch";

const errorLabels = {
  "not-configured": "Save a Jev API key to start scanning.",
  unauthorized: "Jev rejected this key. Save a valid key.",
  "rate-limited": "Jev is busy. Scanning will resume after a pause.",
  "daily-limit": "Today's scan limit is reached. Cached results still work.",
  timeout: "Jev did not respond in time. Posts stay visible.",
  unavailable: "Jev could not be reached. Posts stay visible.",
  "invalid-response": "Jev returned an unexpected result. Posts stay visible.",
  "storage-unavailable": "Private extension storage is unavailable. Scanning is paused.",
};

function send(type, extra = {}) {
  return new Promise((resolve) => {
    if (!globalThis.chrome?.runtime?.sendMessage) { resolve({ ok: false }); return; }
    chrome.runtime.sendMessage({ type, ...extra }, (response) => {
      resolve(chrome.runtime.lastError ? { ok: false } : response || { ok: false });
    });
  });
}

export default function InfluenceWarnings() {
  const [enabled] = useStorageValueState(KeyInfluenceWarnings);
  const [threshold, saveThreshold, thresholdLoaded] = useStorageValueState(KeyInfluenceSensitivity);
  const [limit, saveLimit, limitLoaded] = useStorageValueState(KeyInfluenceDailyLimit);
  const [status, setStatus] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [limitInput, setLimitInput] = useState("200");
  const active = useRef(false);
  const refresh = useCallback(async () => {
    const next = await send(InfluenceMessages.status);
    if (active.current && next.ok) setStatus(next);
  }, []);
  useEffect(() => {
    active.current = true;
    refresh();
    const timer = setInterval(refresh, 10000);
    const onChange = () => refresh();
    globalThis.chrome?.storage?.onChanged?.addListener(onChange);
    return () => {
      active.current = false;
      clearInterval(timer);
      globalThis.chrome?.storage?.onChanged?.removeListener(onChange);
    };
  }, [refresh]);
  useEffect(() => setLimitInput(String(limit)), [limit]);

  const configure = async (clearKey = false) => {
    setBusy(true);
    const response = await send(InfluenceMessages.configure, clearKey ? { clearKey: true } : { apiKey: apiKey.trim() });
    if (!active.current) return;
    setBusy(false);
    if (response.ok) {
      setApiKey("");
      setMessage(clearKey ? "Key removed." : "Key saved on this device.");
      refresh();
    } else setMessage("The key could not be saved. Check the key and try again.");
  };
  const clearCache = async () => {
    const result = await send(InfluenceMessages.clearCache);
    if (!active.current) return;
    setMessage(result.ok ? "Cached judgments cleared." : "Could not clear the cache.");
    refresh();
  };
  const notice =
    message ||
    (enabled === "on" && status && !status.configured ? errorLabels["not-configured"] : errorLabels[status?.error]) ||
    (enabled === "on" && status?.dailyUsed >= status?.dailyLimit ? errorLabels["daily-limit"] : "");
  const commitLimit = () => {
    const number = Number(limitInput);
    const value = limitInput !== "" && Number.isFinite(number) ? Math.min(2000, Math.max(1, Math.round(number))) : 200;
    setLimitInput(String(value));
    saveLimit(value);
  };
  return (
    <>
      <StorageSwitch
        storageKey={KeyInfluenceWarnings}
        label="Influence warnings"
        description="Marks posts that read as a sales pitch, FOMO pressure or vague bait. Posts stay visible. Jev judges the text, not the author's motives."
      />
      <div className="zm-sub" id="influence-controls">
        <form onSubmit={(event) => { event.preventDefault(); if (apiKey.trim() && !busy) configure(); }} className="zm-group" style={{ gap: 8 }}>
          <label htmlFor="jev-api-key" className="zm-field-label">
            Jev API key{status?.configured ? " (saved)" : ""}
          </label>
          <div className="zm-inline">
            <input
              id="jev-api-key" type="password" autoComplete="off" spellCheck={false}
              value={apiKey} onChange={(event) => setApiKey(event.target.value)}
              placeholder={status?.configured ? "Replace saved key" : "Your TypeSafe API key"}
              className="zm-input"
            />
            <button type="submit" disabled={busy || !apiKey.trim()} className="zm-button" data-variant="primary">Save</button>
          </div>
          <p className="zm-description">
            The key stays private to this extension and is left out of settings exports.{" "}
            {status?.configured && <button type="button" onClick={() => configure(true)} disabled={busy} className="zm-link">Remove saved key</button>}
          </p>
        </form>
        <fieldset disabled={!thresholdLoaded || !limitLoaded} className="zm-group" style={{ gap: 12 }}>
          <div className="zm-field">
            <span className="zm-field-label">Threshold</span>
            <Segmented
              id={KeyInfluenceSensitivity}
              label="Warning threshold"
              value={[0.9, 0.8, 0.65].includes(threshold) ? threshold : 0.9}
              onValueChange={saveThreshold}
              segments={[
                { value: 0.9, label: "Strict" },
                { value: 0.8, label: "Balanced" },
                { value: 0.65, label: "Sensitive" },
              ]}
            />
          </div>
          <div className="zm-field">
            <label htmlFor={KeyInfluenceDailyLimit} className="zm-field-label">New scans per day</label>
            <input id={KeyInfluenceDailyLimit} type="number" min="1" max="2000" step="1" value={limitInput} onChange={(event) => setLimitInput(event.target.value)} onBlur={commitLimit} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitLimit(); } }} className="zm-input" />
          </div>
        </fieldset>
        <div className="zm-status">
          <span>{status ? `${status.dailyUsed || 0} of ${status.dailyLimit || limit} scans today, ${status.cacheCount || 0} cached` : "Checking Jev status…"}</span>
          <button type="button" onClick={clearCache} className="zm-link">Clear cache</button>
        </div>
        <div>
          <p role="status" className="zm-description" style={{ color: "var(--text)" }}>{notice}</p>
          <p className="zm-description">
          Strict warns at 90%, Balanced at 80%, Sensitive at 65%. Visible post text, quoted text and links go directly to TypeSafe, with no server in between. Results stay on this device for 30 days and cached results do not use your daily limit, which resets at 00:00 UTC. Images and videos are not analyzed.
          </p>
        </div>
      </div>
    </>
  );
}
