// Builds the image that the AI slop action posts as a reply.
// captureElement rebuilds a post from its live DOM, so the extension needs no screen-capture permission.
// frameAiSlopScreenshot draws only the frame around that capture.

export const AI_SLOP_CARD_TITLE = "AI slop spam reported!";
export const AI_SLOP_CARD_SOURCE = "zen.quasa0.com";

const FRAME = 16;
const HEADER = 60;
const FOOTER = 48;
const RADIUS = 16;
const ICON_SIZE = 22;
const ICON_VIEW_BOX = 24.5;
const ICON_GAP = 10;
const FONT_STACK = 'TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const INK = "rgb(10, 10, 10)";
const PAPER = "rgb(255, 255, 255)";
const MUTED = "rgb(161, 161, 161)";
const HAIRLINE = "rgba(255, 255, 255, 0.14)";
const ALERT = "rgb(244, 33, 46)";

const CAPTURE_SCALE = 2;
const MAX_PNG_BYTES = 4.5 * 1024 * 1024;
const RESOURCE_TIMEOUT_MS = 6000;
const RESOURCE_CACHE_LIMIT = 200;
const SKIPPED_PROPERTY = /^(?:transition|animation)/;
const CSS_URL = /url\("([^"]+)"\)/g;
const INVALID_XML_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
const resourceCache = new Map();

// An SVG image cannot load external files. Every image and font must be a data URL.
const toDataUrl = (url) => {
  if (!url) return Promise.resolve(null);
  if (url.startsWith("data:")) return Promise.resolve(url);
  if (resourceCache.has(url)) return resourceCache.get(url);
  if (resourceCache.size >= RESOURCE_CACHE_LIMIT) resourceCache.clear();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOURCE_TIMEOUT_MS);
  const request = fetch(url, { credentials: "omit", signal: controller.signal })
    .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(`HTTP ${response.status}`))))
    .then((blob) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    }))
    .catch(() => { resourceCache.delete(url); return null; })
    .finally(() => clearTimeout(timer));
  resourceCache.set(url, request);
  return request;
};

const stripQuotes = (value) => (value || "").trim().replace(/^["']|["']$/g, "");
const normalizeWeight = (value) => ({ normal: "400", bold: "700" }[stripQuotes(value)] || stripQuotes(value) || "400");
const fontKey = (family, weight, style) => `${stripQuotes(family).toLowerCase()}|${normalizeWeight(weight)}|${stripQuotes(style) || "normal"}`;

// Embeds the loaded web fonts that the captured post uses. A missing font falls back to a system font.
const collectFontCss = async (families) => {
  const loaded = new Set();
  document.fonts?.forEach((face) => { if (face.status === "loaded") loaded.add(fontKey(face.family, face.weight, face.style)); });

  const faces = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of Array.from(rules)) {
      if (rule.constructor.name !== "CSSFontFaceRule") continue;
      const family = stripQuotes(rule.style.getPropertyValue("font-family"));
      const weight = rule.style.getPropertyValue("font-weight");
      const style = rule.style.getPropertyValue("font-style");
      if (!families.has(family.toLowerCase()) || !loaded.has(fontKey(family, weight, style))) continue;

      const sources = Array.from(rule.style.getPropertyValue("src").matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)(?:\s*format\(\s*["']?([^"')]+)["']?\s*\))?/g));
      const source = sources.find((match) => match[2] === "woff2") || sources[0];
      if (!source) continue;
      let url;
      try { url = new URL(source[1], sheet.href || location.href).href; } catch { continue; }
      faces.push({ family, weight: normalizeWeight(weight), style: stripQuotes(style) || "normal", range: rule.style.getPropertyValue("unicode-range"), url });
    }
  }

  const css = await Promise.all(faces.map(async (face) => {
    const data = await toDataUrl(face.url);
    return data ? `@font-face{font-family:"${face.family}";font-weight:${face.weight};font-style:${face.style};${face.range ? `unicode-range:${face.range};` : ""}src:url("${data}")}` : "";
  }));
  return css.join("");
};

// Copies resolved styles from the live tree to the clone. The clone then needs no page stylesheet.
const inlineTree = (source, target, state) => {
  const computed = getComputedStyle(source);
  let style = "";
  for (const property of computed) {
    if (!SKIPPED_PROPERTY.test(property)) style += `${property}:${computed.getPropertyValue(property)};`;
  }
  target.setAttribute("style", style);
  computed.fontFamily.split(",").forEach((family) => state.families.add(stripQuotes(family).toLowerCase()));

  const background = computed.backgroundImage;
  if (background.includes("url(")) {
    state.tasks.push((async () => {
      const urls = Array.from(background.matchAll(CSS_URL), (match) => match[1]);
      const data = await Promise.all(urls.map(toDataUrl));
      target.style.backgroundImage = data.every(Boolean) ? background.replace(CSS_URL, () => `url("${data.shift()}")`) : "none";
    })());
  }

  const tag = source.localName;
  if (tag === "img") {
    target.removeAttribute("srcset");
    target.removeAttribute("loading");
    state.tasks.push(toDataUrl(source.currentSrc || source.src).then((data) => {
      if (data) target.setAttribute("src", data);
      else target.removeAttribute("src");
    }));
  } else if (tag === "video") {
    // A video frame cannot be embedded. Its poster keeps the layout and the preview.
    const poster = document.createElement("img");
    poster.setAttribute("style", `${style}object-fit:cover;`);
    target.replaceWith(poster);
    state.tasks.push(toDataUrl(source.poster).then((data) => { if (data) poster.setAttribute("src", data); }));
    return;
  }

  const sourceChildren = source.children;
  const targetChildren = Array.from(target.children);
  for (let index = 0; index < sourceChildren.length; index++) {
    if (targetChildren[index]) inlineTree(sourceChildren[index], targetChildren[index], state);
  }
};

// Returns a canvas of the element at CAPTURE_SCALE device pixels per CSS pixel.
export const captureElement = async (element, { hideSelector } = {}) => {
  const rect = element.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (!width || !height) throw new Error("The post has no visible area to capture");

  const clone = element.cloneNode(true);
  const state = { tasks: [], families: new Set() };
  inlineTree(element, clone, state);
  clone.style.margin = "0";
  if (hideSelector) clone.querySelectorAll(hideSelector).forEach((owned) => owned.style.setProperty("visibility", "hidden"));
  const [fontCss] = await Promise.all([collectFontCss(state.families), ...state.tasks]);

  const background = [document.body, document.documentElement].map((root) => getComputedStyle(root).backgroundColor).find((color) => color && color !== "transparent" && !/,\s*0\)$/.test(color)) || PAPER;
  const markup = new XMLSerializer().serializeToString(clone).replace(INVALID_XML_CHARACTERS, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden;background:${background}"><style>${fontCss}</style>${markup}</div></foreignObject></svg>`;

  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = width * CAPTURE_SCALE;
  canvas.height = height * CAPTURE_SCALE;
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
};

const font = (size, weight = 400) => `${weight} ${size}px ${FONT_STACK}`;

// screenshot: a canvas image source in device pixels. scale: device pixels per CSS pixel of that capture.
export const frameAiSlopScreenshot = (screenshot, { scale = CAPTURE_SCALE, iconPaths = [] } = {}) => {
  const sourceWidth = screenshot.naturalWidth || screenshot.width;
  const sourceHeight = screenshot.naturalHeight || screenshot.height;
  if (!sourceWidth || !sourceHeight) throw new Error("The AI Slop screenshot is empty");

  const postWidth = sourceWidth / scale;
  const postHeight = sourceHeight / scale;
  const width = postWidth + FRAME * 2;
  const height = HEADER + postHeight + FOOTER;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, width, height);

  ctx.font = font(20, 800);
  const iconWidth = iconPaths.length ? ICON_SIZE + ICON_GAP : 0;
  const titleLeft = (width - ctx.measureText(AI_SLOP_CARD_TITLE).width - iconWidth) / 2;
  if (iconPaths.length) {
    ctx.save();
    ctx.translate(titleLeft, (HEADER - ICON_SIZE) / 2);
    ctx.scale(ICON_SIZE / ICON_VIEW_BOX, ICON_SIZE / ICON_VIEW_BOX);
    ctx.fillStyle = ALERT;
    iconPaths.forEach((path) => ctx.fill(new Path2D(path), "evenodd"));
    ctx.restore();
  }
  ctx.fillStyle = PAPER;
  ctx.fillText(AI_SLOP_CARD_TITLE, titleLeft + iconWidth, HEADER / 2 + 7);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(FRAME, HEADER, postWidth, postHeight, RADIUS);
  ctx.clip();
  ctx.drawImage(screenshot, FRAME, HEADER, postWidth, postHeight);
  ctx.restore();
  // A hairline keeps a dark-theme capture distinct from the frame.
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(FRAME + 0.5, HEADER + 0.5, postWidth - 1, postHeight - 1, RADIUS);
  ctx.stroke();

  const prefix = "via ";
  ctx.font = font(14);
  const prefixWidth = ctx.measureText(prefix).width;
  ctx.font = font(14, 600);
  const footerLeft = (width - prefixWidth - ctx.measureText(AI_SLOP_CARD_SOURCE).width) / 2;
  const baseline = height - FOOTER / 2 + 5;
  ctx.fillStyle = PAPER;
  ctx.fillText(AI_SLOP_CARD_SOURCE, footerLeft + prefixWidth, baseline);
  ctx.font = font(14);
  ctx.fillStyle = MUTED;
  ctx.fillText(prefix, footerLeft, baseline);

  return canvas;
};

// X rejects images above 5 MB. A tall post with photos can exceed that as PNG, so it falls back to JPEG.
export const canvasToImageBlob = async (canvas, maxBytes = MAX_PNG_BYTES) => {
  const encode = (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  let blob = await encode("image/png");
  if (blob && blob.size > maxBytes) blob = await encode("image/jpeg", 0.9);
  if (!blob) throw new Error("Could not encode the AI Slop image");
  return blob;
};
