import assert from "node:assert/strict";
import { watch } from "node:fs";
import { mkdir, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import { Browser } from "./browser.js";
import { build, bundlePath, cache, root } from "./build.js";
import { HomeFeedComparison } from "./feed-comparison.js";
import { writeComparison } from "./comparison.js";
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
let homeResponse, authenticationFailure, failureCaptureAttempted = false;
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

function resetPageNetwork() {
  page.network = [];
  homeResponse = undefined;
  authenticationFailure = undefined;
}

function inspectNetwork() {
  const responses = page.network.flatMap((response) => {
    if (response.type === "Preflight") return [];
    if (!response.url.startsWith("https://api.x.com/") && !response.url.startsWith("https://x.com/i/api/")) return [];
    const url = new URL(response.url);
    if (url.origin === "https://api.x.com") return [{ response, path: url.pathname }];
    if (url.origin === "https://x.com" && url.pathname.startsWith("/i/api/")) return [{ response, path: url.pathname.slice("/i/api".length) }];
    return [];
  });
  homeResponse ??= responses.find(({ response, path }) => response.status === 200 && /^\/graphql\/[^/]+\/Home(?:Latest)?Timeline$/.test(path))?.response;
  authenticationFailure ??= responses.find(({ response, path }) => response.status === 401 && /^\/(?:graphql\/[^/]+\/Home(?:Latest)?Timeline|1\.1\/account\/settings\.json|1\.1\/graphql\/viewer_context\.json)$/.test(path))?.response;
  return { homeResponse, authenticationFailure };
}

const inspectionStateExpression = `(() => {
  const visible = element => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return !!(rect.width && rect.height && style.display !== 'none' && style.visibility !== 'hidden');
  };
  const column = document.querySelector('[data-testid="primaryColumn"]');
  const loginRoute = /^\\/(?:i\\/flow\\/(?:login|signup)(?:\\/|$)|i\\/jf\\/onboarding(?:\\/|$)|login(?:\\/|$))/.test(location.pathname);
  const loginForm = [...document.querySelectorAll('input[autocomplete="username"], input[autocomplete="current-password"], input[type="password"]')].some(visible);
  return {
    url: location.href,
    loginRequired: loginRoute || loginForm,
    accountNavigation: !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"], [data-testid="AppTabBar_Profile_Link"]') && !!document.querySelector('header nav[role="navigation"]'),
    primaryColumn: visible(column),
    feedReady: !!column && [...column.querySelectorAll('[data-testid="tweet"], [data-testid="emptyState"], [data-testid="empty_state_header_text"]')].some(visible),
    readyState: document.readyState
  };
})()`;

function authenticationError(state, failure) {
  const reason = failure ? `Core X read returned HTTP 401: ${failure.url}` : `X requires authentication or onboarding at ${state.url}`;
  const error = new Error(`${reason}. Live feed inspection cannot continue. Use yarn login:extension to check this dedicated profile.`);
  error.inspectionState = state;
  error.authenticationFailure = failure;
  return error;
}

async function waitForInspectionReady() {
  if (values.fixture) {
    await page.wait("!!document.querySelector('[data-testid=primaryColumn]')", 30000);
    return;
  }
  const requiresHomeFeed = new URL(values.url).pathname === "/home";
  const deadline = Date.now() + 30000;
  let state;
  while (Date.now() < deadline) {
    if (stopping) throw new Error("Inspection stopped before the live feed was ready");
    state = await page.evaluate(inspectionStateExpression);
    const network = inspectNetwork();
    if (state.loginRequired || network.authenticationFailure) throw authenticationError(state, network.authenticationFailure);
    if (state.readyState === "complete" && state.accountNavigation && state.primaryColumn &&
        (!requiresHomeFeed || network.homeResponse && state.feedReady)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const error = new Error(`Live X inspection did not reach a ready authenticated page${requiresHomeFeed ? " with a successful Home feed response" : ""}. Last state: ${JSON.stringify(state)}`);
  error.inspectionState = state;
  throw error;
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
  if (page) { await page.navigate("about:blank"); resetPageNetwork(); await page.navigate(values.url); }
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

const captureExpression = (includeHtml) => `(() => {
    const visible = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return !!(r.width && r.height && s.display !== 'none' && s.visibility !== 'hidden'); };
    const rect = e => { const r = e.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
    const statusId = post => {
      const timestamp = [...post.querySelectorAll('a[href*="/status/"]')].find(link =>
        link.querySelector('time') && link.closest('[data-testid="tweet"]') === post &&
        !link.parentElement.closest('[data-testid="quoteTweet"], div[role="link"]'));
      return timestamp?.getAttribute('href')?.split('/status/')[1]?.split(/[/?#]/)[0] || null;
    };
    const column = document.querySelector('[data-testid="primaryColumn"]');
    const posts = [...document.querySelectorAll('[data-testid="tweet"]')];
    const search = document.querySelector('[data-testid="SearchBox_Search_Input"]');
    const searchForm = search?.closest('form[role="search"]');
    const state = ${inspectionStateExpression};
    const metrics = {
      url: location.href, title: document.title, build: document.documentElement.dataset.zenDevBuild,
      documentTimeOrigin: performance.timeOrigin,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      searchInput: search && { visible: visible(search), rect: rect(search) },
      searchBox: searchForm && { visible: visible(searchForm), focused: searchForm.matches(':focus-within'), rect: rect(searchForm) },
      loginRequired: state.loginRequired, accountNavigation: state.accountNavigation, feedReady: state.feedReady,
      primaryColumnVisible: state.primaryColumn,
      primaryColumn: column && rect(column), postCount: posts.length,
      posts: posts.slice(0, 50).map(e => ({id:e.id,statusId:statusId(e),visible:visible(e),rect:rect(e),text:e.innerText.slice(0,300)})),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      extensionStyles: [...document.querySelectorAll('[id^="mt-"]')].map(e => e.id),
      links: [...document.querySelectorAll('nav a')].map(e => ({label:e.getAttribute('aria-label'),href:e.getAttribute('href'),rect:rect(e)}))
    };
    return {
      metrics,
      html: ${includeHtml ? "document.documentElement.outerHTML" : "undefined"},
      signature: JSON.stringify({...metrics, bodyText: document.body?.innerText.slice(0, 1000)})
    };
  })()`;

async function capture(label) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const beforeFrame = (await page.send("Page.getFrameTree")).frameTree.frame;
      const snapshot = await page.evaluate(captureExpression(true));
      inspectNetwork();
      const { data } = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      const after = await page.evaluate(captureExpression(false));
      const afterFrame = (await page.send("Page.getFrameTree")).frameTree.frame;
      if (beforeFrame.loaderId !== afterFrame.loaderId || snapshot.signature !== after.signature) {
        lastError = new Error("The document or layout changed during capture");
        continue;
      }
      const network = inspectNetwork();
      const diagnostics = { errors: [...page.errors], console: [...page.console], network: [...page.network] };
      const requiresHomeFeed = new URL(values.url).pathname === "/home";
      const metrics = {
        ...snapshot.metrics, captureCoherent: true,
        authenticated: snapshot.metrics.accountNavigation && snapshot.metrics.primaryColumnVisible && !snapshot.metrics.loginRequired &&
          !network.authenticationFailure && (!requiresHomeFeed || !!network.homeResponse && snapshot.metrics.feedReady),
        homeResponse: network.homeResponse, authenticationFailure: network.authenticationFailure
      };
      await writeFile(join(artifacts, `${label}.png`), Buffer.from(data, "base64"), { mode: 0o600 });
      await writeFile(join(artifacts, `${label}.html`), snapshot.html, { mode: 0o600 });
      await writeFile(join(artifacts, `${label}.json`), JSON.stringify({ ...metrics, ...diagnostics }, null, 2), { mode: 0o600 });
      return metrics;
    } catch (error) {
      lastError = error;
      if (stopping) throw error;
    }
  }
  throw new Error(`Could not capture a coherent ${label} state after three attempts: ${lastError.message}`, { cause: lastError });
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
  await check("current X search form stays bounded and expands only on focus", async () => {
    const geometry = `(() => {
      const input = document.querySelector('[data-testid="SearchBox_Search_Input"]');
      const form = input.closest('form');
      const r = form.getBoundingClientRect();
      const column = document.querySelector('[data-testid="primaryColumn"]').getBoundingClientRect();
      return { width: r.width, withinViewport: r.left >= 0 && r.right <= innerWidth,
        overlapsTimeline: r.left < column.right && r.right > column.left && r.top < column.bottom && r.bottom > column.top };
    })()`;
    const compact = await page.evaluate(geometry);
    assert.equal(compact.width, 200, "X's width:100% class must not expand the fixed form to the viewport");
    assert.equal(compact.withinViewport, true);
    assert.equal(compact.overlapsTimeline, false);
    assert.equal(await page.evaluate("getComputedStyle(document.getElementById('unrelated-position')).left"), "-12px", "Search alignment must not alter unrelated positioned elements");
    await page.evaluate("document.querySelector('[data-testid=SearchBox_Search_Input]').focus()");
    await page.wait("document.getElementById('fixture-search').getBoundingClientRect().width === 374");
    assert.equal((await page.evaluate(geometry)).withinViewport, true);
    await page.evaluate("document.querySelector('[data-testid=SearchBox_Search_Input]').blur()");
    await page.wait("document.getElementById('fixture-search').getBoundingClientRect().width === 200");
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
  const feed = !values.fixture && new URL(values.url).pathname === "/home" ? new HomeFeedComparison(page) : undefined;
  let primaryError;
  try {
    await page.navigate("about:blank");
    await storage({ extensionStatus: "off" });
    resetPageNetwork();
    feed?.record();
    await page.navigate(values.url);
    await waitForInspectionReady();
    await feed?.ready({ signal: abort.signal });
    const baseline = await capture("baseline");
    if (!values.fixture && !baseline.authenticated) throw new Error("Live X baseline lost authenticated feed access during capture");
    await page.navigate("about:blank");
    await storage({ extensionStatus: "on" });
    resetPageNetwork();
    await feed?.replay();
    await page.navigate(values.url);
    await waitForInspectionReady();
    await receipt();
    if (values["eval-file"]) {
      const result = await page.evaluate(await readFile(resolve(values["eval-file"]), "utf8"));
      await writeFile(join(artifacts, "evaluation.json"), JSON.stringify({ result }, null, 2), { mode: 0o600 });
    }
    await waitForInspectionReady();
    const metrics = await capture("extension");
    const passed = values.fixture || metrics.authenticated && !metrics.loginRequired;
    if (!values.fixture && !passed) throw new Error("Live X inspection lacks an authenticated timeline. Sign in once with yarn login:extension, then rerun.");
    await feed?.stop();
    feed?.compare(baseline, metrics);
    const comparison = await writeComparison(artifacts, baseline, metrics, feed?.report());
    await writeFile(join(artifacts, "report.json"), JSON.stringify({ captureComplete: passed, browser: browser.version, build: revision, baseline, metrics, feedComparison: feed?.report(), comparison }, null, 2), { mode: 0o600 });
  } catch (error) {
    primaryError = error;
    if (!values.fixture) {
      try {
        const state = await page.evaluate(inspectionStateExpression);
        const { authenticationFailure: failure } = inspectNetwork();
        if ((state.loginRequired || failure) && !error.inspectionState) {
          primaryError = authenticationError(state, failure);
          primaryError.cause = error;
        }
      } catch { /* Preserve the inspection error if the target can no longer be read. */ }
    }
    primaryError.feedComparison ??= feed?.report();
    failureCaptureAttempted = true;
    try { await capture("failure"); }
    catch (captureError) {
      primaryError.captureError = captureError.message;
      console.error(`Failure capture failed: ${captureError.message}`);
    }
    throw primaryError;
  } finally {
    const cleanupErrors = [];
    try { await feed?.stop(); }
    catch (error) { cleanupErrors.push({ step: "Release Home feed interception", error }); }
    try { await page.navigate("about:blank"); }
    catch (error) { cleanupErrors.push({ step: "Close inspected document", error }); }
    try {
      if (Object.hasOwn(current.data, "extensionStatus")) await storage({ extensionStatus: current.data.extensionStatus });
      else await popup.send("Extensions.removeStorageItems", { id: browser.extensionId, storageArea: "local", keys: ["extensionStatus"] });
    } catch (error) { cleanupErrors.push({ step: "Restore extensionStatus", error }); }
    if (cleanupErrors.length) {
      for (const failure of cleanupErrors) console.error(`Inspection cleanup failed (${failure.step}): ${failure.error.message}`);
      if (primaryError) primaryError.cleanupErrors = cleanupErrors.map(({ step, error }) => ({ step, error: error.message }));
      else throw new AggregateError(cleanupErrors.map(({ error }) => error), "Inspection cleanup failed");
    }
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
    if (command !== "inspect") { resetPageNetwork(); await page.navigate(values.url); }
    if (command === "test") await test();
    if (command === "inspect") await inspect();
    if (command === "dev") { await receipt(); await capture("initial"); await dev(); }
  }
} catch (error) {
  if (!stopping) {
    process.exitCode = 1;
    console.error(error.stack);
    try {
      await mkdir(artifacts, { recursive: true, mode: 0o700 });
      await writeFile(join(artifacts, "failure-report.json"), JSON.stringify({
        passed: false, error: error.message, cause: error.cause?.message,
        inspectionState: error.inspectionState, authenticationFailure: error.authenticationFailure,
        captureError: error.captureError, cleanupErrors: error.cleanupErrors, feedComparison: error.feedComparison
      }, null, 2), { mode: 0o600 });
    } catch (reportError) { console.error(`Failure report could not be written: ${reportError.message}`); }
    if (page && !failureCaptureAttempted) {
      try { await capture("failure"); }
      catch (captureError) { console.error(`Failure capture failed: ${captureError.message}`); }
    }
  }
} finally {
  const cleanupErrors = [];
  const cleanup = async (step, action) => {
    try { await action(); }
    catch (error) {
      cleanupErrors.push({ step, error: error.message });
      console.error(`Session cleanup failed (${step}): ${error.message}`);
      process.exitCode ||= 1;
    }
  };
  for (const watcher of watchers) await cleanup("Close source watcher", () => watcher.close());
  if (browser) await cleanup("Stop browser", () => browser.close());
  if (testProfile) await cleanup("Remove test profile", () => rm(testProfile, { recursive: true, force: true }));
  if (lock) {
    await cleanup("Close session lock", () => lock.close());
    await cleanup("Remove session lock", () => rm(lockPath, { force: true }));
  }
  if (cleanupErrors.length) {
    try { await writeFile(join(artifacts, "cleanup-errors.json"), JSON.stringify(cleanupErrors, null, 2), { mode: 0o600 }); }
    catch (error) { console.error(`Cleanup report could not be written: ${error.message}`); }
  }
  console.log(`Artifacts: ${artifacts}`);
}
