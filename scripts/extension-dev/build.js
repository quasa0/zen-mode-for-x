import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { cp, mkdir, readFile, readdir, rename, rm, writeFile, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const cache = join(root, ".cache/extension-dev");
export const bundlePath = join(cache, "bundle");
const hash = (data) => createHash("sha256").update(data).digest("hex");
const ignored = new Set(["node_modules", ".next", "out", "dist", ".DS_Store"]);

export async function files(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const item = join(path, entry.name);
    if (entry.isDirectory()) result.push(...await files(item));
    else if (entry.isFile()) result.push(item);
  }
  return result.sort();
}

async function digest(paths) {
  const value = createHash("sha256");
  for (const path of paths.sort()) { value.update(path); value.update(await readFile(path)); }
  return value.digest("hex");
}

async function runBuild(directory, signal) {
  signal?.throwIfAborted();
  const pidPath = join(cache, `build-${directory}.pid`);
  const log = createWriteStream(join(cache, `build-${directory}.log`), { flags: "w", mode: 0o600 });
  // The process group stays owned by this awaited build; cancellation stops every compiler worker.
  const child = spawn("yarn", ["--offline", "build"], { cwd: join(root, directory), stdio: ["ignore", "pipe", "pipe"], detached: true });
  let killTimer;
  const killGroup = (signal) => { if (child.pid) { try { process.kill(-child.pid, signal); } catch { /* Already stopped. */ } } };
  const cancel = () => {
    killGroup("SIGTERM");
    killTimer = setTimeout(() => killGroup("SIGKILL"), 1000);
  };
  log.on("error", cancel);
  const finished = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, exitSignal) => {
      if (signal?.aborted) reject(new Error("Build interrupted"));
      else if (code === 0) resolve();
      else reject(new Error(`${directory} build failed: ${code ?? exitSignal}`));
    });
  });
  child.stdout.on("data", (data) => { process.stdout.write(data); log.write(data); });
  child.stderr.on("data", (data) => { process.stderr.write(data); log.write(data); });
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  try {
    if (child.pid) await writeFile(pidPath, String(child.pid), { mode: 0o600 });
    await finished;
  } catch (error) {
    cancel();
    await finished.catch(() => {});
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
    clearTimeout(killTimer);
    killGroup("SIGTERM");
    const alive = () => { if (!child.pid) return false; try { process.kill(-child.pid, 0); return true; } catch { return false; } };
    for (let i = 0; i < 10 && alive(); i++) await new Promise((resolve) => setTimeout(resolve, 100));
    if (alive()) killGroup("SIGKILL");
    for (let i = 0; i < 10 && alive(); i++) await new Promise((resolve) => setTimeout(resolve, 100));
    log.end();
    await rm(pidPath, { force: true });
    if (alive()) throw new Error(`${directory} compiler processes did not stop`);
  }
}

export async function build({ force = false, signal } = {}) {
  signal?.throwIfAborted();
  await mkdir(cache, { recursive: true });
  const contentHash = await digest([...await files(join(root, "content-scripts")), join(root, "storage-keys.js")]);
  const popupHash = await digest([...await files(join(root, "popup")), join(root, "storage-keys.js")]);
  const inputHash = await digest([
    ...await files(join(root, "content-scripts")), ...await files(join(root, "popup")),
    ...await files(join(root, "css")), ...await files(join(root, "fonts")), ...await files(join(root, "images")),
    join(root, "storage-keys.js"), join(root, "extension-manifests.js"), join(root, "background.js"),
  ]);
  let previous = {};
  try { previous = JSON.parse(await readFile(join(cache, "build-state.json"), "utf8")); } catch { /* First build. */ }
  const exists = async (path) => { try { await access(path); return true; } catch { return false; } };
  if (force || previous.contentHash !== contentHash || !await exists(join(root, "content-scripts/dist/main.js"))) await runBuild("content-scripts", signal);
  if (force || previous.popupHash !== popupHash || !await exists(join(root, "popup/out/index.html"))) await runBuild("popup", signal);
  signal?.throwIfAborted();
  const manifestSource = join(root, "extension-manifests.js");
  const { MANIFEST_CHROME } = await import(`${pathToFileURL(manifestSource).href}?source=${hash(await readFile(manifestSource))}`);
  const staging = join(cache, `staging-${randomUUID()}`);
  await mkdir(staging);
  try {
    await cp(join(root, "popup/out"), staging, { recursive: true });
    for (const [source, target] of [["content-scripts/dist", "dist"], ["css", "css"], ["fonts", "fonts"], ["images", "images"]]) {
      await cp(join(root, source), join(staging, target), { recursive: true });
    }
    await cp(join(root, "background.js"), join(staging, "background.js"));
    const revision = hash(inputHash + await readFile(join(staging, "dist/main.js")) + randomUUID()).slice(0, 20);
    const content = await readFile(join(staging, "dist/main.js"), "utf8");
    await writeFile(join(staging, "dist/main.js"), content + `\n// Development build receipt.\ndocument.documentElement.dataset.zenDevBuild = ${JSON.stringify(revision)};\n`);
    await writeFile(join(staging, "manifest.json"), JSON.stringify(MANIFEST_CHROME, null, 2));
    for (const resource of ["index.html", "background.js", "css/main.css", "css/typefully.css", ...MANIFEST_CHROME.content_scripts.flatMap((config) => config.js)]) {
      await access(join(staging, resource));
    }
    const info = { revision, inputHash, contentHash, popupHash, builtAt: new Date().toISOString(), contentSha256: hash(await readFile(join(staging, "dist/main.js"))) };
    await writeFile(join(staging, "build-info.json"), JSON.stringify(info, null, 2));
    const backup = join(cache, "previous-bundle");
    await rm(backup, { recursive: true, force: true });
    if (await exists(bundlePath)) await rename(bundlePath, backup);
    try { await rename(staging, bundlePath); } catch (error) {
      if (await exists(backup)) await rename(backup, bundlePath);
      throw error;
    }
    await rm(backup, { recursive: true, force: true });
    await writeFile(join(cache, "build-state.json"), JSON.stringify(info, null, 2));
    console.log(`Built development extension ${revision}`);
    return info;
  } finally { await rm(staging, { recursive: true, force: true }); }
}
