import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const filtersOff = { removePromotedPosts: "off", removePaidPartnershipPosts: "off", removeAiPosts: "off" };
const filtersOn = Object.fromEntries(Object.keys(filtersOff).map(key => [key, "on"]));

// Inspect platform badges, never keywords inside user text. Store IDs and geometry,
// not post bodies. Private captures stay under the ignored artifact directory.
const sample = `(() => {
  const visible = element => { const r = element.getBoundingClientRect(); const s = getComputedStyle(element); return !!(r.width && r.height && s.display !== 'none' && s.visibility !== 'hidden'); };
  const excluded = '[data-testid="tweetText"], [data-testid="User-Name"], [data-testid="quoteTweet"], [data-testid="card.wrapper"], div[role="link"], [data-testid^="UserAvatar-"]';
  const posts = [...document.querySelectorAll('[data-testid="primaryColumn"] [data-testid="tweet"]')].map(post => {
    const owned = element => element.closest('[data-testid="tweet"]') === post && (!element.closest(excluded) || !post.contains(element.closest(excluded)));
    const normalize = value => value.replace(/\\s+/g, ' ').trim().toLowerCase();
    const disclosures = [...post.querySelectorAll('[data-testid="contentDisclosureButton"]')].filter(owned).flatMap(element => [element, ...element.querySelectorAll('span')]).map(element => normalize(element.textContent));
    disclosures.push(...[...post.querySelectorAll('span')].filter(element => owned(element) && !element.children.length && element.parentElement.querySelector(':scope > svg')).map(element => normalize(element.textContent)));
    const timestamp = [...post.querySelectorAll('a[href*="/status/"]')].find(element => element.querySelector('time') && element.closest('[data-testid="tweet"]') === post && !element.parentElement.closest('[data-testid="quoteTweet"], [data-testid="card.wrapper"], div[role="link"]'));
    const id = timestamp?.getAttribute('href').match(/\\/status\\/(\\d+)/)?.[1] || null;
    const video = post.querySelector('video');
    if (window.__zenAuditRemember && id) window.__zenAuditPosts.set(id, {post,video});
    const ad = !!post.closest('[data-testid="placementTracking"]') || [...post.querySelectorAll('span')].some(element => owned(element) && !element.children.length && !element.closest('[data-testid="contentDisclosureButton"]') && /^(ad|promoted|boosted)$/.test(normalize(element.textContent)));
    const paid = disclosures.some(text => /^(paid partnership|paid promotion)(?: with .+)?$/.test(text));
    const ai = disclosures.some(text => /^(made with ai|ai-generated)$/.test(text));
    const r = post.getBoundingClientRect();
    const saved = window.__zenAuditPosts?.get(id);
    return { id, ad, paid, ai, sameNode:!!id && saved?.post === post, visible: visible(post), video: !!video, videoVisible:!!video && visible(video), sameVideo:!!video && saved?.video === video, rect: {x:r.x,y:r.y,width:r.width,height:r.height} };
  });
  const column = document.querySelector('[data-testid="primaryColumn"]');
  const r = column?.getBoundingClientRect();
  const search = document.querySelector('[data-testid="SearchBox_Search_Input"]')?.closest('form');
  const sr = search?.getBoundingClientRect();
  return { url: location.href, scrollY, height:document.documentElement.scrollHeight, viewport:{width:innerWidth,height:innerHeight},
    horizontalOverflow:document.documentElement.scrollWidth > innerWidth,
    column: r && {x:r.x,y:r.y,width:r.width,height:r.height},
    searchOverlap: !!(sr && r && visible(search) && sr.left < r.right && sr.right > r.left && sr.top < r.bottom && sr.bottom > r.top),
    visibleAdSuggestions:[...document.querySelectorAll('[data-testid="whoToFollowSspAd"]')].filter(visible).length,
    posts };
})()`;

export async function runLiveAudit({ page, storage, receipt, navigate, capture, validateRead, artifacts, check, url, suite = "all", steps = 48, profiles = ["quasa0", "addyosmani", "SahilBloom", "replicate"] }) {
  if (!["all","focus","media","labels"].includes(suite)) throw new Error("Live audit suite must be all, focus, media, or labels");
  await storage({extensionStatus:"on",writerMode:"off",mindfulScrolling:"off",aiSlopButton:"off"});
  if (suite !== "all") {
    if (suite === "labels") {
      const {runLiveLabelAudit} = await import("./live-labels.js");
      const result = await runLiveLabelAudit({page,storage,navigate,receipt,capture,check,url});
      await validateRead();
      const report = {...result,visited:[],uniquePosts:0};
      await writeFile(join(artifacts,"live-audit.json"),JSON.stringify(report,null,2),{mode:0o600});
      return report;
    }
    const helpers = await import("./live-focus.js");
    const context = {page,storage,check,navigate,capture};
    const result = await helpers[suite === "focus" ? "runLiveFocusAudit" : "runLiveRecentMediaAudit"](context);
    const report = {passed:true,kind:suite,result,visited:[],uniquePosts:0};
    await writeFile(join(artifacts,"live-audit.json"),JSON.stringify(report,null,2),{mode:0o600});
    return report;
  }
  const visited = [], unique = new Map(), flags = [];
  let comparisons = 0, labeled = 0, videos = 0;
  await storage({ extensionStatus: "on", writerMode: "off", mindfulScrolling: "off", followingTimeline: "off", ...filtersOn });

  async function inspectMounted(route, step) {
    await validateRead();
    const enabled = await page.evaluate(sample);
    const bad = enabled.posts.filter(post => post.visible && (post.ad || post.paid || post.ai));
    assert.deepEqual(bad, [], `Labeled posts must be hidden at ${route} step ${step}`);
    assert.equal(enabled.visibleAdSuggestions, 0, "Ad account suggestions must be hidden");
    if (enabled.horizontalOverflow || enabled.searchOverlap) flags.push({ route, step, horizontalOverflow:enabled.horizontalOverflow, searchOverlap:enabled.searchOverlap });
    for (const post of enabled.posts) {
      if (post.id) unique.set(post.id, { id:post.id, ad:post.ad, paid:post.paid, ai:post.ai, video:post.video });
    }
    // At intervals compare off/on in this same document. Skip recycled nodes or
    // changing labels; assert only stable, connected native nodes.
    if (step % 6 === 0) {
      await storage(filtersOff);
      await page.wait("!document.getElementById('mt-style-postFilters')");
      const before = await page.evaluate(`(() => { window.__zenAuditRemember = true; window.__zenAuditPosts = new Map(); const state = ${sample}; window.__zenAuditRemember = false; return state; })()`);
      await storage(filtersOn);
      await page.wait("!!document.getElementById('mt-style-postFilters')");
      await delay(150);
      const after = await page.evaluate(sample);
      for (const post of before.posts) {
        if (!post.id || !post.visible) continue;
        const match = after.posts.find(other => other.id === post.id);
        if (!match?.sameNode || post.ad !== match.ad || post.paid !== match.paid || post.ai !== match.ai) continue;
        const hidden = post.ad || post.paid || post.ai;
        assert.equal(match.visible, !hidden, `Filter visibility for stable post ${post.id}`);
        comparisons++;
        if (hidden) labeled++;
        if (post.videoVisible && match.sameVideo && !hidden) {
          assert.equal(match.videoVisible, true, `Native video visibility for stable post ${post.id}`);
          videos++;
        }
      }
      await page.evaluate("delete window.__zenAuditPosts; delete window.__zenAuditRemember");
    }
    return enabled;
  }

  for (const [route, count] of [["/home", steps], ...profiles.map(handle => [`/${handle}`, Math.max(12, Math.ceil(steps / 3))])]) {
    await navigate(`https://x.com${route}`);
    await receipt();
    await page.wait("!!document.querySelector('[data-testid=primaryColumn] [data-testid=tweet]')", 30000);
    const ids = new Set();
    let moved = 0, latest;
    for (let step = 0; step < count; step++) {
      latest = await inspectMounted(route, step);
      latest.posts.forEach(post => { if (post.id) ids.add(post.id); });
      const x = Math.max(20, Math.min(1420, (latest.column?.x || 0) + (latest.column?.width || 700) / 2));
      await page.send("Input.dispatchMouseEvent", { type:"mouseWheel", x, y:700, deltaX:0, deltaY:750 });
      await delay(500);
      const next = await page.evaluate("scrollY");
      if (next !== latest.scrollY) moved++;
      else await delay(800);
    }
    assert.ok(moved > 0, `Live scrolling must move ${route}`);
    assert.ok(ids.size > 4, `Live scrolling must sample multiple posts on ${route}`);
    visited.push({ route, scrollSteps:count, moved, uniquePosts:ids.size, finalScrollY:await page.evaluate("scrollY") });
    await writeFile(join(artifacts,"live-audit-progress.json"),JSON.stringify({complete:false,visited,uniquePosts:unique.size,stableComparisons:comparisons,labeledComparisons:labeled,organicVideoComparisons:videos,flags,posts:[...unique.values()]},null,2),{mode:0o600});
    await validateRead();
    await capture(`live-${route.slice(1)}`);
    console.log(`PASS scrolled ${route}: ${ids.size} unique posts over ${count} steps`);
  }
  await check("authenticated scrolling filters labeled posts and preserves stable organic posts", async () => {
    assert.ok(comparisons > 0);
    assert.ok(unique.size > 25, "Audit must collect a substantial live sample");
    assert.equal(flags.some(flag => flag.horizontalOverflow || flag.searchOverlap), false, "Live feed layout must remain bounded");
  });

  const geometry = [];
  await navigate("https://x.com/home");
  await receipt();
  for (const width of [1440, 1280, 960, 600]) {
    await page.send("Emulation.setDeviceMetricsOverride", {width,height:1000,deviceScaleFactor:1,mobile:false});
    await delay(300);
    const state = await page.evaluate(sample);
    geometry.push({ width, horizontalOverflow:state.horizontalOverflow, searchOverlap:state.searchOverlap, column:state.column });
    assert.equal(state.horizontalOverflow, false, `No overflow at ${width}px`);
    assert.equal(state.searchOverlap, false, `No floating search overlap at ${width}px`);
  }
  await page.send("Emulation.setDeviceMetricsOverride", {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const { runLiveFocusAudit, runLiveRecentMediaAudit } = await import("./live-focus.js");
  const focus = await runLiveFocusAudit({page,storage,check,navigate,capture});
  const recentMedia = await runLiveRecentMediaAudit({page,storage,check,navigate,capture});
  await validateRead();
  const labelCounts = Object.fromEntries(["ad","paid","ai"].map(kind => [kind,[...unique.values()].filter(post=>post[kind]).length]));
  const coverage = Object.fromEntries(Object.entries(labelCounts).map(([kind,count])=>[kind,count ? "observed" : "not observed in live sample; fixture coverage only"]));
  coverage.organicVideoPreservation = videos ? "observed" : "not observed in stable comparisons; fixture coverage only";
  const report = { passed:true, visited, uniquePosts:unique.size, labelCounts, coverage, stableComparisons:comparisons, labeledComparisons:labeled, organicVideoComparisons:videos, geometry, focus, recentMedia, flags, posts:[...unique.values()] };
  await writeFile(join(artifacts,"live-audit.json"),JSON.stringify(report,null,2),{mode:0o600});
  return report;
}
