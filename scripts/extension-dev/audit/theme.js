import assert from "node:assert/strict";

export async function runThemeAudit({ page, check, loadFixture }) {
  await loadFixture("timeline-features.html");
  await check("theme colors follow loading completion and light dark and dim changes", async () => {
    for (const [name, background, foreground] of [
      ["light", "rgb(255, 255, 255)", "rgb(15, 20, 25)"],
      ["dark", "rgb(0, 0, 0)", "rgb(231, 233, 234)"],
      ["dim", "rgb(21, 32, 43)", "rgb(247, 249, 249)"],
      ["light", "rgb(255, 255, 255)", "rgb(15, 20, 25)"],
    ]) {
      await page.evaluate(`document.body.style.backgroundColor = ${JSON.stringify(background)}; document.body.style.color = ${JSON.stringify(foreground)}; document.documentElement.dataset.theme = ${JSON.stringify(name)}; true`);
      await page.wait(`document.documentElement.style.getPropertyValue('--body-bg-color') === ${JSON.stringify(background)} && document.documentElement.style.getPropertyValue('--main-text-color') === ${JSON.stringify(foreground)}`);
    }
    await page.evaluate("document.querySelector('#home-header h2').outerHTML = '<h2 style=\"color:rgb(41,42,43)\">Native heading after loading</h2>'; true");
    await page.wait("document.documentElement.style.getPropertyValue('--main-text-color') === 'rgb(41, 42, 43)'");
    assert.equal(await page.evaluate("document.body.style.backgroundColor"), "rgb(255, 255, 255)");
    assert.equal(await page.evaluate("document.querySelector('#home-header h2').style.color"), "rgb(41, 42, 43)", "Theme extraction must preserve native styles");
  });
  return [];
}
