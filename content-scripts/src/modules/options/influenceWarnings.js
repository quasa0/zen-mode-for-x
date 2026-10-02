import {
  canonicalPostUrl,
  INFLUENCE_LABELS,
  InfluenceMessages,
  influenceDefaults,
  influenceLabels,
  KeyInfluenceDailyLimit,
  KeyInfluenceSensitivity,
  KeyInfluenceWarnings,
  normalizeInfluencePost,
} from "../../../../influence-shared";

const POST = '[data-testid="tweet"]';
const QUOTE = '[data-testid="quoteTweet"], [data-testid="quotedTweet"], div[role="link"]';
const OWNED = '[data-mt-influence-warning]';
const DWELL_MS = 650;
const MAX_CONCURRENT = 2;
const MAX_ATTEMPTS = 3;
const states = new Map();
const queue = new Set();
const pending = new Set();
let enabled = false;
let threshold = influenceDefaults[KeyInfluenceSensitivity];
let dailyLimit = influenceDefaults[KeyInfluenceDailyLimit];
let observer = null;
let route = "";
let revision = 0;
let serial = 0;
let active = 0;
let popover = null;

const currentRoute = () => location.pathname + location.search;
const publicRoute = () => window.top === window && !/^\/(?:messages|notifications|settings|compose|login|logout|signup|account|i\/(?:chat|grok|flow|settings|connect_people))(?:\/|$)/i.test(location.pathname);
const own = (element, post) => element.closest(POST) === post && !element.parentElement?.closest(QUOTE);
const visible = (post) => {
  if (document.visibilityState === "hidden" || !post.isConnected) return false;
  const rect = post.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
};

// Require the author's own timestamp. A quote or a media link must not identify the post.
export const extractInfluencePost = (post) => {
  if (!post?.matches(POST) || post.parentElement?.closest(`${POST}, ${QUOTE}, [role="dialog"], [data-testid="DMDrawer"]`)) return null;
  // Quoted text is context, but must still be public before it leaves the browser.
  const headers = [...post.querySelectorAll('[data-testid="User-Name"]')];
  if (!headers.some((header) => own(header, post))) return null;
  if (headers.some((header) => [header, ...header.querySelectorAll("[aria-label], [title], svg > title")].some((element) =>
    /(?:protected (?:account|posts|tweets)|private account)/i.test(`${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""} ${element.matches("svg > title") ? element.textContent : ""}`)))) return null;
  const anchor = [...post.querySelectorAll('a[href*="/status/"]')].find((element) =>
    own(element, post) && element.querySelector("time") && canonicalPostUrl(element.href));
  if (!anchor) return null;
  const text = [...post.querySelectorAll('[data-testid="tweetText"]')].filter((element) => own(element, post))
    .map((element) => element.textContent.trim()).filter(Boolean).join("\n");
  if (!text || text.length > 6000) return null;
  const quotedText = [...post.querySelectorAll('[data-testid="tweetText"]')]
    .filter((element) => !own(element, post)).map((element) => element.textContent.trim()).filter(Boolean).join("\n").slice(0, 2000);
  const links = [];
  for (const element of post.querySelectorAll('a[href]')) {
    if (!own(element, post) || !element.closest('[data-testid="tweetText"], [data-testid="card.wrapper"]')) continue;
    const value = /^https?:\/\//i.test(element.getAttribute("title") || "") ? element.getAttribute("title") : element.href;
    try {
      const link = new URL(value);
      if (!["http:", "https:"].includes(link.protocol) || link.username || link.password || /^(?:www\.|mobile\.)?(?:x|twitter)\.com$/i.test(link.hostname)) continue;
      link.search = "";
      link.hash = "";
      if (!links.includes(link.href)) links.push(link.href);
    } catch { /* A malformed link provides no evidence. */ }
    if (links.length === 10) break;
  }
  const payload = normalizeInfluencePost({ url: anchor.href, text, quotedText, links });
  return payload ? { payload, anchor, signature: JSON.stringify(payload) } : null;
};

const validResult = (result) => result && typeof result.model === "string" && result.model.length <= 80 &&
  ["sales", "fomo", "bait"].every((kind) => Number.isFinite(result.scores?.[kind]) && result.scores[kind] >= 0 && result.scores[kind] <= 1);

function closePopover() {
  if (!popover) return;
  popover.state.button?.setAttribute("aria-expanded", "false");
  popover.host.remove();
  popover = null;
}

function removeBadge(state) {
  if (popover?.state === state) closePopover();
  state.host?.remove();
  state.host = null;
  state.button = null;
}

function openPopover(state) {
  if (popover?.state === state) { closePopover(); return; }
  closePopover();
  if (!state.host?.isConnected || !validResult(state.result)) return;
  const labels = influenceLabels(state.result.scores, threshold);
  if (!labels.length) return;
  const host = document.createElement("div");
  host.id = "mt-influence-popover";
  host.style.cssText = "position:fixed;z-index:2147483647;width:min(304px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;border-radius:14px;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>
    :host { color:var(--main-text-color,rgb(15 20 25)); font:400 13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    section { padding:15px; border-radius:14px; background:var(--body-bg-color,#fff); box-shadow:0 0 0 1px var(--border-color,rgb(128 128 128 / .28)), 0 8px 32px rgb(0 0 0 / .18); transition:opacity 150ms cubic-bezier(.23,1,.32,1), transform 150ms cubic-bezier(.23,1,.32,1); }
    @starting-style { section { opacity:0; transform:scale(.97); } }
    @media (prefers-reduced-motion:reduce) { section { transition:opacity 150ms ease; transform:none !important; } button { transition:none; } button:active { scale:1; } }
    header { display:flex; align-items:center; gap:12px; margin-bottom:10px; }
    h2 { flex:1; font-size:13px; font-weight:650; margin:0; }
    button { display:grid; place-items:center; width:28px; height:28px; margin:-5px -5px -5px 0; padding:0; border:0; border-radius:7px; color:inherit; background:transparent; cursor:pointer; font-size:20px; transition:scale 150ms cubic-bezier(.23,1,.32,1), background-color 150ms ease; }
    button:active { scale:.96; } @media (hover:hover) and (pointer:fine) { button:hover { background:rgb(128 128 128 / .12); } } button:focus-visible { outline:2px solid #ca8421; outline-offset:2px; }
    ul { list-style:none; padding:0; margin:0; } li { display:flex; gap:10px; padding:4px 0; opacity:.65; } li[data-flagged] { opacity:1; color:color-mix(in srgb,var(--main-text-color,rgb(15 20 25)) 35%,#b47623); } li span:first-child { flex:1; } li span:last-child { font-variant-numeric:tabular-nums; }
    p { margin:10px 0 0; opacity:.7; font-size:11px; } .note { margin-top:8px; font-size:12px; opacity:.8; }
  </style><section role="dialog" aria-label="Potential influence patterns" data-testid="mt-influence-details"><header><h2>Potential influence patterns</h2><button type="button" aria-label="Close influence warning">×</button></header><ul></ul><p class="note">These estimates are not evidence of hidden intent and may be wrong.</p><p data-model></p><p>Text only · images, videos and linked pages not checked</p></section>`;
  for (const kind of Object.keys(INFLUENCE_LABELS)) {
    const row = document.createElement("li");
    if (labels.includes(kind)) row.setAttribute("data-flagged", "");
    const label = document.createElement("span");
    const score = document.createElement("span");
    label.textContent = INFLUENCE_LABELS[kind];
    score.textContent = `${Math.round(state.result.scores[kind] * 100)}%`;
    row.append(label, score);
    shadow.querySelector("ul").append(row);
  }
  shadow.querySelector("[data-model]").textContent = `${state.result.model} · Estimated likelihood`;
  shadow.querySelector("button").addEventListener("click", (event) => { event.stopPropagation(); closePopover(); state.button?.focus({ preventScroll: true }); });
  host.addEventListener("click", (event) => event.stopPropagation());
  document.documentElement.append(host);
  const anchorRect = state.button.getBoundingClientRect();
  const panelRect = host.getBoundingClientRect();
  const left = Math.min(Math.max(12, anchorRect.left - panelRect.width + anchorRect.width), Math.max(12, innerWidth - panelRect.width - 12));
  const below = anchorRect.bottom + 8;
  const top = below + panelRect.height <= innerHeight - 12 ? below : Math.max(12, anchorRect.top - panelRect.height - 8);
  host.style.left = `${left}px`;
  host.style.top = `${top}px`;
  state.button.setAttribute("aria-expanded", "true");
  popover = { state, host };
  shadow.querySelector("button").focus({ preventScroll: true });
}

function render(state) {
  const labels = influenceLabels(state.result?.scores, threshold);
  if (!labels.length || !state.anchor?.isConnected) { removeBadge(state); return; }
  if (state.host && state.host.parentElement !== state.anchor.parentElement) removeBadge(state);
  if (!state.host?.isConnected) {
    const host = document.createElement("span");
    host.id = `mt-influence-warning-${++serial}`;
    host.setAttribute("data-mt-influence-warning", "");
    host.style.cssText = "display:inline-flex;flex:0 0 auto;vertical-align:middle;width:24px;height:24px;margin-inline-start:2px;align-self:center;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      :host { color:#bd7a21; } button { width:24px; height:24px; display:grid; place-items:center; padding:0; border:0; border-radius:50%; color:inherit; background:rgb(202 132 33 / .1); cursor:pointer; transition:scale 150ms cubic-bezier(.23,1,.32,1), background-color 150ms ease; }
      button:active { scale:.96; } @media (hover:hover) and (pointer:fine) { button:hover { background:rgb(202 132 33 / .2); } }
      @media (prefers-reduced-motion:reduce) { button { transition:none; } button:active { scale:1; } } button:focus-visible { outline:2px solid currentColor; outline-offset:2px; } svg { width:13px; height:13px; }
      @media (prefers-contrast:more) { button { background:transparent; outline:1px solid currentColor; } }
    </style><button type="button" data-testid="mt-influence-button" aria-haspopup="dialog" aria-expanded="false"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7.25" stroke="currentColor" stroke-width="1.5"/><path d="M10 5.8v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="10" cy="14" r=".9" fill="currentColor"/></svg></button>`;
    state.host = host;
    state.button = shadow.querySelector("button");
    host.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); });
    state.button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); openPopover(state); });
    state.anchor.insertAdjacentElement("afterend", host);
  }
  const label = labels.map((kind) => INFLUENCE_LABELS[kind]).join("; ");
  state.button.setAttribute("aria-label", `${label}. Open text-based estimates.`);
  state.button.title = `${label} · Jev estimates may be wrong`;
  state.host.setAttribute("data-mt-influence-labels", labels.join(" "));
}

function clearDwell(state) {
  clearTimeout(state.timer);
  state.timer = null;
  queue.delete(state);
}

function forget(post, state) {
  clearDwell(state);
  removeBadge(state);
  observer?.unobserve(post);
  states.delete(post);
}

function reset() {
  revision++;
  for (const [post, state] of states) forget(post, state);
  queue.clear();
  closePopover();
}

function sendScan(payload) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pending.delete(cancel);
      resolve(response);
    };
    const cancel = () => finish({ ok: false, error: "disabled" });
    const timer = setTimeout(() => finish({ ok: false, error: "timeout" }), 20000);
    pending.add(cancel);
    try {
      chrome.runtime.sendMessage({ type: InfluenceMessages.scan, post: payload }, (response) => {
        if (chrome.runtime.lastError) finish({ ok: false, error: "unavailable" });
        else finish(response || { ok: false, error: "unavailable" });
      });
    } catch { finish({ ok: false, error: "unavailable" }); }
  });
}

function pump() {
  if (!enabled || !publicRoute() || document.visibilityState === "hidden") return;
  while (active < MAX_CONCURRENT && queue.size) {
    const state = queue.values().next().value;
    queue.delete(state);
    if (states.get(state.post) !== state || !state.visible || !visible(state.post) || state.attempts >= MAX_ATTEMPTS) continue;
    const latest = extractInfluencePost(state.post);
    if (!latest || latest.signature !== state.signature) { refreshInfluenceWarnings(); continue; }
    const expectedRevision = revision;
    const signature = state.signature;
    const expectedRoute = route;
    const expectedDailyLimit = dailyLimit;
    state.attempts++;
    state.retryAt = null;
    state.scanning = true;
    active++;
    sendScan(state.payload).then((response) => {
      if (!enabled || revision !== expectedRevision || currentRoute() !== expectedRoute || states.get(state.post) !== state || state.signature !== signature) return;
      const current = extractInfluencePost(state.post);
      if (!current || current.signature !== signature) { refreshInfluenceWarnings(); return; }
      if (response?.ok && validResult(response.result)) {
        state.result = response.result;
        render(state);
      } else if (response?.error === "busy" && state.attempts < 2 && state.visible) {
        state.retryAt = Date.now() + 5000;
      } else if (response?.error === "daily-limit" && dailyLimit > expectedDailyLimit) {
        // A cap increase can precede a response that used the previous cap.
        state.attempts = 0;
        state.retryAt = Date.now();
      } else if (["rate-limited", "unavailable", "timeout", "invalid-response"].includes(response?.error) &&
        Number.isFinite(response.retryAfterMs) && response.retryAfterMs > 0 && state.attempts < MAX_ATTEMPTS) {
        state.retryAt = Date.now() + Math.max(30000, Math.min(900000, response.retryAfterMs));
      }
    }).catch(() => {
      // A lost extension context or removed native node must leave the post readable.
    }).finally(() => {
      state.scanning = false;
      active--;
      if (state.retryAt !== null) arm(state);
      pump();
    });
  }
}

function arm(state) {
  if (!enabled || states.get(state.post) !== state || !state.visible || state.timer || state.scanning || state.result ||
    state.attempts >= MAX_ATTEMPTS || (state.attempts > 0 && state.retryAt === null) || document.visibilityState === "hidden") return;
  const delay = state.retryAt === null ? DWELL_MS : Math.max(DWELL_MS, state.retryAt - Date.now());
  state.timer = setTimeout(() => {
    state.timer = null;
    if (!enabled || states.get(state.post) !== state || !state.visible || !visible(state.post)) return;
    queue.add(state);
    pump();
  }, delay);
}

export function refreshInfluenceWarnings() {
  if (!enabled) return;
  const nextRoute = currentRoute();
  if (nextRoute !== route) { reset(); route = nextRoute; }
  if (!publicRoute()) { if (states.size) reset(); return; }
  for (const [post, state] of states) if (!post.isConnected) forget(post, state);
  for (const post of document.querySelectorAll(POST)) {
    const extracted = extractInfluencePost(post);
    let state = states.get(post);
    if (!extracted) { if (state) forget(post, state); continue; }
    if (state?.signature !== extracted.signature) {
      if (state) forget(post, state);
      state = { post, ...extracted, visible: false, attempts: 0, retryAt: null, scanning: false, result: null, host: null, button: null, timer: null };
      states.set(post, state);
      observer.observe(post);
    } else {
      state.anchor = extracted.anchor;
      if (state.result) render(state);
      arm(state);
    }
  }
}

const outsideClick = (event) => {
  if (popover && !event.composedPath().includes(popover.host) && !event.composedPath().includes(popover.state.host)) closePopover();
};
const escape = (event) => {
  if (event.key === "Escape" && popover) {
    const button = popover.state.button;
    closePopover();
    button?.focus({ preventScroll: true });
    event.stopPropagation();
  }
};
const viewportChange = () => { closePopover(); };
const visibilityChange = () => {
  closePopover();
  for (const state of states.values()) { clearDwell(state); if (document.visibilityState !== "hidden") arm(state); }
};
const routeChange = () => refreshInfluenceWarnings();
const invalidation = (message) => {
  if (message?.type === InfluenceMessages.invalidate) { reset(); refreshInfluenceWarnings(); }
};

const pageHide = () => {
  // A page restored from the back/forward cache needs a fresh visible dwell.
  reset();
  for (const cancel of [...pending]) cancel();
};

function stop() {
  reset();
  observer?.disconnect();
  observer = null;
  for (const cancel of [...pending]) cancel();
  document.removeEventListener("pointerdown", outsideClick, true);
  document.removeEventListener("keydown", escape, true);
  document.removeEventListener("visibilitychange", visibilityChange);
  window.removeEventListener("scroll", viewportChange, true);
  window.removeEventListener("resize", viewportChange);
  window.removeEventListener("popstate", routeChange);
  window.removeEventListener("pagehide", pageHide);
  window.removeEventListener("pageshow", routeChange);
  window.navigation?.removeEventListener("currententrychange", routeChange);
  try { chrome.runtime.onMessage.removeListener(invalidation); } catch { /* The extension can be reloaded while a tab survives. */ }
  document.querySelectorAll(OWNED).forEach((element) => element.remove());
}

export function changeInfluenceWarnings(data) {
  if (Number.isFinite(data?.[KeyInfluenceSensitivity])) threshold = Math.max(0.5, Math.min(0.95, data[KeyInfluenceSensitivity]));
  const nextDailyLimit = Number.isFinite(data?.[KeyInfluenceDailyLimit]) ? data[KeyInfluenceDailyLimit] : dailyLimit;
  if (nextDailyLimit !== dailyLimit) {
    dailyLimit = nextDailyLimit;
    for (const state of states.values()) {
      if (state.scanning || state.result) continue;
      clearDwell(state);
      state.attempts = 0;
      state.retryAt = null;
      arm(state);
    }
  }
  const nextEnabled = data?.[KeyInfluenceWarnings] === "on";
  if (!nextEnabled) { enabled = false; stop(); return; }
  if (typeof IntersectionObserver !== "function") { enabled = false; stop(); return; }
  enabled = true;
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const state = states.get(entry.target);
        if (!state) continue;
        state.visible = entry.isIntersecting && entry.intersectionRect.height >= Math.min(80, entry.boundingClientRect.height * 0.15);
        if (state.visible) arm(state);
        else clearDwell(state);
      }
    }, { threshold: [0, 0.15] });
    document.addEventListener("pointerdown", outsideClick, true);
    document.addEventListener("keydown", escape, true);
    document.addEventListener("visibilitychange", visibilityChange);
    window.addEventListener("scroll", viewportChange, { capture: true, passive: true });
    window.addEventListener("resize", viewportChange);
    window.addEventListener("popstate", routeChange);
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("pageshow", routeChange);
    window.navigation?.addEventListener("currententrychange", routeChange);
    try { chrome.runtime.onMessage.addListener(invalidation); } catch { /* No runtime means scans fail open. */ }
  }
  if (popover) closePopover();
  refreshInfluenceWarnings();
}
