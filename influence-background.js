import {
  INFLUENCE_API_URL, INFLUENCE_MODEL, INFLUENCE_PROMPT_REVISION,
  InfluenceMessages, KeyInfluenceDailyLimit, KeyInfluenceWarnings,
  createInfluenceRequest, influenceDefaults, normalizeInfluencePost,
} from "./influence-shared.js";

const CACHE_KEY = "zenInfluenceCacheV1";
const BUDGET_KEY = "zenInfluenceBudgetV1";
const SERVICE_KEY = "zenInfluenceServiceV1";
const CACHE_LIMIT = 1000;
const CACHE_LIFETIME = 30 * 24 * 60 * 60 * 1000;
const emptyCircuit = () => ({ error: null, until: 0, failures: 0 });
const fail = (error, retryAfterMs) => ({ ok: false, error, ...(retryAfterMs ? { retryAfterMs } : {}) });
const safeError = (error) => error?.message === "storage-unavailable" ? "storage-unavailable" : "unavailable";

// This database belongs to the extension origin. An isolated content script's
// indexedDB belongs to the host page origin, so it cannot read this credential.
export const createInfluenceKeyStore = (database = globalThis.indexedDB) => {
  const open = () => new Promise((resolve, reject) => {
    if (!database) { reject(new Error("storage-unavailable")); return; }
    let finished = false;
    const timeout = setTimeout(() => {
      finished = true;
      reject(new Error("storage-unavailable"));
    }, 5000);
    let request;
    try { request = database.open("zen-influence-private", 1); }
    catch {
      clearTimeout(timeout);
      reject(new Error("storage-unavailable"));
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("credentials")) request.result.createObjectStore("credentials");
    };
    request.onerror = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      reject(new Error("storage-unavailable"));
    };
    request.onsuccess = () => {
      if (finished) { request.result.close(); return; }
      finished = true;
      clearTimeout(timeout);
      resolve(request.result);
    };
  });
  const operate = async (mode, action) => {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        let value;
        const transaction = db.transaction("credentials", mode);
        const request = action(transaction.objectStore("credentials"));
        request.onsuccess = () => { value = request.result; };
        transaction.oncomplete = () => resolve(value);
        transaction.onabort = transaction.onerror = () => reject(new Error("storage-unavailable"));
      });
    } finally { db.close(); }
  };
  return {
    get: () => operate("readonly", (store) => store.get("jevApiKey")),
    set: (key) => operate("readwrite", (store) => store.put(key, "jevApiKey")),
    clear: () => operate("readwrite", (store) => store.delete("jevApiKey")),
  };
};

const publicRoute = (value) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.port || url.username || url.password ||
      !["x.com", "twitter.com", "mobile.twitter.com"].includes(url.hostname)) return false;
    return /^\/(?:home|explore|search|notifications)\/?$/.test(url.pathname) ||
      /^\/i\/(?:bookmarks|lists\/[1-9]\d{0,24})\/?$/.test(url.pathname) ||
      /^\/(?:[A-Za-z0-9_]{1,15}\/status|i\/(?:web\/)?status)\/[1-9]\d{0,24}(?:\/(?:photo|video)\/\d+)?\/?$/.test(url.pathname) ||
      (/^\/[A-Za-z0-9_]{1,15}(?:\/(?:with_replies|media|highlights|likes|articles))?\/?$/.test(url.pathname) &&
        !/^\/(?:messages|chat|grok|compose|settings|login|logout|account|privacy|tos|intent|i)(?:\/|$)/i.test(url.pathname));
  } catch { return false; }
};

const validResult = (result, now) => result && result.model === INFLUENCE_MODEL &&
  Number.isFinite(result.checkedAt) && result.checkedAt > now - CACHE_LIFETIME && result.checkedAt <= now + 60000 &&
  ["sales", "fomo", "bait"].every((key) => Number.isFinite(result.scores?.[key]) && result.scores[key] >= 0 && result.scores[key] <= 1);

export const createInfluenceService = ({
  api = globalThis.chrome,
  fetchImpl = (...args) => globalThis.fetch(...args),
  cryptoImpl = globalThis.crypto,
  keyStore = createInfluenceKeyStore(),
  now = () => Date.now(),
  requestTimeoutMs = 12000,
} = {}) => {
  let stateQueue = Promise.resolve();
  let loaded = false;
  let cache = Object.create(null);
  let budget = { day: "", used: 0 };
  let circuit = emptyCircuit();
  let generation = 0;
  let active = 0;
  const queued = [];
  const pending = new Map();
  const controllers = new Set();
  const serial = (operation) => {
    const result = stateQueue.then(operation);
    stateQueue = result.catch(() => {});
    return result;
  };
  const storage = (method, value) => new Promise((resolve, reject) => {
    try {
      api.storage.local[method](value, (result) => {
        if (api.runtime.lastError) reject(new Error("storage-unavailable"));
        else resolve(result);
      });
    } catch { reject(new Error("storage-unavailable")); }
  });
  const prune = () => {
    const previous = Object.keys(cache).length;
    const entries = Object.entries(cache).filter(([, entry]) => validResult(entry.result, now()))
      .sort((a, b) => b[1].result.checkedAt - a[1].result.checkedAt).slice(0, CACHE_LIMIT);
    cache = Object.assign(Object.create(null), Object.fromEntries(entries));
    return previous !== entries.length;
  };
  const load = async () => {
    if (loaded) return;
    const saved = await storage("get", [CACHE_KEY, BUDGET_KEY, SERVICE_KEY]);
    for (const [url, entry] of Object.entries(saved[CACHE_KEY] || {})) {
      const normalized = normalizeInfluencePost({ url, text: "validate" });
      if (normalized?.url === url && /^[a-f0-9]{64}$/.test(entry?.hash) && validResult(entry.result, now())) {
        cache[url] = { hash: entry.hash, result: {
          scores: { sales: entry.result.scores.sales, fomo: entry.result.scores.fomo, bait: entry.result.scores.bait },
          model: INFLUENCE_MODEL, checkedAt: entry.result.checkedAt,
        } };
      }
    }
    const savedBudget = saved[BUDGET_KEY];
    if (/^\d{4}-\d{2}-\d{2}$/.test(savedBudget?.day) && Number.isInteger(savedBudget.used) && savedBudget.used >= 0) budget = savedBudget;
    const savedCircuit = saved[SERVICE_KEY];
    if (["unauthorized", "rate-limited", "unavailable", "timeout", "invalid-response"].includes(savedCircuit?.error) &&
      Number.isFinite(savedCircuit.until) && Number.isInteger(savedCircuit.failures)) {
      circuit = { error: savedCircuit.error, until: savedCircuit.until, failures: Math.min(6, Math.max(0, savedCircuit.failures)) };
    }
    prune();
    if (JSON.stringify(saved[CACHE_KEY] || {}) !== JSON.stringify(cache)) await storage("set", { [CACHE_KEY]: cache });
    loaded = true;
  };
  const preferences = async () => {
    const data = await storage("get", ["extensionStatus", KeyInfluenceWarnings, KeyInfluenceDailyLimit]);
    const limit = Number(data[KeyInfluenceDailyLimit] ?? influenceDefaults[KeyInfluenceDailyLimit]);
    return {
      enabled: (data.extensionStatus ?? "on") === "on" && (data[KeyInfluenceWarnings] ?? "off") === "on",
      dailyLimit: Number.isFinite(limit) ? Math.min(2000, Math.max(1, Math.round(limit))) : influenceDefaults[KeyInfluenceDailyLimit],
    };
  };
  const day = () => new Date(now()).toISOString().slice(0, 10);
  const circuitFailure = () => {
    if (circuit.error === "unauthorized") return fail("unauthorized");
    if (circuit.until > now()) return fail(circuit.error, circuit.until - now());
    return null;
  };
  const digest = async (post) => {
    const input = JSON.stringify([INFLUENCE_MODEL, INFLUENCE_PROMPT_REVISION, post]);
    const bytes = await cryptoImpl.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
  };
  const cancel = () => {
    generation += 1;
    for (const controller of controllers) controller.abort();
    for (const job of queued.splice(0)) job.resolve(fail("disabled"));
    pending.clear();
  };
  const notify = () => {
    try {
      api.tabs.query({}, (tabs) => {
        if (api.runtime.lastError) return;
        for (const tab of tabs || []) {
          if (!Number.isInteger(tab.id)) continue;
          api.tabs.sendMessage(tab.id, { type: InfluenceMessages.invalidate }, () => { void api.runtime.lastError; });
        }
      });
    } catch { /* No receiver is expected in tabs where the extension is absent. */ }
  };
  const status = () => serial(async () => {
    await load();
    if (prune()) await storage("set", { [CACHE_KEY]: cache });
    const prefs = await preferences();
    const configured = !!(await keyStore.get());
    const blocked = circuitFailure();
    return {
      ok: true, configured, cacheCount: Object.keys(cache).length,
      dailyUsed: budget.day === day() ? budget.used : 0, dailyLimit: prefs.dailyLimit,
      error: configured ? blocked?.error || null : null,
      ...(blocked?.retryAfterMs ? { retryAfterMs: blocked.retryAfterMs } : {}),
      model: INFLUENCE_MODEL,
    };
  });
  const recordFailure = (error, response, version) => serial(async () => {
    if (version !== generation) return;
    const failures = Math.min(6, circuit.failures + 1);
    let delay = Math.min(5 * 60 * 1000, 30000 * 2 ** (failures - 1));
    const retryHeader = response?.headers?.get("retry-after");
    if (retryHeader) {
      const seconds = Number(retryHeader);
      const requested = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryHeader) - now();
      if (Number.isFinite(requested) && requested > 0) delay = Math.min(15 * 60 * 1000, Math.max(delay, requested));
    }
    circuit = { error, until: error === "unauthorized" ? 0 : now() + delay, failures };
    await storage("set", { [SERVICE_KEY]: circuit });
  });
  const execute = async (job) => {
    const version = generation;
    const prefs = await preferences();
    if (!prefs.enabled) return fail("disabled");
    const key = await keyStore.get();
    if (!key) return fail("not-configured");
    const reservation = await serial(async () => {
      await load();
      if (version !== generation) return fail("disabled");
      const blocked = circuitFailure();
      if (blocked) return blocked;
      if (budget.day !== day()) budget = { day: day(), used: 0 };
      if (budget.used >= prefs.dailyLimit) return fail("daily-limit");
      // Persist before sending. Failed requests count too; a restart cannot bypass the cap.
      const next = { day: budget.day, used: budget.used + 1 };
      await storage("set", { [BUDGET_KEY]: next });
      budget = next;
      return null;
    });
    if (reservation) return reservation;
    if (version !== generation) return fail("disabled");
    const controller = new AbortController();
    controllers.add(controller);
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, requestTimeoutMs);
    try {
      const response = await fetchImpl(INFLUENCE_API_URL, {
        method: "POST", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(createInfluenceRequest(job.post)), signal: controller.signal,
      });
      if (version !== generation) return fail("disabled");
      if (!response.ok) {
        const error = response.status === 401 ? "unauthorized" : [429, 529].includes(response.status) ? "rate-limited" : "unavailable";
        await recordFailure(error, response, version);
        return fail(error, circuitFailure()?.retryAfterMs);
      }
      const answer = await response.json();
      if (answer?.model !== INFLUENCE_MODEL || !["sales", "fomo", "bait"].every((kind) =>
        answer.answers?.[kind]?.type === "noul" && Number.isFinite(answer.answers[kind].noul) &&
        answer.answers[kind].noul >= 0 && answer.answers[kind].noul <= 1)) {
        await recordFailure("invalid-response", response, version);
        return fail("invalid-response", circuitFailure()?.retryAfterMs);
      }
      if (version !== generation || !(await preferences()).enabled) return fail("disabled");
      const result = { scores: Object.fromEntries(["sales", "fomo", "bait"].map((kind) => [kind, answer.answers[kind].noul])), model: answer.model, checkedAt: now() };
      await serial(async () => {
        if (version !== generation) return;
        cache[job.post.url] = { hash: job.hash, result };
        prune();
        await storage("set", { [CACHE_KEY]: cache });
        if (circuit.error && circuit.until <= now() && circuit.error !== "unauthorized") {
          circuit = emptyCircuit();
          await storage("set", { [SERVICE_KEY]: circuit });
        }
      });
      return version === generation ? { ok: true, result, cached: false } : fail("disabled");
    } catch (error) {
      if (version !== generation) return fail("disabled");
      const code = error?.message === "storage-unavailable" ? "storage-unavailable" : timedOut ? "timeout" : "unavailable";
      if (code !== "storage-unavailable") await recordFailure(code, null, version);
      return fail(code, circuitFailure()?.retryAfterMs);
    } finally {
      clearTimeout(timeout);
      controllers.delete(controller);
    }
  };
  const pump = () => {
    while (active < 2 && queued.length) {
      const job = queued.shift();
      active += 1;
      execute(job).catch((error) => fail(safeError(error))).then(job.resolve).finally(() => {
        active -= 1;
        if (pending.get(job.hash) === job.promise) pending.delete(job.hash);
        pump();
      });
    }
  };
  const scan = async (post) => {
    const prefs = await preferences();
    if (!prefs.enabled) return fail("disabled");
    if (!(await keyStore.get())) return fail("not-configured");
    const hash = await digest(post);
    const cached = await serial(async () => {
      await load();
      const entry = cache[post.url];
      return entry?.hash === hash && validResult(entry.result, now()) ? entry.result : null;
    });
    if (cached) return { ok: true, result: cached, cached: true };
    if (pending.has(hash)) return pending.get(hash);
    if (pending.size >= 40) return fail("busy", 1000);
    const blocked = circuitFailure();
    if (blocked) return blocked;
    const job = { post, hash };
    const promise = new Promise((resolve) => { job.resolve = resolve; });
    job.promise = promise;
    queued.push(job);
    pending.set(hash, promise);
    pump();
    return promise;
  };
  const trustedPage = (sender) => sender?.id === api.runtime.id && typeof sender.url === "string" && sender.url.startsWith(api.runtime.getURL(""));
  const trustedContent = (sender) => sender?.id === api.runtime.id && sender.frameId === 0 &&
    Number.isInteger(sender.tab?.id) && publicRoute(sender.url) && publicRoute(sender.tab.url);
  const handle = async (message, sender) => {
    try {
      if (!message || typeof message !== "object") return fail("not-allowed");
      if (message.type === InfluenceMessages.scan) {
        if (!trustedContent(sender)) return fail("not-allowed");
        const post = normalizeInfluencePost(message.post);
        return post ? await scan(post) : fail("invalid-post");
      }
      if (!trustedPage(sender)) return fail("not-allowed");
      if (message.type === InfluenceMessages.status) return await status();
      if (message.type === InfluenceMessages.configure) {
        if (message.clearKey !== true && (typeof message.apiKey !== "string" ||
          message.apiKey.trim().length < 16 || message.apiKey.trim().length > 512 || /\s|[^\x21-\x7e]/.test(message.apiKey.trim()))) return fail("invalid-key");
        if (message.clearKey === true && message.apiKey !== undefined) return fail("invalid-key");
        cancel();
        await serial(async () => {
          await load();
          if (message.clearKey === true) await keyStore.clear();
          else await keyStore.set(message.apiKey.trim());
          circuit = emptyCircuit();
          await storage("set", { [SERVICE_KEY]: circuit });
        });
        notify();
        return await status();
      }
      if (message.type === InfluenceMessages.clearCache) {
        cancel();
        await serial(async () => { await load(); cache = Object.create(null); await storage("set", { [CACHE_KEY]: {} }); });
        notify();
        return await status();
      }
      return fail("not-allowed");
    } catch (error) { return fail(safeError(error)); }
  };
  return { handle, cancel };
};

export const registerInfluenceBackground = (api = globalThis.chrome) => {
  const service = createInfluenceService({ api });
  const types = new Set([InfluenceMessages.scan, InfluenceMessages.status, InfluenceMessages.configure, InfluenceMessages.clearCache]);
  api.runtime.onMessage.addListener((message, sender, respond) => {
    if (!types.has(message?.type)) return false;
    service.handle(message, sender).then(respond).catch(() => respond(fail("unavailable")));
    return true;
  });
  api.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && ((changes.extensionStatus && changes.extensionStatus.newValue !== "on") ||
      (changes[KeyInfluenceWarnings] && changes[KeyInfluenceWarnings].newValue !== "on"))) service.cancel();
  });
  return service;
};
