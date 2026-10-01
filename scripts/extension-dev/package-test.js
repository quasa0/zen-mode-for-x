import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, open, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { Browser } from "./browser.js";
import { cache, root } from "./build.js";
import { defaultPreferences } from "../../storage-keys.js";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const exists = async (path) => {
  try { await lstat(path); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
};

async function acquireLock() {
  await mkdir(cache, { recursive: true });
  const path = join(cache, "session.lock");
  let handle;
  try { handle = await open(path, "wx", 0o600); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    const stale = await lstat(path);
    const pid = Number(await readFile(path, "utf8"));
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error(`Invalid extension session lock: ${path}`);
    try {
      process.kill(pid, 0);
      throw new Error(`Extension session ${pid} is active. Stop it before the package smoke test.`);
    } catch (error) { if (error.code !== "ESRCH") throw error; }
    const current = await lstat(path);
    if (stale.ino !== current.ino || stale.dev !== current.dev || Number(await readFile(path, "utf8")) !== pid) {
      throw new Error("Extension session lock changed. Retry the package smoke test.");
    }
    await rm(path);
    handle = await open(path, "wx", 0o600);
  }
  const identity = await handle.stat();
  try { await handle.writeFile(String(process.pid)); }
  catch (error) { await handle.close(); await rm(path); throw error; }
  return async () => {
    await handle.close();
    if (await exists(path)) {
      const current = await lstat(path);
      assert.equal(current.ino === identity.ino && current.dev === identity.dev, true, "The smoke test must still own its session lock");
      await rm(path);
    }
    assert.equal(await exists(path), false, "Package smoke test lock must be removed");
  };
}

const visible = (id) => `(() => {
  const node = document.getElementById(${JSON.stringify(id)});
  if (!node) return false;
  const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
})()`;

export async function testPackageRuntime({ browser: browserName = "helium", signal } = {}) {
  if (!["helium", "chrome"].includes(browserName)) throw new Error(`Unknown browser: ${browserName}`);
  signal?.throwIfAborted();
  const releaseLock = await acquireLock();
  const artifacts = join(cache, "artifacts", `${new Date().toISOString().replace(/[:.]/g, "-")}-${browserName}-${process.pid}-package-test`);
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(signal.reason);
  signal?.addEventListener("abort", forwardAbort, { once: true });
  if (signal?.aborted) forwardAbort();
  const timeout = setTimeout(() => controller.abort(new Error("Package smoke test exceeded its 120-second deadline")), 120000);
  let browser, popup, page, profile, listener, primaryError;
  const report = { passed: false, browser: browserName, package: join(root, "bundle/chrome"), checks: [], cleanup: [] };
  const interceptionErrors = [];
  const cancel = () => { browser?.close().catch(() => {}); };
  controller.signal.addEventListener("abort", cancel, { once: true });
  const check = async (name, fn) => {
    controller.signal.throwIfAborted();
    await fn();
    controller.signal.throwIfAborted();
    report.checks.push(name);
    console.log(`PASS ${name}`);
  };
  try {
    await mkdir(artifacts, { recursive: true, mode: 0o700 });
    controller.signal.throwIfAborted();
    const manifest = JSON.parse(await readFile(join(report.package, "manifest.json"), "utf8"));
    assert.equal(manifest.manifest_version, 3);
    report.version = manifest.version;
    const content = await readFile(join(report.package, "dist/main.js"));
    assert.equal(/Development build receipt|dataset\.zenDevBuild/.test(content.toString("utf8")), false, "Package must contain the release content script");
    assert.equal(await exists(join(report.package, "build-info.json")), false, "Package must omit development metadata");
    report.contentSha256 = sha256(content);
    assert.equal(report.contentSha256, sha256(await readFile(join(root, "content-scripts/dist/main.js"))), "Package must contain the current compiler output");
    profile = await mkdtemp(join(tmpdir(), "zen-package-runtime-"));
    controller.signal.throwIfAborted();
    browser = await Browser.launch({ browser: browserName, profile, headless: true, logPath: join(artifacts, "browser.log") });
    controller.signal.throwIfAborted();
    report.browserVersion = browser.version;
    const { id } = await browser.send("Extensions.loadUnpacked", { path: report.package });
    browser.extensionId = id;
    popup = await browser.page(`chrome-extension://${id}/index.html`);
    await check("release popup and browser-served assets match the package", async () => {
      await popup.wait("document.body.innerText.includes('Timeline') && !!document.getElementById('removePromotedPosts')");
      const paths = ["dist/main.js", "css/main.css", "css/typefully.css", "background.js", "influence-background.js", "influence-shared.js"];
      const actual = await popup.evaluate(`(async () => {
        const resources = ${JSON.stringify(paths)};
        const results = {};
        for (const path of resources) {
          const response = await fetch(chrome.runtime.getURL(path));
          if (!response.ok) throw new Error('Release asset failed: ' + path + ' HTTP ' + response.status);
          const bytes = await response.arrayBuffer();
          results[path] = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
        }
        const chunks = [...document.querySelectorAll('script[src], link[rel="stylesheet"][href]')].map(node => node.src || node.href);
        if (!chunks.some(url => url.includes('.js')) || !chunks.some(url => url.includes('.css'))) throw new Error('Release popup is missing its script or stylesheet entries');
        for (const url of new Set(chunks)) {
          if (!url.startsWith(location.origin + '/')) throw new Error('Popup asset must be bundled locally');
          const response = await fetch(url);
          if (!response.ok || !(await response.arrayBuffer()).byteLength) throw new Error('Release popup asset failed: ' + url);
        }
        return results;
      })()`);
      for (const path of paths) assert.equal(actual[path], sha256(await readFile(join(report.package, path))), `Browser must serve the packaged ${path}`);
    });
    const storage = (values) => popup.send("Extensions.setStorageItems", { id, storageArea: "local", values });
    await storage({ ...defaultPreferences, extensionStatus: "off" });
    await check("release Jev background uses private key storage and no development receipt", async () => {
      assert.deepEqual(manifest.host_permissions, ["https://api.typesafe.ai/*"]);
      const background = await readFile(join(report.package, "background.js"), "utf8");
      assert.equal(background.includes("zen-dev:background-receipt"), false);
      const admin = (message) => popup.evaluate(`new Promise(resolve => chrome.runtime.sendMessage(${JSON.stringify(message)}, resolve))`);
      const status = await admin({ type: "zen-influence:status" });
      assert.equal(status.ok, true);
      assert.equal(status.configured, false);
      const key = "apikey_package_fixture_only_0123456789abcdef";
      assert.equal((await admin({ type: "zen-influence:configure", apiKey: key })).configured, true);
      const local = await popup.evaluate("new Promise(resolve => chrome.storage.local.get(null,resolve))");
      assert.equal(JSON.stringify(local).includes(key), false);
      assert.equal((await admin({ type: "zen-influence:configure", clearKey: true })).configured, false);
    });
    page = await browser.page();
    const fixture = await readFile(join(root, "scripts/extension-dev/fixtures/timeline.html"));
    listener = (event) => {
      if (event.sessionId !== page.sessionId || event.method !== "Fetch.requestPaused") return;
      const { requestId, resourceType } = event.params;
      const operation = resourceType === "Document"
        ? page.send("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "text/html; charset=utf-8" }], body: fixture.toString("base64") })
        : page.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
      operation.catch((error) => { if (!browser.closing) interceptionErrors.push(error.message); });
    };
    browser.on("event", listener);
    await page.send("Fetch.enable", { patterns: [{ urlPattern: "https://x.com/*" }] });
    await page.navigate("https://x.com/home");
    await page.send("Page.bringToFront");
    await check("disabled release preserves native CSS, ad and organic nodes", async () => {
      await page.wait("document.getElementById('organic-post') && getComputedStyle(document.querySelector('[data-testid=primaryColumn]')).width === '600px' && !document.getElementById('mt-main-stylesheet')");
      for (const id of ["organic-post", "promoted-post", "organic-video"]) assert.equal(await page.evaluate(visible(id)), true);
    });
    await check("enabled release loads bundled CSS and preserves organic content", async () => {
      await storage({ extensionStatus: "on" });
      await page.wait(`['mt-main-stylesheet','mt-typefully-stylesheet'].every(id => { const link = document.getElementById(id); return link && link.href.startsWith('chrome-extension://${id}/') && link.sheet; }) && getComputedStyle(document.querySelector('[data-testid=primaryColumn]')).width === '700px'`);
      await page.wait(`!${visible("promoted-post")}`);
      assert.equal(await page.evaluate(visible("organic-post")), true);
      assert.equal(await page.evaluate(visible("organic-video")), true);
      assert.equal(await page.evaluate("document.documentElement.hasAttribute('data-zen-dev-build')"), false);
      await page.evaluate("window.packageNativeNodes = ['organic-post','promoted-post','organic-video'].map(id => document.getElementById(id))");
    });
    await check("release popup toggles stored ad preference and native visibility", async () => {
      await popup.wait("document.getElementById('removePromotedPosts')?.getAttribute('aria-checked') === 'true'");
      await popup.evaluate("document.getElementById('removePromotedPosts').click()");
      await page.wait(visible("promoted-post"));
      const off = await popup.send("Extensions.getStorageItems", { id, storageArea: "local", keys: ["removePromotedPosts"] });
      assert.equal(off.data.removePromotedPosts, "off");
      await popup.evaluate("document.getElementById('removePromotedPosts').click()");
      await page.wait(`!${visible("promoted-post")}`);
      const on = await popup.send("Extensions.getStorageItems", { id, storageArea: "local", keys: ["removePromotedPosts"] });
      assert.equal(on.data.removePromotedPosts, "on");
      assert.equal(await page.evaluate(visible("organic-video")), true);
      assert.equal(await page.evaluate("window.packageNativeNodes.every(node => node.isConnected && document.getElementById(node.id) === node)"), true, "Ad filtering must preserve native nodes in the current document");
    });
    await check("disabling release reloads a clean native layout", async () => {
      await storage({ extensionStatus: "off" });
      await page.wait(`!document.getElementById('mt-main-stylesheet') && getComputedStyle(document.querySelector('[data-testid=primaryColumn]')).width === '600px' && ${visible("promoted-post")}`);
      assert.equal(await page.evaluate("document.querySelectorAll('[id^=mt-style-]').length"), 0);
      for (const id of ["organic-post", "promoted-post", "organic-video"]) assert.equal(await page.evaluate(visible(id)), true);
    });
    await check("release popup and fixture have no uncaught runtime errors", async () => {
      assert.deepEqual([...popup.errors, ...page.errors].filter(error => error.exception || error.exceptionId), []);
      assert.deepEqual(interceptionErrors, []);
    });
    report.passed = true;
  } catch (error) {
    primaryError = controller.signal.aborted ? controller.signal.reason : error;
    report.error = primaryError?.stack || String(primaryError);
    throw primaryError;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", forwardAbort);
    controller.signal.removeEventListener("abort", cancel);
    if (listener) browser.off("event", listener);
    const failures = [];
    let browserGone = !browser;
    try {
      await browser?.close();
      if (browser?.process.pid) assert.throws(() => process.kill(browser.process.pid, 0), { code: "ESRCH" });
      if (browser?.pidPath) assert.equal(await exists(browser.pidPath), false);
      browserGone = true;
      report.cleanup.push("owned browser and helpers stopped");
    } catch (error) { failures.push(error); }
    if (profile && browserGone) {
      try { await rm(profile, { recursive: true, force: true }); assert.equal(await exists(profile), false); report.cleanup.push("disposable profile removed"); }
      catch (error) { failures.push(error); }
    } else if (profile) report.profilePreserved = profile;
    try { await releaseLock(); report.cleanup.push("owned session lock removed"); }
    catch (error) { failures.push(error); }
    report.passed &&= failures.length === 0;
    if (failures.length) report.cleanupErrors = failures.map(error => error.message);
    try { await writeFile(join(artifacts, "report.json"), JSON.stringify(report, null, 2) + "\n", { mode: 0o600 }); }
    catch (error) { failures.push(error); }
    console.log(`Package smoke artifacts: ${artifacts}`);
    if (failures.length) {
      if (primaryError) primaryError.cleanupErrors = failures.map(error => error.message);
      else throw new AggregateError(failures, "Package smoke cleanup failed");
    }
  }
  return report;
}

async function main() {
  const { values } = parseArgs({ options: { browser: { type: "string", default: "helium" }, help: { type: "boolean" } } });
  if (values.help) { console.log("Usage: node scripts/extension-dev/package-test.js [--browser helium|chrome]"); return; }
  const abort = new AbortController();
  const stop = () => { process.exitCode = 130; abort.abort(new Error("Package smoke test interrupted")); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try { await testPackageRuntime({ browser: values.browser, signal: abort.signal }); }
  finally { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); }
}

if (process.argv[1] && pathToFileURL(await realpath(process.argv[1])).href === import.meta.url) {
  await main().catch(error => { console.error(error.stack); process.exitCode ||= 1; });
}
