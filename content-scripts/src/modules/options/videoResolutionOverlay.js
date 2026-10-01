import addStyles, { removeStyles, stylesExist } from "../utilities/addStyles";

const OVERLAY_CLASS = "mt-videoResolutionOverlay";
const CONTAINER_CLASS = "mt-videoResolutionOverlay-container";
const LISTENER_FLAG = "mtVideoResolutionOverlayListener";

let videoResolutionOverlayEnabled = false;

function greatestCommonDivisor(a, b) {
  while (b) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }

  return a;
}

function formatRatioSide(value) {
  return Number(value.toFixed(2)).toString();
}

function getAspectRatio(width, height) {
  const divisor = greatestCommonDivisor(width, height);
  let ratioWidth = width / divisor;
  let ratioHeight = height / divisor;

  if (ratioWidth > 30 && ratioWidth >= ratioHeight) {
    ratioHeight = (height / width) * 16;
    ratioWidth = 16;
  }

  while (Math.max(ratioWidth, ratioHeight) > 30) {
    ratioWidth = ratioWidth / 10;
    ratioHeight = ratioHeight / 10;
  }

  return `${formatRatioSide(ratioWidth)}:${formatRatioSide(ratioHeight)}`;
}

function getVideoContainer(video) {
  return video.closest("[data-testid='videoPlayer']") || video.parentElement;
}

function removeOverlay(video) {
  const container = getVideoContainer(video);
  container?.querySelector(`:scope > .${OVERLAY_CLASS}`)?.remove();
  container?.classList.remove(CONTAINER_CLASS);
}

function updateOverlay(video) {
  if (!videoResolutionOverlayEnabled) {
    removeOverlay(video);
    return;
  }

  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!width || !height) {
    removeOverlay(video);
    return;
  }

  const container = getVideoContainer(video);
  if (!container) return;

  container.classList.add(CONTAINER_CLASS);

  let overlay = container.querySelector(`:scope > .${OVERLAY_CLASS}`);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = OVERLAY_CLASS;
    container.appendChild(overlay);
  }

  overlay.textContent = `${width}x${height} · ${getAspectRatio(width, height)}`;
}

function addVideoListeners(video) {
  if (video.dataset[LISTENER_FLAG]) return;

  video.dataset[LISTENER_FLAG] = "true";
  video.addEventListener("loadedmetadata", () => updateOverlay(video));
  video.addEventListener("resize", () => updateOverlay(video));
}

function removeAllOverlays() {
  document.querySelectorAll(`.${OVERLAY_CLASS}`).forEach((overlay) => overlay.remove());
  document.querySelectorAll(`.${CONTAINER_CLASS}`).forEach((container) => container.classList.remove(CONTAINER_CLASS));
}

export function changeVideoResolutionOverlay(setting) {
  if (setting !== "on" && setting !== "off") return;

  videoResolutionOverlayEnabled = setting === "on";

  if (!videoResolutionOverlayEnabled) {
    removeStyles("videoResolutionOverlay");
    removeAllOverlays();
    return;
  }

  if (!stylesExist("videoResolutionOverlay")) {
    addStyles(
      "videoResolutionOverlay",
      `
      .${CONTAINER_CLASS} {
        position: relative !important;
      }

      .${OVERLAY_CLASS} {
        position: absolute;
        top: 6px;
        right: 6px;
        z-index: 2147483647;
        padding: 1px 4px;
        border-radius: 3px;
        background: rgb(0 0 0 / 50%);
        color: white;
        font: 500 10px/14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        opacity: 0.5;
        pointer-events: none;
        user-select: none;
        white-space: nowrap;
      }
      `
    );
  }

  document.querySelectorAll("video").forEach((video) => {
    addVideoListeners(video);
    updateOverlay(video);
  });
}
