import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createInfluenceService } from "../../influence-background.js";
import {
  INFLUENCE_API_URL, INFLUENCE_MODEL, InfluenceMessages,
  canonicalPostUrl, influenceDefaults, influenceLabels, normalizeInfluencePost,
} from "../../influence-shared.js";

const apiKey = "apikey_synthetic_fixture_credential_only";
const extensionSender = { id: "fixture", url: "chrome-extension://fixture/index.html" };
const contentSender = { id: "fixture", frameId: 0, url: "https://x.com/home", tab: { id: 1, url: "https://x.com/home" } };
const post = (id = 1, text = "A concrete independent post.") => ({ url: `https://x.com/example/status/${id}`, text });
const response = (scores = { sales: 0.01, fomo: 0.02, bait: 0.03 }, options = {}) => new Response(JSON.stringify({
  model: INFLUENCE_MODEL, answers: Object.fromEntries(Object.entries(scores).map(([kind, noul]) => [kind, { type: "noul", noul }])),
}), { status: 200, ...options });

const fixture = ({ fetchImpl, limit = 200, requestTimeoutMs = 12000 } = {}) => {
  const saved = { extensionStatus: "on", influenceWarnings: "on", influenceDailyLimit: limit };
  const calls = [];
  let key = apiKey;
  let time = Date.UTC(2026, 9, 1, 12);
  let rejectWrites = false;
  const api = {
    runtime: { id: "fixture", getURL: (path) => `chrome-extension://fixture/${path}`, lastError: null },
    tabs: { query: (_filter, callback) => callback([]), sendMessage: (_tab, _message, callback) => callback() },
    storage: { local: {
      get: (keys, callback) => queueMicrotask(() => callback(structuredClone(Object.fromEntries(keys.filter((k) => k in saved).map((k) => [k, saved[k]]))))),
      set: (value, callback) => {
        if (rejectWrites) throw new Error("Synthetic quota failure");
        Object.assign(saved, structuredClone(value));
        queueMicrotask(callback);
      },
    } },
  };
  const keyStore = { get: async () => key, set: async (value) => { key = value; }, clear: async () => { key = undefined; } };
  const options = {
    api, keyStore, cryptoImpl: webcrypto, now: () => time, requestTimeoutMs,
    fetchImpl: async (url, request) => {
      calls.push({ url, request });
      return fetchImpl ? fetchImpl(url, request, calls.length) : response();
    },
  };
  let service = createInfluenceService(options);
  return {
    saved, calls,
    scan: (value = post(), sender = contentSender) => service.handle({ type: InfluenceMessages.scan, post: value }, sender),
    message: (value, sender = extensionSender) => service.handle(value, sender),
    restart: () => { service = createInfluenceService(options); },
    nextDay: () => { time += 24 * 60 * 60 * 1000; },
    expireCache: () => { time += 31 * 24 * 60 * 60 * 1000; },
    rejectWrites: () => { rejectWrites = true; },
  };
};

test("public status aliases share identity; credentials and query values do not enter inference state", async () => {
  assert.equal(canonicalPostUrl("https://twitter.com/old/status/123?ref=account"), "https://x.com/i/status/123");
  assert.equal(canonicalPostUrl("https://x.com/i/web/status/123/photo/1"), "https://x.com/i/status/123");
  assert.equal(canonicalPostUrl("https://x.com.attacker.example/user/status/123"), null);
  assert.equal(canonicalPostUrl("https://user:password@x.com/user/status/123"), null);
  assert.equal(canonicalPostUrl("https://x.com/messages"), null);
  assert.equal(normalizeInfluencePost({ ...post(), text: "x".repeat(6001) }), null);
  const f = fixture();
  const result = await f.scan({ ...post(), links: ["https://resource.example/guide?token=private-value#secret"] });
  assert.equal(result.ok, true);
  const { url, request } = f.calls[0];
  assert.equal(url, INFLUENCE_API_URL);
  assert.equal(request.redirect, "error");
  assert.equal(request.credentials, "omit");
  const body = JSON.parse(request.body);
  assert.deepEqual(body.state.post.links, ["https://resource.example/guide"]);
  assert.equal("url" in body.state.post, false);
  assert.equal(request.body.includes(apiKey), false);
  assert.equal(JSON.stringify(f.saved).includes(apiKey), false);
  assert.equal(JSON.stringify(result).includes(apiKey), false);
});

test("private routes, subframes and web callers cannot scan or configure credentials", async () => {
  const f = fixture();
  for (const url of ["https://x.com/messages/123", "https://x.com/i/chat/123", "https://x.com/settings/profile", "https://other.example/home"]) {
    assert.equal((await f.scan(post(), { ...contentSender, url, tab: { id: 1, url } })).error, "not-allowed");
  }
  assert.equal((await f.scan(post(), { ...contentSender, frameId: 1 })).error, "not-allowed");
  assert.equal((await f.scan(post(), { ...contentSender, id: "other-extension" })).error, "not-allowed");
  assert.equal((await f.message({ type: InfluenceMessages.configure, apiKey: "apikey_attacker_fixture_only" }, contentSender)).error, "not-allowed");
  assert.equal((await f.message({ type: InfluenceMessages.status }, contentSender)).error, "not-allowed");
  assert.equal(f.calls.length, 0);
});

test("URL cache persists negatives across restart and edits invalidate the evidence hash", async () => {
  const f = fixture();
  assert.equal((await f.scan()).cached, false);
  f.restart();
  assert.equal((await f.scan({ ...post(), url: "https://twitter.com/renamed/status/1?ref=changed" })).cached, true);
  assert.equal(f.calls.length, 1);
  assert.equal((await f.scan(post(1, "Changed commercial post."))).cached, false);
  assert.equal(f.calls.length, 2);
  f.expireCache();
  assert.equal((await f.scan(post(1, "Changed commercial post."))).cached, false);
  assert.equal(f.calls.length, 3);
  assert.equal((await f.message({ type: InfluenceMessages.status })).cacheCount, 1);
  assert.equal(JSON.stringify(f.saved).includes("Changed commercial post"), false);
});

test("deduplicated tabs share one inference and the global worker never exceeds two requests", async () => {
  let concurrent = 0;
  let peak = 0;
  const f = fixture({ fetchImpl: async () => {
    concurrent += 1;
    peak = Math.max(peak, concurrent);
    await new Promise((resolve) => setTimeout(resolve, 5));
    concurrent -= 1;
    return response();
  } });
  const results = await Promise.all([f.scan(post(1)), f.scan(post(1)), ...Array.from({ length: 7 }, (_, i) => f.scan(post(i + 2)))]);
  assert.equal(results.every((result) => result.ok), true);
  assert.equal(f.calls.length, 8);
  assert.equal(peak, 2);
  assert.equal((await f.message({ type: InfluenceMessages.status })).dailyUsed, 8);
});

test("a full queue returns a bounded busy result and trusted cancellation drains every pending caller", async () => {
  let busy;
  const busyPromise = new Promise((resolve) => { busy = resolve; });
  const f = fixture({ fetchImpl: (_url, request) => new Promise((_resolve, reject) => {
    request.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }) });
  const scans = Array.from({ length: 41 }, (_, i) => f.scan(post(i + 1)).then((result) => {
    if (result.error === "busy") busy(result);
    return result;
  }));
  let timer;
  const result = await Promise.race([busyPromise, new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("Queue did not reach its bound")), 1000);
  })]);
  clearTimeout(timer);
  assert.equal(result.retryAfterMs, 1000);
  await f.message({ type: InfluenceMessages.clearCache });
  const results = await Promise.all(scans);
  assert.equal(results.filter((item) => item.error === "busy").length, 1);
  assert.equal(results.filter((item) => item.error === "disabled").length, 40);
  assert.equal(f.calls.length, 2);
});

test("persistent cache loads retain at most 1000 entries and purge expired results", async () => {
  const f = fixture();
  f.saved.zenInfluenceCacheV1 = Object.fromEntries(Array.from({ length: 1002 }, (_, i) => [
    `https://x.com/i/status/${i + 1}`,
    { hash: "0".repeat(64), result: { model: INFLUENCE_MODEL, checkedAt: Date.UTC(2026, 9, 1, 12) - i, scores: { sales: 0, fomo: 0, bait: 0 } } },
  ]));
  assert.equal((await f.message({ type: InfluenceMessages.status })).cacheCount, 1000);
  assert.equal(Object.keys(f.saved.zenInfluenceCacheV1).length, 1000);
  f.expireCache();
  assert.equal((await f.message({ type: InfluenceMessages.status })).cacheCount, 0);
  assert.deepEqual(f.saved.zenInfluenceCacheV1, {});
  assert.equal(f.calls.length, 0);
});

test("durable UTC daily cap counts calls once, allows cache reads, and resets at the next day", async () => {
  const f = fixture({ limit: 1 });
  assert.equal((await f.scan()).ok, true);
  f.restart();
  assert.equal((await f.scan()).cached, true);
  assert.equal((await f.scan(post(2))).error, "daily-limit");
  assert.equal(f.calls.length, 1);
  f.nextDay();
  assert.equal((await f.scan(post(2))).ok, true);
  assert.equal(f.calls.length, 2);
  assert.equal((await f.message({ type: InfluenceMessages.status })).dailyUsed, 1);
});

test("bad credentials trip a durable circuit until trusted key configuration", async () => {
  const f = fixture({ fetchImpl: async (_url, _request, count) => count === 1 ? new Response("Do not expose provider detail", { status: 401 }) : response() });
  assert.equal((await f.scan()).error, "unauthorized");
  f.restart();
  assert.equal((await f.scan(post(2))).error, "unauthorized");
  assert.equal(f.calls.length, 1);
  assert.equal((await f.message({ type: InfluenceMessages.configure, apiKey })).error, null);
  assert.equal((await f.scan(post(2))).ok, true);
  assert.equal(f.calls.length, 2);
  const status = await f.message({ type: InfluenceMessages.status });
  assert.equal(JSON.stringify(status).includes(apiKey), false);
});

test("rate limit and timeout fail open without automatic paid retries", async () => {
  const limited = fixture({ fetchImpl: async () => new Response("Provider error details", { status: 429, headers: { "retry-after": "60" } }) });
  const result = await limited.scan();
  assert.equal(result.error, "rate-limited");
  assert.equal(result.retryAfterMs, 60000);
  assert.equal((await limited.scan(post(2))).error, "rate-limited");
  assert.equal(limited.calls.length, 1);
  const timeout = fixture({ requestTimeoutMs: 5, fetchImpl: (_url, request) => new Promise((_resolve, reject) => {
    request.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }) });
  assert.equal((await timeout.scan()).error, "timeout");
  assert.equal(timeout.calls.length, 1);
});

test("key removal aborts pending requests, discards stale answers and keeps the secret out of preferences", async () => {
  let started;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  const f = fixture({ fetchImpl: (_url, request) => new Promise((_resolve, reject) => {
    started();
    request.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }) });
  const pending = f.scan();
  await startedPromise;
  const status = await f.message({ type: InfluenceMessages.configure, clearKey: true });
  assert.equal(status.configured, false);
  assert.equal((await pending).error, "disabled");
  assert.equal(status.cacheCount, 0);
  assert.equal((await f.scan(post(2))).error, "not-configured");
  assert.equal(f.calls.length, 1);
  assert.equal(JSON.stringify(f.saved).includes(apiKey), false);
});

test("malformed provider probabilities never become warning badges or cached facts", async () => {
  const f = fixture({ fetchImpl: async () => response({ sales: 1.5, fomo: 0, bait: 0 }) });
  assert.equal((await f.scan()).error, "invalid-response");
  assert.equal((await f.message({ type: InfluenceMessages.status })).cacheCount, 0);
  assert.equal(f.calls.length, 1);
});

test("quota failure prevents billing; disabling blocks scans; clear-cache does not reset the request cap", async () => {
  const failed = fixture();
  failed.rejectWrites();
  assert.equal((await failed.scan()).error, "storage-unavailable");
  assert.equal(failed.calls.length, 0);
  const f = fixture();
  f.saved.influenceWarnings = "off";
  assert.equal((await f.scan()).error, "disabled");
  f.saved.influenceWarnings = "on";
  await f.scan();
  assert.equal((await f.message({ type: InfluenceMessages.clearCache })).cacheCount, 0);
  assert.equal((await f.message({ type: InfluenceMessages.status })).dailyUsed, 1);
});

test("default warning threshold is conservative and labels remain independent", () => {
  assert.equal(influenceDefaults.influenceSensitivity, 0.9);
  assert.deepEqual(influenceLabels({ sales: 0.95, fomo: 0.85, bait: 0.98 }), ["sales", "bait"]);
  assert.deepEqual(influenceLabels({ sales: 0.1, fomo: 0.85, bait: 0.2 }, 0.8), ["fomo"]);
});
