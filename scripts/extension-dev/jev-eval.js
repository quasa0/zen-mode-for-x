import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createInfluenceRequest, INFLUENCE_API_URL, influenceDefaults, KeyInfluenceSensitivity, normalizeInfluencePost } from "../../influence-shared.js";
import { cache, root } from "./build.js";

// This finite semantic evaluation calls the real provider. Browser fixtures use mocks.
const { values } = parseArgs({ options: { "key-file": { type: "string" }, help: { type: "boolean" } } });
if (values.help) {
  console.log("Usage: yarn test:jev --key-file /absolute/private-file (mode 0600; 24 synthetic posts)");
} else {
  if (!values["key-file"]) throw new Error("Pass --key-file with a private Jev key file.");
  const path = resolve(values["key-file"]);
  const info = await stat(path);
  if (!info.isFile() || info.mode & 0o077 || info.size > 512) throw new Error("The key file must have mode 0600 and contain at most 512 bytes.");
  const apiKey = (await readFile(path, "utf8")).trim();
  if (!/^apikey_[A-Za-z0-9_]+$/.test(apiKey)) throw new Error("Invalid key format.");
  const { cases } = JSON.parse(await readFile(join(root, "scripts/extension-dev/fixtures/influence-eval.json"), "utf8"));
  const threshold = influenceDefaults[KeyInfluenceSensitivity];
  const rows = [];
  for (const [index, item] of cases.entries()) {
    const post = normalizeInfluencePost({ url: `https://x.com/evaluation/status/${index + 1}`, text: item.text, quotedText: item.quotedText || "" });
    if (!post) throw new Error(`Invalid synthetic case: ${item.id}`);
    const start = performance.now();
    let response;
    try {
      response = await fetch(INFLUENCE_API_URL, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(createInfluenceRequest(post)), credentials: "omit", redirect: "error", signal: AbortSignal.timeout(12000) });
    } catch { throw new Error(`Jev request failed for synthetic case ${item.id}; no automatic retry.`); }
    if (!response.ok) throw new Error(`Jev returned HTTP ${response.status}; evaluation stopped.`);
    const body = await response.json();
    const scores = Object.fromEntries(["sales", "fomo", "bait"].map(kind => [kind, body.answers?.[kind]?.type === "noul" ? body.answers[kind].noul : null]));
    if (Object.values(scores).some(value => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error("Jev returned an invalid probability.");
    const mismatches = Object.keys(scores).filter(kind => (scores[kind] >= threshold) !== item.expected[kind]);
    rows.push({ id: item.id, expected: item.expected, scores, mismatches, latencyMs: Math.round(performance.now() - start), model: body.model, inputTokens: body.usage?.input_tokens || 0 });
  }
  const latencies = rows.map(row => row.latencyMs).sort((a, b) => a - b);
  const summary = { cases: rows.length, decisions: rows.length * 3, mismatches: rows.reduce((sum, row) => sum + row.mismatches.length, 0), threshold, latencyP50Ms: latencies[Math.floor(latencies.length / 2)], latencyP95Ms: latencies[Math.ceil(latencies.length * 0.95) - 1], inputTokens: rows.reduce((sum, row) => sum + row.inputTokens, 0) };
  const directory = join(cache, "artifacts", `${new Date().toISOString().replace(/[:.]/g, "-")}-jev-eval`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(join(directory, "report.json"), JSON.stringify({ summary, rows, limitation: "Synthetic labels are subjective. This checks representative cases, not real-world accuracy or probability calibration." }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(summary));
  console.log(`Evaluation report: ${join(directory, "report.json")}`);
  if (summary.mismatches) process.exitCode = 1;
}
