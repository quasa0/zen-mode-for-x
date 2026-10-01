import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const overlaps = (a, b) => a && b && a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0 &&
  Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) + 1 &&
  Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y) + 1;

function layoutIssues(state) {
  const issues = [];
  if (state.horizontalOverflow) issues.push("The page extends past the viewport.");
  if (state.searchBox?.visible && !state.searchBox.focused) {
    if (overlaps(state.searchBox.rect, state.primaryColumn)) issues.push("The unfocused search box overlaps the timeline.");
    if (state.links.some((link) => overlaps(state.searchBox.rect, link.rect))) issues.push("The unfocused search box overlaps navigation.");
  }
  return issues;
}

export async function writeComparison(artifacts, baseline, enabled, feed = null) {
  const after = new Map(enabled.posts.filter((post) => post.statusId).map((post) => [post.statusId, post]));
  const matchedPosts = baseline.posts.filter((post) => post.statusId && after.has(post.statusId)).map((post) => {
    const next = after.get(post.statusId);
    return { statusId: post.statusId, before: { visible: post.visible, rect: post.rect }, after: { visible: next.visible, rect: next.rect } };
  });
  const comparison = {
    baseline: { authenticated: baseline.authenticated, issues: layoutIssues(baseline), width: baseline.primaryColumn?.width },
    enabled: { authenticated: enabled.authenticated, issues: layoutIssues(enabled), width: enabled.primaryColumn?.width },
    matchedPosts, feed,
    hiddenMatchedPosts: matchedPosts.filter((post) => post.before.visible && !post.after.visible).map((post) => post.statusId),
  };
  await writeFile(join(artifacts, "comparison.json"), JSON.stringify(comparison, null, 2), { mode: 0o600 });
  const issues = comparison.enabled.issues;
  const findings = issues.length ? issues.map((issue) => `<li>${escape(issue)}</li>`).join("") : "<li>No horizontal overflow or unfocused search overlap detected.</li>";
  const rows = matchedPosts.map((post) => `<tr><td>${escape(post.statusId)}</td><td>${post.before.visible ? "Visible" : "Hidden"}</td><td>${post.after.visible ? "Visible" : "Hidden"}</td><td>${Math.round(post.before.rect.width)} → ${Math.round(post.after.rect.width)} px</td></tr>`).join("");
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>X extension comparison</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f5f7;color:#16181c;font:15px/1.5 system-ui,sans-serif}main{max-width:1800px;margin:auto;padding:32px}h1{font-size:28px;letter-spacing:-.6px;margin:0 0 8px}h2{font-size:17px;margin:0 0 12px}p{color:#555;margin:8px 0 20px}.facts{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}.facts span{background:white;border:1px solid #ddd;border-radius:10px;padding:10px 14px}.images{display:grid;grid-template-columns:1fr 1fr;gap:20px}.panel{background:white;border:1px solid #ddd;border-radius:14px;padding:16px;overflow:hidden}.panel img{width:100%;display:block;border:1px solid #eee;border-radius:6px}.review{margin-top:20px}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:10px;border-bottom:1px solid #eee}ul{padding-left:22px}a{color:inherit}@media(max-width:900px){main{padding:16px}.images{grid-template-columns:1fr}td{font-size:12px}}
</style><main><h1>X extension comparison</h1><p>Fresh documents at the same viewport. Click either image to inspect it at full size.</p>
<div class="facts"><span>Timeline: ${escape(comparison.baseline.width ?? "—")} → ${escape(comparison.enabled.width ?? "—")} px</span><span>${matchedPosts.length} shared posts</span><span>${feed?.replayCount ? "Feed content held constant" : "Live feed content may differ"}</span></div>
<div class="images"><section class="panel"><h2>Extension off</h2><a href="baseline.png"><img src="baseline.png" alt="X with the extension off"></a></section><section class="panel"><h2>Extension on</h2><a href="extension.png"><img src="extension.png" alt="X with the extension on"></a></section></div>
<section class="panel review"><h2>Layout checks</h2><ul>${findings}</ul><p>Configured width and navigation changes are expected. These checks do not establish complete ad coverage. Review hidden posts before treating them as a defect.</p><h2>Shared posts</h2><table><thead><tr><th>Status ID</th><th>Off</th><th>On</th><th>Width</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No shared posts were captured.</td></tr>'}</tbody></table></section></main></html>`;
  await writeFile(join(artifacts, "comparison.html"), html, { mode: 0o600 });
  return comparison;
}
