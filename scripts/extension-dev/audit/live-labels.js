import assert from "node:assert/strict";

const filters = {
  ad: "removePromotedPosts",
  paid: "removePaidPartnershipPosts",
  ai: "removeAiPosts",
};
const filtersOff = Object.fromEntries(Object.values(filters).map((key) => [key, "off"]));
const defaultUrl = "https://x.com/quasa0/status/2105674966675141064";
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

// Keep native references inside the page. Return only label evidence and IDs;
// DOM objects cannot be serialized through Runtime.evaluate reliably.
const nativeInspector = `(() => {
  const postSelector = '[data-testid="tweet"]';
  const quoteSelector = '[data-testid="quoteTweet"], [data-testid="card.wrapper"], div[role="link"]';
  const userContentSelector = '[data-testid="tweetText"], [data-testid="User-Name"], [data-testid^="UserAvatar-"]';
  const normalize = value => (value || '').replace(/\\s+/g, ' ').trim();
  const own = (element, post) => element.closest(postSelector) === post && !element.closest(quoteSelector);
  const platformLabel = (element, post) => own(element, post) && !element.closest(userContentSelector);
  const statusId = post => {
    // Native timestamps can sit within User-Name. Only quote/nested ownership
    // exclusions apply here; author-content exclusions apply to badge text.
    const links = [...post.querySelectorAll('a[href*="/status/"]')].filter(link => {
      if (!own(link, post)) return false;
      try {
        const url = new URL(link.href);
        return url.origin === location.origin && /^\\/[^/]+\\/status\\/\\d+(?:\\/|$)/.test(url.pathname);
      } catch { return false; }
    });
    const link = links.find(candidate => candidate.querySelector('time')) || links[0];
    return link && new URL(link.href).pathname.match(/\\/status\\/(\\d+)/)?.[1] || null;
  };
  const labels = post => {
    const disclosures = [...post.querySelectorAll('[data-testid="contentDisclosureButton"]')]
      .filter(element => platformLabel(element, post))
      .flatMap(element => [element, ...element.querySelectorAll('span')])
      .map(element => normalize(element.textContent));
    disclosures.push(...[...post.querySelectorAll('span')].filter(element => platformLabel(element, post) && !element.children.length && element.parentElement.querySelector(':scope > svg')).map(element => normalize(element.textContent)));
    const adBadges = [...post.querySelectorAll('span')].filter(element =>
      platformLabel(element, post) && !element.children.length &&
      !element.closest('[data-testid="contentDisclosureButton"]') &&
      /^(Ad|Promoted|Boosted)$/i.test(normalize(element.textContent)))
      .map(element => normalize(element.textContent));
    return {
      ad: !!post.closest('[data-testid="placementTracking"]') || adBadges.length > 0,
      paid: disclosures.some(text => /^(Paid partnership|Paid promotion)(?: with .+)?$/i.test(text)),
      ai: disclosures.some(text => /^(Made with AI|AI-generated)$/i.test(text)),
      evidence: [...new Set([...adBadges, ...disclosures])],
    };
  };
  const visible = element => {
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    return !!(rect.width && rect.height && style.display !== 'none' && style.visibility !== 'hidden');
  };
  const posts = () => [...document.querySelectorAll('[data-testid="primaryColumn"] ' + postSelector)]
    .filter(post => !post.parentElement?.closest(postSelector + ', ' + quoteSelector));
  return { statusId, labels, visible, posts };
})()`;

const remember = `(() => {
  const inspect = ${nativeInspector};
  window.__zenLiveLabelPosts = inspect.posts().map(post => ({
    post, id: inspect.statusId(post), labels: inspect.labels(post), visible: inspect.visible(post),
  })).filter(entry => entry.id && entry.visible);
  return window.__zenLiveLabelPosts.map(({id, labels, visible}, index) => ({index, id, labels, visible}));
})()`;

const sample = `(() => {
  const inspect = ${nativeInspector};
  const mounted = new Set(inspect.posts());
  return (window.__zenLiveLabelPosts || []).map((entry, index) => {
    const connected = entry.post.isConnected && mounted.has(entry.post);
    const id = connected ? inspect.statusId(entry.post) : null;
    const labels = connected ? inspect.labels(entry.post) : null;
    const sameLabels = !!labels && ['ad','paid','ai'].every(kind => labels[kind] === entry.labels[kind]);
    return { index, id:entry.id, connected, sameStatus:id === entry.id, sameLabels, labels,
      visible:connected && inspect.visible(entry.post) };
  });
})()`;

export async function runLiveLabelAudit({ page, storage, navigate, receipt, capture, check, url = defaultUrl }) {
  const targetUrl = new URL(url);
  assert.equal(targetUrl.origin, "https://x.com", "Live label audits require an X URL");
  const targetStatusId = targetUrl.pathname.match(/^\/[^/]+\/status\/(\d+)/)?.[1] || null;
  let primaryError, result;
  try {
    await storage({ extensionStatus: "on", writerMode: "off", ...filtersOff });
    await navigate(targetUrl.href);
    await receipt();
    await page.wait(`(() => {
      const inspect = ${nativeInspector};
      const posts = inspect.posts();
      return ${targetStatusId ? `posts.some(post => inspect.statusId(post) === ${JSON.stringify(targetStatusId)})` : "posts.some(post => inspect.statusId(post))"};
    })()`, 30000);
    await page.wait("!document.getElementById('mt-style-postFilters')");
    await settle();
    const baseline = await page.evaluate(remember);
    assert.ok(baseline.length > 0, "Fresh native document must contain visible posts with their own status links");
    const target = targetStatusId ? baseline.find(post => post.id === targetStatusId) : null;
    if (targetStatusId) assert.ok(target, "The requested native status post must be visible before testing filters");
    await capture("live-labels-native");

    const rows = [];
    for (const [kind, key] of Object.entries(filters)) {
      await check(`live ${kind} filter hides only its owned native label and restores stable posts`, async () => {
        await storage({ ...filtersOff, [key]: "on" });
        await page.wait("!!document.getElementById('mt-style-postFilters')");
        await settle();
        const enabled = await page.evaluate(sample);
        const stable = enabled.filter(post => post.connected && post.sameStatus && post.sameLabels);
        assert.ok(stable.length > 0, `${kind}: no stable native posts remained for a meaningful comparison`);
        for (const post of stable) {
          assert.equal(post.visible, !post.labels[kind], `${kind}: visibility must follow this post's own native label for status ${post.id}`);
        }
        await capture(`live-labels-${kind}-enabled`);
        await storage(filtersOff);
        await page.wait("!document.getElementById('mt-style-postFilters')");
        await settle();
        const restored = await page.evaluate(sample);
        const restoredByIndex = new Map(restored.map(post => [post.index, post]));
        const stableRestored = stable.filter(post => {
          const after = restoredByIndex.get(post.index);
          return after?.connected && after.sameStatus && after.sameLabels;
        });
        assert.ok(stableRestored.length > 0, `${kind}: no stable native posts remained to verify restoration`);
        for (const post of stableRestored) assert.equal(restoredByIndex.get(post.index).visible, true, `${kind}: disabling must restore native status ${post.id}`);
        rows.push({ kind, setting:key, stableCount:stable.length,
          filteredCount:stable.filter(post => post.labels[kind]).length,
          preservedCount:stable.filter(post => !post.labels[kind]).length,
          restoredCount:stableRestored.length,
          skippedCount:baseline.length - stable.length,
          filteredStatusIds:stable.filter(post => post.labels[kind]).map(post => post.id) });
      });
    }
    const observedCoverage = Object.fromEntries(Object.keys(filters).map(kind => {
      const observedCount = baseline.filter(post => post.labels[kind]).length;
      const verifiedCount = rows.find(row => row.kind === kind).filteredCount;
      return [kind, { observedCount, verifiedCount,
        status:verifiedCount ? "observed and verified" : observedCount ? "observed; native nodes changed before verification" : "not observed in this live document; no live claim" }];
    }));
    await capture("live-labels-restored");
    result = { passed:true, kind:"labels", url:targetUrl.href, nativePostCount:baseline.length,
      stableCount:rows.reduce((sum, row) => sum + row.stableCount, 0), observedCoverage, filters:rows,
      target:target && { statusId:target.id, labels:target.labels }, nativePosts:baseline };
  } catch (error) {
    primaryError = error;
  } finally {
    const cleanupErrors = [];
    try { await storage(filtersOff); } catch (error) { cleanupErrors.push(error); }
    try { await page.evaluate("delete window.__zenLiveLabelPosts; true"); } catch (error) { cleanupErrors.push(error); }
    if (primaryError) {
      if (cleanupErrors.length) primaryError.cleanupErrors = cleanupErrors.map(error => error.message);
    } else if (cleanupErrors.length) primaryError = new AggregateError(cleanupErrors, "Live label audit cleanup failed");
  }
  if (primaryError) throw primaryError;
  return result;
}
