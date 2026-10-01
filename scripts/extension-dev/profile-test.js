import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Browser } from "./browser.js";
import { cache } from "./build.js";

const { values } = parseArgs({ options: { browser: { type: "string", default: "helium" } } });
if (!["helium", "chrome"].includes(values.browser)) throw new Error(`Unknown browser: ${values.browser}`);
const profile = await mkdtemp(join(tmpdir(), "zen-profile-persistence-"));
const artifacts = join(cache, "artifacts", `${new Date().toISOString().replace(/[:.]/g, "-")}-${values.browser}-${process.pid}-profile-test`);
await mkdir(artifacts, { recursive: true, mode: 0o700 });
let normal, automated, timer, acknowledge, primaryError, stopping = false;
const stopped = new Promise((resolve) => {
  const stop = () => { stopping = true; process.exitCode = 130; resolve(false); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
});
const ready = new Promise((resolve) => { acknowledge = resolve; });
const server = createServer((request, response) => {
  if (request.url === "/ready") {
    acknowledge((request.headers.cookie || "").includes("zen_profile_probe=synthetic"));
    response.end("ok");
    return;
  }
  response.setHeader("Set-Cookie", "zen_profile_probe=synthetic; Max-Age=86400; Path=/; SameSite=Lax");
  response.setHeader("Content-Type", "text/html");
  response.end('<!doctype html><title>Extension profile test</title><p>Temporary local cookie persistence test.</p><script>fetch("/ready")</script>');
});
const gone = (pid) => assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });

try {
  assert.equal(stopping, false, "Profile test stopped");
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  assert.equal(stopping, false, "Profile test stopped");
  normal = await Browser.launch({
    browser: values.browser, profile, automation: false, headless: false,
    url: `http://127.0.0.1:${server.address().port}/`, logPath: join(artifacts, "normal.log"),
  });
  assert.equal(await Promise.race([
    ready,
    stopped,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Normal browser did not acknowledge the test cookie")), 10000); }),
  ]), true);
  clearTimeout(timer);
  await normal.close();
  gone(normal.process.pid);
  await assert.rejects(readFile(normal.pidPath), { code: "ENOENT" });
  assert.equal(stopping, false, "Profile test stopped");
  automated = await Browser.launch({ browser: values.browser, profile, headless: true, logPath: join(artifacts, "automated.log") });
  assert.equal(stopping, false, "Profile test stopped");
  const { cookies } = await automated.send("Storage.getCookies");
  assert.equal(cookies.find((cookie) => cookie.name === "zen_profile_probe")?.value, "synthetic", "A fresh persistent cookie must survive normal quit and automated restart");
  await automated.close();
  gone(automated.process.pid);
  await assert.rejects(readFile(automated.pidPath), { code: "ENOENT" });
  console.log(`PASS ${values.browser}: normal quit saves cookies for automated restart; browser cleanup verified`);
} catch (error) {
  primaryError = error;
  process.exitCode ||= 1;
  console.error(error.stack);
} finally {
  clearTimeout(timer);
  const results = await Promise.allSettled([normal?.close(), automated?.close()]);
  await new Promise((resolve, reject) => server.close((error) => error && error.code !== "ERR_SERVER_NOT_RUNNING" ? reject(error) : resolve()));
  if (results.every((result) => result.status === "fulfilled")) await rm(profile, { recursive: true, force: true });
  for (const result of results) if (result.status === "rejected") {
    console.error(`Cleanup failed: ${result.reason.message}`);
    process.exitCode = 1;
  }
  if (primaryError || process.exitCode) console.error(`Artifacts: ${artifacts}`);
}
