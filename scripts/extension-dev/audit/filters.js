import assert from "node:assert/strict";

const visible = (id) => `(() => { const e = document.getElementById(${JSON.stringify(id)}); const r = e?.getBoundingClientRect(); return !!(r?.width && r?.height) && getComputedStyle(e).visibility !== 'hidden'; })()`;

export async function runFiltersAudit({ page, storage, check, loadFixture }) {
  await storage({ removePromotedPosts: "on", removePaidPartnershipPosts: "off", removeAiPosts: "off" });
  await loadFixture("filters.html");
  await check("native ads collapse their cells while paid and AI toggles remain independent", async () => {
    for (const id of ["native-ad", "badge-ad", "native-ad-cell", "badge-ad-cell", "suggestion-ad"]) await page.wait(`!${visible(id)}`);
    for (const id of ["paid-post", "ai-post", "organic", "quote-discussion", "organic-video", "organic-video-post", "organic-suggestion"]) assert.equal(await page.evaluate(visible(id)), true, id);
    await storage({ removePromotedPosts: "off", removePaidPartnershipPosts: "on" });
    await page.wait(`!${visible("paid-cell")}`);
    for (const id of ["native-ad", "badge-ad", "ai-post"]) await page.wait(visible(id));
    await storage({ removePaidPartnershipPosts: "off", removeAiPosts: "on" });
    await page.wait(`!${visible("ai-cell")}`);
    await page.wait(`!${visible("ai-badge-cell")}`);
    await page.wait(visible("paid-post"));
  });
  await check("all post filters preserve ordinary text authors quotes and organic videos", async () => {
    await storage({ removePromotedPosts: "on", removePaidPartnershipPosts: "on", removeAiPosts: "on" });
    for (const id of ["native-ad", "badge-ad", "paid-post", "ai-post"]) await page.wait(`!${visible(id)}`);
    for (const id of ["organic", "quote-discussion", "nested-quote-post", "nested-quoted-post", "nonlabel-note", "organic-video", "organic-video-post", "organic-suggestion"]) assert.equal(await page.evaluate(visible(id)), true, id);
  });
  await check("late and recycled disclosure labels filter and restore without removing X nodes", async () => {
    await page.evaluate(`document.getElementById('late-posts').innerHTML = '<article id="late-paid" data-testid="tweet" role="article"><div data-testid="tweetText">Late partnership</div><button data-testid="contentDisclosureButton"><span>Paid partnership</span></button></article>'`);
    await page.wait(`!${visible("late-paid")}`);
    await page.evaluate("window.recycledNode = document.getElementById('recycled-post'); document.getElementById('recycled-label').firstChild.data = 'Made with AI'");
    await page.wait(`!${visible("recycled-cell")}`);
    await page.evaluate("document.getElementById('recycled-label').firstChild.data = 'No disclosure'");
    await page.wait(visible("recycled-cell"));
    await storage({ removePromotedPosts: "off", removePaidPartnershipPosts: "off", removeAiPosts: "off" });
    for (const id of ["native-ad", "badge-ad", "paid-post", "ai-post", "late-paid", "recycled-post"]) await page.wait(visible(id));
    assert.equal(await page.evaluate("document.getElementById('recycled-post') === window.recycledNode"), true);
    assert.equal(await page.evaluate("document.querySelectorAll('[data-mt-filter-reason]').length"), 0);
  });
  return ["removePromotedPosts", "removePaidPartnershipPosts", "removeAiPosts"].map(setting => ({ setting, status: "pass" }));
}
