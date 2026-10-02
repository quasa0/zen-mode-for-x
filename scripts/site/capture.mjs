#!/usr/bin/env node
// Captures the real settings popup from the packaged extension for the website.
// Run `yarn package:extension` first. Usage: node scripts/site/capture.mjs [output-directory]
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Browser } from "../extension-dev/browser.js";
import { root } from "../extension-dev/build.js";

const output = resolve(process.argv[2] || join(root, "site/assets"));
const tabs = ["timeline", "focus", "navigation", "interface", "advanced"];
const profile = await mkdtemp(join(tmpdir(), "zen-capture-"));
await mkdir(output, { recursive: true });
const browser = await Browser.launch({ browser: process.env.ZEN_CAPTURE_BROWSER || "helium", profile, logPath: join(profile, "browser.log") });
try {
  const { id } = await browser.send("Extensions.loadUnpacked", { path: join(root, "bundle/chrome") });
  const page = await browser.page();
  await page.send("Emulation.setDeviceMetricsOverride", { width: 400, height: 600, deviceScaleFactor: 2, mobile: false });
  for (const scheme of ["light", "dark"]) {
    await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
    await page.navigate(`chrome-extension://${id}/index.html`);
    await page.wait("document.fonts.status === 'loaded' && !!document.getElementById('removePromotedPosts')");
    await page.evaluate("new Promise(resolve => chrome.storage.local.set({ mindfulScrolling: 'on' }, resolve))");
    for (const tab of tabs) {
      await page.evaluate(`document.getElementById('tab-${tab}').click(); document.activeElement?.blur(); true`);
      if (tab === "advanced") await page.wait("!!document.querySelector('.cm-content')");
      await page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      await page.screenshot(join(output, `popup-${tab}-${scheme}.png`));
    }
  }
  console.log(`Captured ${tabs.length * 2} popup images in ${output}`);
} finally {
  await browser.close();
  await rm(profile, { recursive: true, force: true });
}
