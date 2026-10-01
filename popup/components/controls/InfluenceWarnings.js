import { useCallback, useEffect, useRef, useState } from "react";
import { KeyInfluenceWarnings, KeyInfluenceSensitivity, KeyInfluenceDailyLimit } from "../../../storage-keys";
import { InfluenceMessages } from "../../../influence-shared";
import { useStorageValueState } from "../../utilities/useStorageKeyState";
import SwitchControl from "../ui/SwitchControl";

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
  const commitLimit = () => {
    const number = Number(limitInput);
    const value = limitInput !== "" && Number.isFinite(number) ? Math.min(2000, Math.max(1, Math.round(number))) : 200;
    setLimitInput(String(value));
    saveLimit(value);
  };
  return (
    <div className="flex flex-col gap-y-3" id="influence-controls">
      <SwitchControl
        label="Influence Warnings"
        description="Adds a small warning to posts with likely sales intent, FOMO pressure, or vague bait. Posts stay visible. Jev judges the text, not the author's motives."
        storageKey={KeyInfluenceWarnings}
      />
      <p className="text-xs leading-4 text-gray-500 dark:text-gray-400">
        Visible public post text, quoted text, and links go directly to TypeSafe. No backend. Results stay on this device for 30 days. Images and videos are not analyzed.
      </p>
      <form onSubmit={(event) => { event.preventDefault(); if (apiKey.trim() && !busy) configure(); }} className="flex flex-col gap-y-2">
        <label htmlFor="jev-api-key" className="text-sm">Jev API key {status?.configured ? "· saved" : ""}</label>
        <div className="flex gap-x-2">
          <input
            id="jev-api-key" type="password" autoComplete="off" spellCheck={false}
            value={apiKey} onChange={(event) => setApiKey(event.target.value)}
            placeholder={status?.configured ? "Replace saved key" : "Your TypeSafe API key"}
            className="min-w-0 flex-1 rounded-md border border-gray-300 bg-transparent px-2 py-2 text-sm dark:border-gray-600"
          />
          <button type="submit" disabled={busy || !apiKey.trim()} className="rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-40 dark:border-gray-600">Save</button>
        </div>
        {status?.configured && <button type="button" onClick={() => configure(true)} disabled={busy} className="self-start text-xs text-gray-500 underline dark:text-gray-400">Remove saved key</button>}
        <p className="text-xs leading-4 text-gray-500 dark:text-gray-400">The key is private to this extension. Settings exports do not include it.</p>
      </form>
      <fieldset disabled={!thresholdLoaded || !limitLoaded} className="flex flex-col gap-y-2 disabled:opacity-40">
        <div className="flex items-center justify-between gap-x-3">
          <label htmlFor={KeyInfluenceSensitivity} className="text-sm">Warning threshold</label>
          <select id={KeyInfluenceSensitivity} value={threshold} onChange={(event) => saveThreshold(Number(event.target.value))} className="rounded-md border border-gray-300 bg-transparent px-2 py-1 text-sm dark:border-gray-600">
            <option value={0.9}>Strict · 90%</option><option value={0.8}>Balanced · 80%</option><option value={0.65}>Sensitive · 65%</option>
          </select>
        </div>
        <div className="flex items-center justify-between gap-x-3">
          <label htmlFor={KeyInfluenceDailyLimit} className="text-sm">New scans per day</label>
          <input id={KeyInfluenceDailyLimit} type="number" min="1" max="2000" step="1" value={limitInput} onChange={(event) => setLimitInput(event.target.value)} onBlur={commitLimit} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitLimit(); } }} className="w-20 rounded-md border border-gray-300 bg-transparent px-2 py-1 text-sm dark:border-gray-600" />
        </div>
      </fieldset>
      <div className="flex items-center justify-between gap-x-3 text-xs text-gray-500 dark:text-gray-400">
        <span>{status ? `${status.dailyUsed || 0}/${status.dailyLimit || limit} scans today · ${status.cacheCount || 0} cached` : "Checking Jev status…"}</span>
        <button type="button" onClick={async () => { const result = await send(InfluenceMessages.clearCache); if (active.current) { setMessage(result.ok ? "Cached judgments cleared." : "Could not clear the cache."); refresh(); } }} className="underline">Clear cache</button>
      </div>
      <p role="status" className="text-xs leading-4 text-gray-500 dark:text-gray-400">
        {message || (enabled === "on" && status && !status.configured ? errorLabels["not-configured"] : errorLabels[status?.error]) || (enabled === "on" && status?.dailyUsed >= status?.dailyLimit ? errorLabels["daily-limit"] : "Higher thresholds show fewer warnings. Cached results do not use your daily limit. The day resets at 00:00 UTC.")}
      </p>
    </div>
  );
}
