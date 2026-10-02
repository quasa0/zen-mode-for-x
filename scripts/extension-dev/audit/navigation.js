import assert from "node:assert/strict";

const controls = [
  ["sidebarLogo", "#nav-logo", "present"],
  ["homeButton", "#nav-home", "present"],
  ["exploreButton", "#nav-explore", "present"],
  ["notificationsButton", "#nav-notifications", "present"],
  ["messagesButton", "#nav-messages", "present"],
  ["grokButton", "#nav-grok", "present"],
  ["xPremiumButton", "#nav-premium", "present"],
  ["listsButton", '.mt-sidebar-button[aria-label="Lists"]', "injected"],
  ["bookmarksButton", "#nav-bookmarks", "not present in live navigation"],
  ["jobsButton", "#nav-jobs", "not present in live navigation"],
  ["communitiesButton", '.mt-sidebar-button[aria-label="Communities"]', "injected"],
  ["articles", "#nav-articles", "not present in live navigation"],
  ["topicsButton", '.mt-sidebar-button[aria-label="Topics"]', "not present in live navigation; injected when enabled"],
  ["verifiedOrgsButton", "#nav-verified-orgs", "not present in live navigation"],
  ["zenWriterModeButton", '.mt-sidebar-button[aria-label="Zen Writer Mode"]', "injected"],
  ["profileButton", "#nav-profile", "present"],
];

const visible = (selector) => `(() => {
  const element = document.querySelector(${JSON.stringify(selector)});
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
})()`;
const button = (name) => `document.querySelector('#primary-navigation > .mt-sidebar-button[aria-label=${JSON.stringify(name)}]')`;
const triggerMutation = "document.getElementById('fixture-mutations').appendChild(document.createElement('div'))";

export async function runNavigationAudit({ page, popup, storage, check, loadFixture }) {
  const results = [];
  await storage({
    extensionStatus: "on", writerMode: "off", navigationButtonsLabels: "always",
    navigationCenter: "off", ...Object.fromEntries(controls.map(([key]) => [key, "on"])),
  });
  await loadFixture("navigation.html");
  await page.wait(`${button("Zen Writer Mode")} && ${button("Topics")}`);

  for (const [key, selector, live] of controls) {
    await check(`navigation ${key} hides and restores`, async () => {
      await page.wait(visible(selector));
      await storage({ [key]: "off" });
      await page.wait(`!${visible(selector)}`);
      if (key === "articles") assert.equal(await page.evaluate(visible("#outside-articles")), true, "Articles must only affect the sidebar");
      await storage({ [key]: "on" });
      await page.wait(visible(selector));
    });
    results.push({ setting: key, status: "pass", live });
  }

  await check("injected navigation is scoped, accessible and idempotent", async () => {
    assert.equal(await page.evaluate("document.querySelectorAll('#primary-navigation > .mt-sidebar-button').length"), 4);
    assert.equal(await page.evaluate("window.fixtureOutsideNodes.every(node => node.isConnected && node.parentElement.id === 'outside-navigation')"), true);
    assert.equal(await page.evaluate("document.querySelectorAll('#outside-navigation > .mt-sidebar-button').length"), 0);
    assert.equal(await page.evaluate("document.querySelector('#nav-premium') === window.fixtureNativePremium"), true);
    assert.equal(await page.evaluate(`${button("Lists")}.getAttribute('href')`), "/fixture_account/lists");
    assert.equal(await page.evaluate(`${button("Communities")}.getAttribute('href')`), "/fixture_account/communities");
    assert.equal(await page.evaluate(`${button("Topics")}.getAttribute('href')`), "/fixture_account/topics");
    assert.equal(await page.evaluate(`${button("Zen Writer Mode")}.tagName`), "BUTTON");
    assert.equal(await page.evaluate(`${button("Zen Writer Mode")}.type`), "button");
    assert.equal(await page.evaluate(`${button("Zen Writer Mode")}.tabIndex`), 0);
    await page.evaluate(`window.fixtureInjectedNodes = [...document.querySelectorAll('#primary-navigation > .mt-sidebar-button')]; ${triggerMutation}`);
    // A later storage update waits for the dynamic feature pass to settle.
    await storage({ unreadCountBadge: "on" });
    await page.wait("!document.getElementById('mt-style-unreadCountBadge')");
    assert.equal(await page.evaluate("window.fixtureInjectedNodes.every(node => node.isConnected)"), true);
  });

  await check("label settings restore native and injected labels", async () => {
    await storage({ navigationButtonsLabels: "never" });
    await page.wait("getComputedStyle(document.querySelector('#nav-home .nav-label')).display === 'none'");
    assert.equal(await page.evaluate("getComputedStyle(document.querySelector('#primary-navigation > .mt-sidebar-button .nav-label')).display"), "none");
    assert.equal(await page.evaluate("getComputedStyle(document.getElementById('account-label')).display"), "none");
    await storage({ navigationButtonsLabels: "hover" });
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1000, y: 500 });
    await page.wait("getComputedStyle(document.querySelector('#nav-home .nav-label')).opacity === '0'");
    const point = await page.evaluate("(() => { const r = document.getElementById('nav-home').getBoundingClientRect(); return {x:r.left + 8, y:r.top + 8}; })()");
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
    await page.wait("getComputedStyle(document.querySelector('#nav-home .nav-label')).opacity === '1'");
    await storage({ navigationButtonsLabels: "never" });
    await page.wait("!document.getElementById('mt-style-hideLabels') && !document.getElementById('mt-style-showLabelsOnHover')");
    await storage({ navigationButtonsLabels: "always" });
    await page.wait("getComputedStyle(document.querySelector('#nav-home .nav-label')).display !== 'none'");
    assert.equal(await page.evaluate("getComputedStyle(document.querySelector('#nav-home .nav-label')).opacity"), "1");
    assert.equal(await page.evaluate("getComputedStyle(document.getElementById('account-label')).display !== 'none'"), true);
  });
  results.push({ setting: "navigationButtonsLabels", status: "pass", live: "present" });

  await check("navigation centering restores its previous alignment", async () => {
    await storage({ navigationCenter: "on" });
    await page.wait("getComputedStyle(document.getElementById('navigation-stack')).justifyContent === 'center'");
    assert.equal(await page.evaluate("getComputedStyle(document.getElementById('navigation-stack')).paddingTop"), "0px");
    await storage({ navigationCenter: "off" });
    await page.wait("getComputedStyle(document.getElementById('navigation-stack')).justifyContent === 'flex-start'");
    assert.equal(await page.evaluate("getComputedStyle(document.getElementById('navigation-stack')).paddingTop"), "12px");
  });
  results.push({ setting: "navigationCenter", status: "pass", live: "present" });

  await check("unread badge setting restores navigation and account badges", async () => {
    await storage({ unreadCountBadge: "off" });
    await page.wait(`!${visible("#nav-badge")} && !${visible("#account-badge")}`);
    await storage({ unreadCountBadge: "on" });
    await page.wait(`${visible("#nav-badge")} && ${visible("#account-badge")}`);
  });
  results.push({ setting: "unreadCountBadge", status: "pass", live: "no badge in captured live markup" });

  await check("Grok drawer hiding preserves the explicit-open exception", async () => {
    await storage({ hideGrokDrawer: "on" });
    await page.wait(`!${visible("#grok-drawer")}`);
    assert.equal(await page.evaluate(visible("#grok-drawer-enabled")), true);
    await storage({ hideGrokDrawer: "off" });
    await page.wait(visible("#grok-drawer"));
  });
  results.push({ setting: "hideGrokDrawer", status: "pass", live: "drawer not open in captured live markup" });

  const waitForWriterMode = async (enabled) => {
    await page.wait(`${button("Zen Writer Mode")}.getAttribute('aria-pressed') === '${enabled}' && ${enabled ? "!!" : "!"}document.getElementById('mt-style-writerMode')`);
    const { data } = await popup.send("Extensions.getStorageItems", { id: page.browser.extensionId, storageArea: "local", keys: ["writerMode"] });
    assert.equal(data.writerMode, enabled ? "on" : "off");
  };
  await check("Zen button toggles local writer mode with click activation", async () => {
    await storage({ writerMode: "off" });
    await waitForWriterMode(false);
    await page.evaluate(`${button("Zen Writer Mode")}.click()`);
    await waitForWriterMode(true);
    await page.evaluate(`${button("Zen Writer Mode")}.click()`);
    await waitForWriterMode(false);
  });

  await check("Zen button toggles local writer mode once with keyboard activation", async () => {
    let stage = "focus";
    try {
      await storage({ writerMode: "off" });
      await waitForWriterMode(false);
      await page.send("Page.bringToFront");
      await page.evaluate(`(() => {
        const zen = ${button("Zen Writer Mode")};
        window.fixtureZenKeyEvents = [];
        window.fixtureZenEventsController = new AbortController();
        for (const type of ['keydown', 'keypress', 'keyup', 'click']) {
          zen.addEventListener(type, event => {
            window.fixtureZenKeyEvents.push({ type: event.type, key: event.key, charCode: event.charCode, trusted: event.isTrusted });
          }, { signal: window.fixtureZenEventsController.signal });
        }
        zen.focus();
      })()`);
      await page.wait(`document.hasFocus() && document.activeElement === ${button("Zen Writer Mode")}`);
      stage = "Enter activation";
      // Native button Enter activation needs a keypress carrying carriage return.
      await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" });
      await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await waitForWriterMode(true);
      assert.equal(await page.evaluate("window.fixtureZenKeyEvents.filter(event => event.type === 'click' && event.trusted).length"), 1);
      assert.equal(await page.evaluate("document.activeElement === document.getElementById('fixture-editor')"), true);
      stage = "click deactivation";
      await page.evaluate(`${button("Zen Writer Mode")}.click()`);
      await waitForWriterMode(false);
    } catch (error) {
      const diagnostics = await Promise.allSettled([
        popup.send("Extensions.getStorageItems", { id: page.browser.extensionId, storageArea: "local", keys: ["writerMode"] }),
        page.evaluate(`(() => {
          const active = document.activeElement;
          return {
            focused: document.hasFocus(), visibility: document.visibilityState,
            activeElement: active && { tag: active.tagName, id: active.id, label: active.getAttribute('aria-label'), testid: active.getAttribute('data-testid') },
            sidebarAria: ${button("Zen Writer Mode")}?.getAttribute('aria-pressed'),
            writerStyle: !!document.getElementById('mt-style-writerMode'),
            composer: !!document.querySelector('#fixture-composer.mt-writer-composer'),
            events: window.fixtureZenKeyEvents
          };
        })()`),
      ]);
      console.error(`Zen keyboard diagnostics: ${JSON.stringify({ stage, storage: diagnostics[0].status === "fulfilled" ? diagnostics[0].value.data : diagnostics[0].reason?.message, dom: diagnostics[1].status === "fulfilled" ? diagnostics[1].value : diagnostics[1].reason?.message })}`);
      throw error;
    } finally {
      await page.evaluate("window.fixtureZenEventsController?.abort(); delete window.fixtureZenEventsController").catch(() => {});
    }
  });

  await check("responsive injection preserves native nodes and removes only owned duplicates", async () => {
    await page.evaluate(`(() => {
      const list = ${button("Lists")};
      const native = list.cloneNode(true);
      native.id = 'native-lists'; native.classList.remove('mt-sidebar-button');
      native.setAttribute('aria-label', 'Localized Lists');
      native.addEventListener('click', () => window.fixtureNativeClicks++);
      list.after(native); window.fixtureNativeLists = native;
      document.getElementById('nav-premium').setAttribute('aria-label', 'Localized Premium');
      document.querySelector('#nav-profile .nav-label').remove();
    })()`);
    await page.evaluate(triggerMutation);
    await page.wait(`!${button("Lists")}`);
    assert.equal(await page.evaluate("document.getElementById('native-lists') === window.fixtureNativeLists"), true);
    assert.equal(await page.evaluate("document.getElementById('nav-premium') === window.fixtureNativePremium"), true);
    await page.evaluate("document.getElementById('native-lists').click(); document.getElementById('nav-premium').click()");
    assert.equal(await page.evaluate("window.fixtureNativeClicks"), 2);
    assert.equal(await page.evaluate("[...document.querySelectorAll('#primary-navigation > .mt-sidebar-button')].every(node => !node.querySelector('span'))"), true);
    await page.evaluate("document.getElementById('native-lists').remove()");
    await page.evaluate(triggerMutation);
    await page.wait(button("Lists"));
    await page.evaluate(`(() => { const original = ${button("Lists")}; original.after(original.cloneNode(true)); })()`);
    await page.evaluate(triggerMutation);
    await page.wait("document.querySelectorAll('#primary-navigation > .mt-sidebar-button[aria-label=Lists]').length === 1");
  });

  // Reload the fixture to restore the full native label template.
  await loadFixture("navigation.html");
  await page.wait(button("Zen Writer Mode"));
  await check("Search and current Chat routes keep navigation in the document flow", async () => {
    for (const path of ["/search", "/i/chat", "/i/chat/fixture-room"]) {
      await page.evaluate(`history.pushState({}, '', ${JSON.stringify(path)}); ${triggerMutation}`);
      await page.wait("!document.getElementById('mt-style-navigation-position') && !!document.getElementById('mt-style-customDMsAndSearchStyle')");
      assert.equal(await page.evaluate("getComputedStyle(document.querySelector('header[role=banner]')).position"), "relative");
      assert.equal(await page.evaluate("getComputedStyle(document.querySelector('main[role=main]')).alignItems"), "flex-start");
    }
    await page.evaluate(`history.pushState({}, '', '/home'); ${triggerMutation}`);
    await page.wait("!!document.getElementById('mt-style-navigation-position') && !document.getElementById('mt-style-customDMsAndSearchStyle')");
    assert.equal(await page.evaluate("getComputedStyle(document.querySelector('header[role=banner]')).position"), "fixed");
  });
  return results;
}
