import assert from "node:assert/strict";
import { watch } from "node:fs";
import { mkdir, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import { Browser } from "./browser.js";
import { build, bundlePath, cache, root } from "./build.js";
import { allSettingsKeys } from "../../storage-keys.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    browser: { type: "string", default: "helium" },
    url: { type: "string" },
    headless: { type: "boolean" },
    headed: { type: "boolean" },
    force: { type: "boolean" },
    fixture: { type: "boolean" },
    settings: { type: "string" },
    "eval-file": { type: "string" },
    help: { type: "boolean" },
  },
});
const command = positionals[0] || "test";
values.url ??= command === "login" ? "https://x.com/i/flow/login" : "https://x.com/home";
if (values.help) {
  console.log("Usage: node scripts/extension-dev/index.js <test|dev|inspect|login> [--browser helium|chrome] [--url https://x.com/...] [--headless|--headed] [--fixture] [--force] [--settings file.json] [--eval-file file.js]");
  process.exit(0);
}
if (!["test", "dev", "inspect", "login"].includes(command)) throw new Error(`Unknown command: ${command}`);
if (!["helium", "chrome"].includes(values.browser)) throw new Error(`Unknown browser: ${values.browser}`);
if (new URL(values.url).origin !== "https://x.com") throw new Error("Live inspection URLs must use https://x.com");
if (command === "login" && values.headless) throw new Error("Login requires a visible browser window. Remove --headless.");

let browser, popup, page, testProfile, lock, revision, stopping = false;
const watchers = [];
const artifacts = join(cache, "artifacts", `${new Date().toISOString().replace(/[:.]/g, "-")}-${values.browser}-${process.pid}`);
const lockPath = join(cache, "session.lock");
const abort = new AbortController();
const stopped = new Promise((resolve) => {
  const stop = () => { stopping = true; abort.abort(); if (command === "test" || command === "inspect") process.exitCode = 130; resolve(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
});

async function acquireLock() {
  await mkdir(cache, { recursive: true });
  try { lock = await open(lockPath, "wx", 0o600); } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const pid = Number(await readFile(lockPath, "utf8"));
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error(`Invalid session lock: ${lockPath}`);
    let running = true;
    try { process.kill(pid, 0); } catch (error) { if (error.code === "ESRCH") running = false; else throw error; }
    if (running) throw new Error(`Extension development session ${pid} is active. Stop it before starting another session.`);
    await rm(lockPath);
    lock = await open(lockPath, "wx", 0o600);
  }
  await lock.writeFile(String(process.pid));
}

async function storage(data) {
  await popup.send("Extensions.setStorageItems", { id: browser.extensionId, storageArea: "local", values: data });
}

async function installedPopup(info) {
  if (popup) await popup.close();
  popup = await browser.page(`chrome-extension://${browser.extensionId}/index.html`);
  await popup.wait("document.body.innerText.includes('Timeline')");
  const actualHash = await popup.evaluate(`(async () => {
    const response = await fetch(chrome.runtime.getURL('dist/main.js'));
    if (!response.ok) throw new Error('Content bundle fetch failed');
    const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
    return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
  })()`);
  assert.equal(actualHash, info.contentSha256, "Browser must serve the completed build");
}

async function reload(info) {
  const { id } = await browser.send("Extensions.loadUnpacked", { path: bundlePath });
  if (browser.extensionId) assert.equal(id, browser.extensionId, "Extension ID changed during reload");
  browser.extensionId = id;
  await installedPopup(info);
  // Fresh navigation destroys the previous document and its stale content-script observers.
  if (page) { await page.navigate("about:blank"); await page.navigate(values.url); }
  revision = info;
}

async function useFixture(target) {
  const html = await readFile(join(root, "scripts/extension-dev/fixtures/timeline.html"));
  const listener = (event) => {
    if (event.sessionId !== target.sessionId || event.method !== "Fetch.requestPaused") return;
    const { requestId, resourceType } = event.params;
    const response = resourceType === "Document"
      ? target.send("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "text/html; charset=utf-8" }], body: html.toString("base64") })
      : target.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
    response.catch((error) => { if (!browser.closing) target.errors.push({ text: error.message }); });
  };
  browser.on("event", listener);
  await target.send("Fetch.enable", { patterns: [{ urlPattern: "https://x.com/*" }] });
}

async function receipt() {
  await page.wait(`document.documentElement.dataset.zenDevBuild === ${JSON.stringify(revision.revision)}`);
  await page.wait(`(() => {
    const link = document.getElementById('mt-main-stylesheet');
    return link && link.href.startsWith('chrome-extension://${browser.extensionId}/') && link.sheet &&
      document.getElementById('mt-style-timelineWidth');
  })()`);
}

async function capture(label) {
  const metrics = await page.evaluate(`(() => {
    const visible = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return !!(r.width && r.height && s.display !== 'none' && s.visibility !== 'hidden'); };
    const rect = e => { const r = e.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
    const column = document.querySelector('[data-testid="primaryColumn"]');
    const posts = [...document.querySelectorAll('[data-testid="tweet"]')];
    return {
      url: location.href, title: document.title, build: document.documentElement.dataset.zenDevBuild,
      loginRequired: !!document.querySelector('input[autocomplete="username"]') || location.pathname.includes('/i/flow/login'),
      authenticated: !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"], [data-testid="AppTabBar_Profile_Link"]'),
      primaryColumn: column && rect(column), postCount: posts.length,
      posts: posts.slice(0, 50).map(e => ({id:e.id, visible:visible(e),rect:rect(e),text:e.innerText.slice(0,300)})),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      extensionStyles: [...document.querySelectorAll('[id^="mt-"]')].map(e => e.id),
      links: [...document.querySelectorAll('nav a')].map(e => ({label:e.getAttribute('aria-label'),href:e.getAttribute('href'),rect:rect(e)}))
    };
  })()`);
  await page.screenshot(join(artifacts, `${label}.png`));
  await writeFile(join(artifacts, `${label}.html`), await page.evaluate("document.documentElement.outerHTML"), { mode: 0o600 });
  await writeFile(join(artifacts, `${label}.json`), JSON.stringify({ ...metrics, errors: page.errors, console: page.console, network: page.network }, null, 2), { mode: 0o600 });
  return metrics;
}

const visible = (id) => `(() => { const e = document.getElementById(${JSON.stringify(id)}); if (!e) return false; const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'; })()`;

async function test() {
  const checks = [];
  const check = async (name, fn) => { await fn(); checks.push(name); console.log(`PASS ${name}`); };
  await check("real popup and completed bundle load", async () => {
    assert.equal(await popup.evaluate("document.body.innerText.includes('Video Resolution Overlay')"), true);
  });
  await check("manifest content script runs in X fixture", receipt);
  await check("default width and ad removal preserve organic content", async () => {
    await page.wait("getComputedStyle(document.querySelector('[data-testid=primaryColumn]')).width === '700px'");
    assert.equal(await page.evaluate(visible("organic-post")), true);
    assert.equal(await page.evaluate(visible("organic-video")), true);
    assert.equal(await page.evaluate(visible("promoted-post")), false);
  });
  await check("real storage changes update content scripts", async () => {
    await storage({ timelineWidth: 800, removePromotedPosts: "off" });
    await page.wait("getComputedStyle(document.querySelector('[data-testid=primaryColumn]')).width === '800px'");
    await page.wait(visible("promoted-post"));
    await storage({ removePromotedPosts: "on" });
    await page.wait(`!${visible("promoted-post")}`);
  });
  await check("popup control updates storage and visible ad state", async () => {
    await popup.wait("document.getElementById('removePromotedPosts')?.getAttribute('aria-checked') === 'true'");
    await popup.evaluate("document.getElementById('removePromotedPosts').click()");
    await page.wait(visible("promoted-post"));
    const { data } = await popup.send("Extensions.getStorageItems", { id: browser.extensionId, storageArea: "local", keys: ["removePromotedPosts"] });
    assert.equal(data.removePromotedPosts, "off");
    await popup.evaluate("document.getElementById('removePromotedPosts').click()");
    await page.wait(`!${visible("promoted-post")}`);
  });
  await check("mutation handling hides late suggestions and preserves organic posts", async () => {
    await page.evaluate("document.getElementById('add-post').click()");
    await page.wait(visible("late-organic"));
    await page.wait("document.getElementById('late-suggestions')?.classList.contains('mt-whoToFollow')");
    assert.equal(await page.evaluate(visible("late-suggestions")), false);
  });
  await capture("fixture-before-reload");
  await check("new build reload preserves settings and refreshes host page", async () => {
    const previous = revision.revision;
    const info = await build({ signal: abort.signal });
    assert.notEqual(info.revision, previous);
    await reload(info);
    await receipt();
    const { data } = await popup.send("Extensions.getStorageItems", { id: browser.extensionId, storageArea: "local", keys: ["timelineWidth", "removePromotedPosts"] });
    assert.equal(data.timelineWidth, 800);
    assert.equal(data.removePromotedPosts, "on");
    await page.wait("getComputedStyle(document.querySelector('[data-testid=primaryColumn]')).width === '800px'");
    assert.equal(await page.evaluate("document.querySelectorAll('#mt-main-stylesheet').length"), 1);
    assert.equal(await page.evaluate(visible("promoted-post")), false);
  });
  await capture("fixture-after-reload");
  await check("uninstall and reinstall produce a fresh extension", async () => {
    await popup.close(); popup = undefined;
    const id = browser.extensionId;
    await browser.send("Extensions.uninstall", { id });
    const { extensions } = await browser.send("Extensions.getExtensions");
    assert.equal(extensions.some((extension) => extension.id === id), false);
    await reload(revision);
    await receipt();
    await page.wait("getComputedStyle(document.querySelector('[data-testid=primaryColumn]')).width === '700px'");
  });
  await check("fixture has no uncaught runtime errors", async () => {
    const runtimeErrors = [...page.errors, ...popup.errors].filter((error) => error.exception || error.exceptionId);
    assert.deepEqual(runtimeErrors, []);
  });
  await writeFile(join(artifacts, "report.json"), JSON.stringify({ passed: true, browser: browser.version, build: revision, checks }, null, 2));
}

async function inspect() {
  // A disabled document provides a clean baseline, with no residual extension markup.
  const current = await popup.send("Extensions.getStorageItems", { id: browser.extensionId, storageArea: "local", keys: ["extensionStatus"] });
  try {
    await page.navigate("about:blank");
    await storage({ extensionStatus: "off" });
    await page.navigate(values.url);
    await page.wait("!!document.querySelector('[data-testid=primaryColumn],input[autocomplete=username],a[href*=login],main')", 30000);
    await capture("baseline");
    await page.navigate("about:blank");
    await storage({ extensionStatus: "on" });
    await page.navigate(values.url);
    await receipt();
    await page.wait("!!document.querySelector('[data-testid=primaryColumn],input[autocomplete=username],a[href*=login],main')", 30000);
    if (values["eval-file"]) {
      const result = await page.evaluate(await readFile(resolve(values["eval-file"]), "utf8"));
      await writeFile(join(artifacts, "evaluation.json"), JSON.stringify({ result }, null, 2), { mode: 0o600 });
    }
    if (!values.fixture) await page.wait("!!document.querySelector('[data-testid=SideNav_AccountSwitcher_Button],[data-testid=AppTabBar_Profile_Link],input[autocomplete=username],a[href*=login]') || location.pathname.includes('/i/flow/login')", 30000);
    const metrics = await capture("extension");
    const passed = values.fixture || metrics.authenticated && !metrics.loginRequired;
    await writeFile(join(artifacts, "report.json"), JSON.stringify({ captureComplete: passed, browser: browser.version, build: revision, metrics }, null, 2), { mode: 0o600 });
    if (!values.fixture && !passed) throw new Error("Live X inspection lacks an authenticated timeline. Sign in once with yarn login:extension, then rerun.");
  } finally {
    await page.navigate("about:blank");
    if (Object.hasOwn(current.data, "extensionStatus")) await storage({ extensionStatus: current.data.extensionStatus });
    else await popup.send("Extensions.removeStorageItems", { id: browser.extensionId, storageArea: "local", keys: ["extensionStatus"] });
  }
}

async function dev() {
  let queued = false, active = false, timer;
  const refresh = async () => {
    if (active) { queued = true; return; }
    active = true;
    do {
      queued = false;
      try {
        await reload(await build({ signal: abort.signal }));
        await receipt();
        await capture("latest");
        console.log(`Reload verified: ${revision.revision}`);
      } catch (error) { if (!stopping) console.error(`Build/reload failed: ${error.message}`); }
    } while (queued && !stopping);
    active = false;
  };
  const onChange = (_event, filename) => {
    if (!filename || String(filename).split(/[\\/]/).some((part) => ["node_modules", ".next", "out", "dist", ".DS_Store"].includes(part))) return;
    clearTimeout(timer);
    timer = setTimeout(refresh, 300);
  };
  for (const directory of ["content-scripts", "popup", "css", "fonts", "images"]) watchers.push(watch(join(root, directory), { recursive: true }, onChange));
  watchers.push(watch(root, (_event, filename) => {
    if (["storage-keys.js", "extension-manifests.js", "background.js"].includes(String(filename))) onChange(_event, filename);
  }));
  console.log(`Watching source files. PID ${process.pid}. Stop with Ctrl+C or kill -TERM ${process.pid}.`);
  await Promise.race([stopped, browser.exited]);
  stopping = true; abort.abort(); clearTimeout(timer);
  for (const watcher of watchers) watcher.close();
  while (active) await new Promise((resolve) => setTimeout(resolve, 100));
}

try {
  await acquireLock();
  await mkdir(artifacts, { recursive: true, mode: 0o700 });
  if (stopping) throw new Error("Stopped before browser launch");
  if (command === "login") {
    browser = await Browser.launch({
      browser: values.browser,
      profile: join(cache, "profiles", values.browser),
      headless: false,
      automation: false,
      url: values.url,
      logPath: join(artifacts, "browser.log"),
    });
    console.log("Sign in to X in this dedicated browser window. Quit this dedicated browser or press Ctrl+C when finished. Later dev and inspect sessions reuse this profile.");
    await Promise.race([stopped, browser.exited]);
    if (!stopping && browser.process.exitCode !== 0) throw new Error(`Login browser exited with ${browser.process.signalCode || browser.process.exitCode}. See ${join(artifacts, "browser.log")}`);
  } else {
    const info = await build({ force: values.force, signal: abort.signal });
    if (stopping) throw new Error("Stopped before browser launch");
    if (command === "test") testProfile = await mkdtemp(join(tmpdir(), "zen-extension-test-"));
    browser = await Browser.launch({
      browser: values.browser,
      profile: testProfile || join(cache, "profiles", values.browser),
      headless: values.headed ? false : values.headless || command === "test",
      logPath: join(artifacts, "browser.log"),
    });
    console.log(`Browser: ${browser.version.product}`);
    await reload(info);
    if (values.settings) {
      const data = JSON.parse(await readFile(resolve(values.settings), "utf8"));
      if (!data || Array.isArray(data) || typeof data !== "object" || Object.keys(data).some((key) => !allSettingsKeys.includes(key))) throw new Error("Settings must be an object containing registered extension keys");
      await storage(data);
    }
    page = await browser.page();
    if (command === "test" || values.fixture) await useFixture(page);
    if (command !== "inspect") await page.navigate(values.url);
    if (command === "test") await test();
    if (command === "inspect") await inspect();
    if (command === "dev") { await receipt(); await capture("initial"); await dev(); }
  }
} catch (error) {
  if (!stopping) {
    console.error(error.stack);
    await mkdir(artifacts, { recursive: true, mode: 0o700 });
    await writeFile(join(artifacts, "failure-report.json"), JSON.stringify({ passed: false, error: error.message }, null, 2));
    if (page) await capture("failure").catch(() => {});
    process.exitCode = 1;
  }
} finally {
  for (const watcher of watchers) watcher.close();
  try { if (browser) await browser.close(); }
  finally {
    try { if (testProfile) await rm(testProfile, { recursive: true, force: true }); }
    finally { if (lock) { await lock.close(); await rm(lockPath, { force: true }); } }
  }
  console.log(`Artifacts: ${artifacts}`);
}
