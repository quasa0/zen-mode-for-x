import { KeyMindfulScrolling, KeyScrollLimitMinutes, KeyScrollReminderIntensity } from "../../../../storage-keys";
import selectors from "../../selectors";
import { MindfulScrollSession, normalizeScrollMinutes } from "../utilities/mindfulScrollSession";

let controller;

const styles = `
:host { position:fixed; inset:0; z-index:2147483000; pointer-events:none; color-scheme:light dark; }
:host([hidden]) { display:none !important; }
#edge { position:absolute; inset:0; pointer-events:none; opacity:0; transition:opacity 180ms cubic-bezier(.23,1,.32,1); }
:host([data-phase="near"]) #edge { opacity:1; box-shadow:inset 0 0 24px rgba(255,184,26,.20); }
:host([data-phase="limit"]) #edge { opacity:1; box-shadow:inset 0 0 30px rgba(255,41,23,.26); }
:host([data-phase="recovery"]) #edge { opacity:1; box-shadow:inset 0 0 32px rgba(61,255,166,.24); }
:host([data-intensity="clear"][data-phase="near"]) #edge { box-shadow:inset 0 0 24px rgba(255,184,26,.32); }
:host([data-intensity="clear"][data-phase="limit"]) #edge { box-shadow:inset 0 0 54px rgba(255,41,23,.44); animation:breathing 3.4s cubic-bezier(.45,0,.55,1) infinite alternate; }
@keyframes breathing { from { opacity:.78; } to { opacity:1; } }
#cue { position:absolute; top:72px; right:16px; box-sizing:border-box; width:232px; max-width:calc(100vw - 32px); padding:12px; border:1px solid rgba(128,128,128,.28); border-radius:16px; background:var(--body-bg-color,#fff); color:var(--main-text-color,#18212a); font:13px/1.4 system-ui,sans-serif; box-shadow:0 3px 14px rgba(0,0,0,.10); pointer-events:auto; }
#cue[hidden] { display:none; }
#message { margin:0; font-weight:600; }
#details { margin:3px 0 10px; color:var(--secondary-text-color,#536471); font-size:12px; }
#actions { display:flex; flex-wrap:wrap; gap:6px; }
button { border:1px solid rgba(128,128,128,.3); border-radius:999px; background:transparent; color:inherit; font:600 12px/1.3 system-ui,sans-serif; padding:7px 10px; cursor:pointer; }
button:hover { background:rgba(128,128,128,.12); }
button:active { background:rgba(128,128,128,.22); }
button:focus-visible { outline:2px solid #1d9bf0; outline-offset:2px; }
.sr-only { position:absolute; width:1px; height:1px; padding:0; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
@media (prefers-color-scheme:dark) { #cue { background:var(--body-bg-color,#171c22); color:var(--main-text-color,#e7e9ea); } #details { color:var(--secondary-text-color,#a3abb4); } }
@media (prefers-reduced-motion:reduce) { #edge { animation:none !important; transition:none; } }
@media (prefers-reduced-transparency:reduce) { #edge { box-shadow:none !important; border:2px solid transparent; } :host([data-phase="near"]) #edge { border-color:#b87900; } :host([data-phase="limit"]) #edge { border-color:#d63224; } :host([data-phase="recovery"]) #edge { border-color:#198b58; } }
`;

const context = () => {
  const column = document.querySelector(selectors.mainColumn);
  const active = document.activeElement;
  const composing = active?.matches('input,textarea,[contenteditable="true"],[role="textbox"]') ||
    active?.closest('[contenteditable="true"],[data-testid^="tweetTextarea_"]') ||
    document.querySelector('[role="dialog"] [data-testid^="tweetTextarea_"]') || document.getElementById("mt-style-writerMode") || /^\/compose(?:\/|$)/.test(location.pathname);
  const fullscreen = document.fullscreenElement || [...document.querySelectorAll("video")].some((video) => video.webkitDisplayingFullscreen);
  const feed = column?.querySelector(selectors.tweet) && !/^\/(?:messages|i\/chat|settings)(?:\/|$)/.test(location.pathname);
  return { column, allowed: !!(feed && !composing && !fullscreen && document.visibilityState === "visible") };
};

class MindfulScrollingController {
  constructor(minutes, intensity) {
    this.session = new MindfulScrollSession({ minutes });
    this.intensity = intensity;
    this.intentAt = -Infinity;
    this.position = window.scrollY;
    this.host = document.createElement("div");
    this.host.id = "mt-mindful-scrolling";
    this.host.hidden = true;
    this.host.dataset.intensity = intensity;
    const root = this.host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${styles}</style><div id="edge" aria-hidden="true"></div>
      <section id="cue" aria-label="Mindful scrolling" hidden>
        <p id="message"></p><p id="details"></p><div id="actions">
          <button type="button" id="break">Take a break</button><button type="button" id="snooze">Snooze 5 min</button>
        </div>
      </section><div id="announcement" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>`;
    this.root = root;
    this.listen = [];
    const addListener = (target, name, handler, options) => {
      target.addEventListener(name, handler, options);
      this.listen.push(() => target.removeEventListener(name, handler, options));
    };
    const intent = (event) => {
      const state = context();
      if (!event.isTrusted || !state.allowed) return;
      if (event.type === "keydown" && !["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) return;
      const column = state.column;
      if (event.type !== "keydown" && event.target instanceof Element && !column?.contains(event.target)) return;
      this.intentAt = performance.now();
    };
    addListener(document, "wheel", intent, { passive: true, capture: true });
    addListener(document, "touchmove", intent, { passive: true, capture: true });
    addListener(document, "keydown", intent, true);
    addListener(document, "scroll", (event) => {
      const now = performance.now();
      const state = context();
      const target = event.target;
      const isDocument = target === document || target === document.documentElement || target === document.body;
      if (!isDocument && (!(target instanceof Element) || !state.column?.contains(target))) return;
      const position = isDocument ? window.scrollY : target.scrollTop;
      if (position !== this.position && now - this.intentAt <= 1500) this.session.recordScroll(now, state.allowed);
      this.position = position;
      this.refresh();
    }, { passive: true, capture: true });
    for (const name of ["visibilitychange", "fullscreenchange", "focusin", "focusout"]) addListener(document, name, () => this.refresh(), true);
    addListener(window, "pagehide", () => this.stop(), { once: true });
    root.getElementById("break").onclick = () => {
      if (this.session.takingBreak) this.session.reset(performance.now());
      else this.session.takeBreak(performance.now());
      this.refresh();
    };
    root.getElementById("snooze").onclick = () => {
      this.session.snooze(performance.now());
      this.refresh();
    };
    document.body.appendChild(this.host);
    this.timer = setInterval(() => this.refresh(), 1000);
    this.refresh();
  }

  refresh() {
    if (!this.host.isConnected && document.body) document.body.appendChild(this.host);
    const state = context();
    const snapshot = this.session.advance(performance.now(), state.allowed);
    this.host.hidden = !state.allowed;
    this.host.dataset.phase = snapshot.phase;
    this.host.dataset.intensity = this.intensity;
    const cue = this.root.getElementById("cue");
    const show = ["near", "limit", "recovery", "break"].includes(snapshot.phase);
    cue.hidden = !show;
    if (!show) return;
    const message = snapshot.takingBreak ? "Scrolling reminder paused" : snapshot.phase === "recovery" ? "A fresh start" :
      snapshot.phase === "near" ? "Close to your scrolling limit" : "Your scrolling limit is reached";
    const seconds = Math.floor(snapshot.elapsedMs / 1000);
    const elapsed = seconds < 60 ? `${seconds} sec` : `${Math.floor(seconds / 60)} min ${seconds % 60} sec`;
    const details = snapshot.takingBreak ? "Resume when you are ready. Your session is reset." : snapshot.phase === "recovery" ? "Your scrolling session is reset." :
      `${elapsed} of ${snapshot.limitMs / 60000} min active scrolling.`;
    for (const [id, text] of [["message", message], ["details", details]]) {
      if (this.root.getElementById(id).textContent !== text) this.root.getElementById(id).textContent = text;
    }
    this.root.getElementById("break").textContent = snapshot.takingBreak ? "Resume" : "Take a break";
    this.root.getElementById("snooze").hidden = snapshot.takingBreak || snapshot.phase === "recovery";
    if (this.announced !== message) {
      this.root.getElementById("announcement").textContent = message;
      this.announced = message;
    }
    // Keep the cue clear of native navigation, search and composer controls.
    cue.style.top = "72px";
    cue.style.bottom = "auto";
    const obstacles = [...document.querySelectorAll(`${selectors.leftSidebar}, form[role="search"], [data-testid^="tweetTextarea_"], [data-testid="SideNav_NewTweet_Button"], [data-testid="tweetButtonInline"], [data-testid="DMDrawer"]`)];
    const overlaps = () => {
      const box = cue.getBoundingClientRect();
      return obstacles.some((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width && rect.height && rect.left < box.right && rect.right > box.left && rect.top < box.bottom && rect.bottom > box.top;
      });
    };
    if (overlaps()) { cue.style.top = "auto"; cue.style.bottom = "16px"; }
    if (overlaps()) cue.hidden = true;
  }

  stop() {
    clearInterval(this.timer);
    this.listen.splice(0).forEach((remove) => remove());
    this.root.getElementById("break").onclick = null;
    this.root.getElementById("snooze").onclick = null;
    this.host.remove();
  }
}

export const changeMindfulScrolling = (data) => {
  if (data?.[KeyMindfulScrolling] !== "on") {
    controller?.stop();
    controller = undefined;
    return;
  }
  const minutes = normalizeScrollMinutes(data[KeyScrollLimitMinutes]);
  const intensity = data[KeyScrollReminderIntensity] === "clear" ? "clear" : "gentle";
  if (!controller || !controller.host.isConnected) {
    controller?.stop();
    controller = new MindfulScrollingController(minutes, intensity);
  }
  else {
    controller.session.setMinutes(minutes);
    controller.intensity = intensity;
    controller.refresh();
  }
};

export const refreshMindfulScrolling = () => controller?.refresh();
