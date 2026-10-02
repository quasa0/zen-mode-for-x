import { KeyRecentMedia } from "../../../../storage-keys";
import selectors from "../../selectors";
import addStyles, { removeStyles } from "../utilities/addStyles";
import { getStorage } from "../utilities/storage";

const PANEL_ID = "mt-profile-photos";
const PHOTO_PATH = /^\/([a-zA-Z0-9_]+)\/status\/(\d+)\/photo\/(\d+)\/?$/;
let profileKey;
let photos = new Map();
let renderSignature;
let runNumber = 0;
let observedColumn;
let photoObserver;

function clearRecentMedia() {
  document.getElementById(PANEL_ID)?.remove();
  removeStyles("recentMedia");
  profileKey = undefined;
  photos.clear();
  renderSignature = undefined;
  photoObserver?.disconnect();
  photoObserver = undefined;
  observedColumn = undefined;
}

function currentProfile(column) {
  const route = window.location.pathname.match(/^\/([a-zA-Z0-9_]+)(?:\/(?:with_replies|media))?\/?$/);
  if (!route || /^(?:home|explore|notifications|messages|settings|search|compose|i)$/i.test(route[1])) return;
  const header = [...column?.querySelectorAll('[data-testid="UserName"], [data-testid="UserProfileHeader_Items"]') || []]
    .find((element) => !element.closest(selectors.tweet));
  return header && route[1];
}

function collectPhotos(column, handle) {
  column.querySelectorAll('[data-testid="tweetPhoto"] img').forEach((image) => {
    const anchor = image.closest('a[href]');
    if (!anchor || image.closest('[data-testid="quoteTweet"], [data-testid="card.wrapper"], div[role="link"]')) return;
    const post = image.closest(selectors.tweet);
    if (post?.parentElement.closest(selectors.tweet)) return;
    const rect = image.getBoundingClientRect();
    if (!rect.width || !rect.height || getComputedStyle(image).visibility === "hidden") return;
    const href = anchor.getAttribute("href");
    let url;
    try { url = new URL(href, window.location.href); } catch { return; }
    const match = url.pathname.match(PHOTO_PATH);
    if (url.origin !== window.location.origin || !match || match[1].toLowerCase() !== handle.toLowerCase()) return;
    const src = image.getAttribute("src");
    if (!src) return;
    photos.set(url.href, { href, src, alt: image.getAttribute("alt") || "", status: match[2], index: Number(match[3]) });
  });
  // Snowflake IDs order native posts without depending on a translated timestamp.
  const latest = [...photos.entries()].sort(([, a], [, b]) => {
    const first = BigInt(a.status), second = BigInt(b.status);
    return first === second ? a.index - b.index : first > second ? -1 : 1;
  }).slice(0, 6);
  photos = new Map(latest);
}

function renderPanel(handle) {
  let panel = document.getElementById(PANEL_ID);
  if (!panel) {
    panel = document.createElement("aside");
    panel.id = PANEL_ID;
    panel.setAttribute("aria-label", "Profile photos");
    panel.hidden = true;
    document.body.appendChild(panel);
    renderSignature = undefined;
  }
  const signature = JSON.stringify([handle, [...photos.values()]]);
  if (signature !== renderSignature) {
    const heading = document.createElement("a");
    heading.className = "mt-profile-photos-heading";
    heading.href = `/${handle}/media`;
    heading.textContent = "Profile photos";
    const grid = document.createElement("div");
    grid.className = "mt-profile-photos-grid";
    photos.forEach(({ href, src, alt }) => {
      const anchor = document.createElement("a");
      anchor.href = href;
      const image = document.createElement("img");
      image.src = src;
      image.alt = alt;
      anchor.appendChild(image);
      grid.appendChild(anchor);
    });
    if (!photos.size) {
      const empty = document.createElement("p");
      empty.textContent = "Photos appear as you load posts.";
      grid.appendChild(empty);
    }
    panel.replaceChildren(heading, grid);
    renderSignature = signature;
  }
  return panel;
}

export const changeRecentMedia = async (setting) => {
  const currentRun = ++runNumber;
  const enabled = setting ?? await getStorage(KeyRecentMedia);
  if (currentRun !== runNumber) return;
  const column = document.querySelector(selectors.mainColumn);
  const handle = currentProfile(column);
  if (enabled !== "on" || !handle) {
    clearRecentMedia();
    return;
  }
  const key = handle.toLowerCase();
  if (key !== profileKey) {
    clearRecentMedia();
    profileKey = key;
  }
  collectPhotos(column, handle);
  if (column !== observedColumn) {
    photoObserver?.disconnect();
    observedColumn = column;
    // X can recycle just a native image URL/alt or its photo anchor without adding a post.
    photoObserver = new MutationObserver((records) => {
      if (records.some(({ target }) => target.matches('[data-testid="tweetPhoto"] img') ||
        (target.matches("a") && target.querySelector('[data-testid="tweetPhoto"] img')))) {
        void changeRecentMedia();
      }
    });
    photoObserver.observe(column, { attributes: true, attributeFilter: ["src", "alt", "href"], subtree: true });
  }
  const panel = renderPanel(handle);
  addStyles("recentMedia", `
    #${PANEL_ID} {
      position: fixed;
      top: 72px;
      right: 16px;
      box-sizing: border-box;
      max-height: calc(100dvh - 96px);
      overflow: auto;
      border: 1px solid var(--border-color, #ddd);
      border-radius: 16px;
      background: var(--body-bg-color, white);
      color: var(--main-text-color, #0f1419);
      font: 14px/1.4 system-ui, sans-serif;
    }
    #${PANEL_ID}[hidden] { display: none; }
    #${PANEL_ID} .mt-profile-photos-heading {
      display: block;
      padding: 12px;
      color: inherit;
      font: inherit;
      font-weight: 700;
      text-decoration: none;
    }
    #${PANEL_ID} .mt-profile-photos-heading:hover { text-decoration: underline; }
    #${PANEL_ID} .mt-profile-photos-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2px; }
    #${PANEL_ID} .mt-profile-photos-grid a { display: block; aspect-ratio: 1; overflow: hidden; }
    #${PANEL_ID} img { display: block; width: 100%; height: 100%; object-fit: cover; outline: 1px solid rgb(128 128 128 / 0.18); outline-offset: -1px; }
    #${PANEL_ID} p { grid-column: 1 / -1; margin: 0; padding: 0 12px 12px; font-size: 14px; }
    #${PANEL_ID} a:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
    @media (max-width: 1264px) { #${PANEL_ID} { display: none; } }
  `);
  const rect = column.getBoundingClientRect();
  const width = Math.floor(Math.min(300, window.innerWidth - rect.right - 32));
  panel.hidden = window.innerWidth < 1265 || !rect.width || width < 160;
  if (!panel.hidden && panel.style.width !== `${width}px`) panel.style.width = `${width}px`;
};
