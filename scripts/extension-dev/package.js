import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, lstat, mkdir, open, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { promisify, parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { build, cache, root, sourceDigest } from "./build.js";
import { copyBackground, backgroundSources } from "./background.js";

const run = promisify(execFile);
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
    const pid = Number(await readFile(path, "utf8"));
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error(`Invalid extension session lock: ${path}`);
    let running = true;
    try { process.kill(pid, 0); }
    catch (error) { if (error.code === "ESRCH") running = false; else throw error; }
    if (running) throw new Error(`Extension session ${pid} is active. Stop it before packaging.`);
    // Recheck the stale file before unlinking; never clear a replacement lock.
    const stale = await lstat(path);
    if (Number(await readFile(path, "utf8")) !== pid) throw new Error("Extension session lock changed. Retry packaging.");
    const current = await lstat(path);
    if (stale.ino !== current.ino || stale.dev !== current.dev) throw new Error("Extension session lock changed. Retry packaging.");
    await rm(path);
    handle = await open(path, "wx", 0o600);
  }
  await handle.writeFile(String(process.pid));
  const identity = await handle.stat();
  return async () => {
    await handle.close();
    if (await exists(path)) {
      const current = await lstat(path);
      if (current.ino === identity.ino && current.dev === identity.dev) await rm(path);
    }
  };
}

async function validateDirectory(directory, manifest) {
  const resources = [
    manifest.options_ui?.page,
    manifest.action?.default_popup,
    manifest.browser_action?.default_popup,
    manifest.background?.service_worker,
    ...(manifest.background?.scripts || []),
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {}),
    ...Object.values(manifest.browser_action?.default_icon || {}),
    ...(manifest.content_scripts || []).flatMap((entry) => [...(entry.js || []), ...(entry.css || [])]),
    ...(manifest.web_accessible_resources || []).flatMap((entry) => typeof entry === "string" ? [entry] : entry.resources),
  ].filter(Boolean);
  if (manifest.manifest_version === 3) resources.push(...backgroundSources);
  for (const resource of new Set(resources)) {
    const path = resolve(directory, resource);
    assert.ok(path.startsWith(directory + sep), `Manifest resource must stay in the package: ${resource}`);
    assert.equal((await lstat(path)).isFile(), true, `Manifest resource is missing or not a file: ${resource}`);
  }
  const content = await readFile(join(directory, "dist/main.js"), "utf8");
  assert.equal(content.includes("Development build receipt") || content.includes("dataset.zenDevBuild"), false, "Release content must not include a development receipt");
  const background = await readFile(join(directory, "background.js"), "utf8");
  assert.equal(background.includes("zen-dev:background-receipt"), false, "Release background must not include a development receipt");
  assert.equal(await exists(join(directory, "build-info.json")), false, "Release package must not include development build metadata");
}

async function publish(entries, signal) {
  try {
    for (const entry of entries) {
      signal?.throwIfAborted();
      if (await exists(entry.destination)) {
        await rename(entry.destination, entry.backup);
        entry.backedUp = true;
      }
    }
    for (const entry of entries) {
      signal?.throwIfAborted();
      await rename(entry.staged, entry.destination);
      entry.installed = true;
    }
    signal?.throwIfAborted();
  } catch (error) {
    const rollbackErrors = [];
    for (const entry of [...entries].reverse()) {
      try {
        if (entry.installed) await rename(entry.destination, entry.staged);
        if (entry.backedUp) await rename(entry.backup, entry.destination);
      } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    if (rollbackErrors.length) {
      const failure = new AggregateError([error, ...rollbackErrors], "Packaging failed and rollback needs recovery. Staged backups were preserved.");
      failure.preserveStaging = true;
      throw failure;
    }
    throw error;
  }
}

export async function packageExtensions({ browser = "all", signal } = {}) {
  if (!["chrome", "firefox", "all"].includes(browser)) throw new Error(`Unknown package browser: ${browser}`);
  signal?.throwIfAborted();
  const releaseLock = await acquireLock();
  let staging, preserveStaging = false;
  let primaryError;
  try {
    // Next's telemetry is unnecessary for a local offline package build.
    process.env.NEXT_TELEMETRY_DISABLED = "1";
    const info = await build({ signal });
    signal?.throwIfAborted();
    const sourcePath = join(root, "extension-manifests.js");
    const sourceHash = createHash("sha256").update(await readFile(sourcePath)).digest("hex");
    const { MANIFEST_CHROME, MANIFEST_FIREFOX } = await import(`${pathToFileURL(sourcePath).href}?package=${sourceHash}`);
    const browsers = browser === "all" ? ["chrome", "firefox"] : [browser];
    const output = join(root, "bundle");
    await mkdir(output, { recursive: true });
    // Staging beside the final files guarantees same-filesystem renames.
    staging = join(output, `.package-${randomUUID()}`);
    await mkdir(staging);
    const entries = [];
    const packages = [];
    for (const target of browsers) {
      signal?.throwIfAborted();
      const directory = join(staging, target);
      const manifest = target === "chrome" ? MANIFEST_CHROME : MANIFEST_FIREFOX;
      const copyOptions = { recursive: true, filter: (path) => !path.split(sep).some((part) => part === ".DS_Store" || part.startsWith("._")) };
      // Copy compiler outputs, not the instrumented development extension.
      await cp(join(root, "popup/out"), directory, copyOptions);
      for (const [source, destination] of [["content-scripts/dist", "dist"], ["css", "css"], ["fonts", "fonts"], ["images", "images"]]) {
        await cp(join(root, source), join(directory, destination), copyOptions);
      }
      await copyBackground(root, directory, manifest);
      await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
      await validateDirectory(directory, manifest);
      const archive = join(staging, `${target}.zip`);
      await run("zip", ["-q", "-r", "-X", archive, "."], { cwd: directory, signal, env: { ...process.env, COPYFILE_DISABLE: "1" }, maxBuffer: 1024 * 1024 });
      await run("unzip", ["-tqq", archive], { signal, maxBuffer: 1024 * 1024 });
      const { stdout } = await run("unzip", ["-p", archive, "manifest.json"], { signal, maxBuffer: 1024 * 1024 });
      assert.deepEqual(JSON.parse(stdout), manifest, "The archive must contain the current manifest at its root");
      const names = (await run("unzip", ["-Z1", archive], { signal, maxBuffer: 8 * 1024 * 1024 })).stdout.trim().split("\n");
      assert.ok(names.includes("dist/main.js") && names.includes("index.html"), "The archive must contain the extension entry files at its root");
      assert.equal(names.includes("build-info.json"), false);
      packages.push({ browser: target, version: manifest.version, directory: join(output, target), archive: join(output, `${target}.zip`) });
      for (const name of [target, `${target}.zip`]) entries.push({ staged: join(staging, name), destination: join(output, name), backup: join(staging, `previous-${name}`) });
    }
    assert.equal(await sourceDigest(), info.inputHash, "Sources changed during packaging; previous artifacts were preserved. Retry packaging.");
    await publish(entries, signal);
    for (const item of packages) console.log(`Packaged ${item.browser} ${item.version}: ${item.archive}`);
    return { build: info.revision, packages };
  } catch (error) {
    primaryError = error;
    preserveStaging = !!error.preserveStaging;
    if (preserveStaging) console.error(`Recovery files: ${staging}`);
    throw error;
  } finally {
    const cleanup = [];
    if (staging && !preserveStaging) {
      try { await rm(staging, { recursive: true, force: true }); }
      catch (error) { cleanup.push(error); console.error(`Could not remove owned packaging staging directory: ${staging}`); }
    }
    try { await releaseLock(); } catch (error) { cleanup.push(error); }
    if (cleanup.length && !primaryError) throw new AggregateError(cleanup, "Packaging cleanup failed");
  }
}

async function main() {
  const { values } = parseArgs({ options: { browser: { type: "string", default: "all" }, help: { type: "boolean" } } });
  if (values.help) {
    console.log("Usage: yarn package:extension [--browser chrome|firefox|all]");
    return;
  }
  const abort = new AbortController();
  const stop = () => { process.exitCode = 130; abort.abort(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try { await packageExtensions({ browser: values.browser, signal: abort.signal }); }
  finally { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); }
}

if (process.argv[1] && pathToFileURL(await realpath(process.argv[1])).href === import.meta.url) {
  await main().catch((error) => { console.error(error.stack); process.exitCode ||= 1; });
}
