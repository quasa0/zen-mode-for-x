import assert from "node:assert/strict";
import { MindfulScrollSession, normalizeScrollMinutes } from "../../../content-scripts/src/modules/utilities/mindfulScrollSession.js";

export async function runMindfulClockAudit(check) {
  await check("mindful clock requires scrolling rather than rendering", () => {
    const session = new MindfulScrollSession();
    for (let at = 0; at <= 600000; at += 1000) session.advance(at, true);
    assert.equal(session.elapsedMs, 0);
    session.recordScroll(600000, true);
    session.advance(605000, true);
    assert.equal(session.elapsedMs, 5000);
    session.snapshot(615000);
    assert.equal(session.elapsedMs, 5000, "Reading/rendering a snapshot must not advance time");
  });
  await check("mindful clock caps idle time and resets after a meaningful break", () => {
    const session = new MindfulScrollSession();
    session.recordScroll(0, true);
    session.advance(60000, true);
    assert.equal(session.elapsedMs, 15000);
    assert.equal(session.advance(135000, true).phase, "recovery");
    assert.equal(session.elapsedMs, 0);
    assert.equal(session.advance(140001, true).phase, "quiet");
  });
  await check("mindful clock pauses for hidden tabs and composing", () => {
    const session = new MindfulScrollSession();
    session.recordScroll(0, true);
    session.advance(5000, true);
    session.advance(6000, false);
    session.advance(7000, false);
    session.advance(8000, true);
    session.advance(10000, true);
    assert.equal(session.elapsedMs, 6000);
    session.recordScroll(10000, true);
    session.advance(12000, true);
    assert.equal(session.elapsedMs, 8000);
  });
  await check("mindful recovery waits until a hidden or composing page returns", () => {
    const session = new MindfulScrollSession();
    session.recordScroll(0, true);
    session.advance(4000, false);
    session.advance(124001, false);
    assert.equal(session.elapsedMs, 0);
    assert.equal(session.snapshot(150000).phase, "quiet");
    assert.equal(session.advance(200000, true).phase, "recovery");
    assert.equal(session.advance(205001, true).phase, "quiet");
  });
  await check("mindful clock enters amber at 80 percent and red at the limit", () => {
    const session = new MindfulScrollSession({ minutes: 1 });
    for (let at = 0; at <= 40000; at += 10000) session.recordScroll(at, true);
    assert.equal(session.advance(47999, true).phase, "quiet");
    assert.equal(session.advance(48000, true).phase, "near");
    session.recordScroll(50000, true);
    assert.equal(session.advance(60000, true).phase, "limit");
    assert.equal(session.elapsedMs, 60000);
  });
  await check("mindful snooze preserves active time and sends no catch-up burst", () => {
    const session = new MindfulScrollSession({ minutes: 1 });
    for (let at = 0; at <= 60000; at += 10000) session.recordScroll(at, true);
    assert.equal(session.snooze(60000).phase, "quiet");
    for (let at = 70000; at <= 350000; at += 10000) session.recordScroll(at, true);
    assert.equal(session.snapshot(350000).phase, "quiet");
    assert.equal(session.recordScroll(360000, true).phase, "limit");
    assert.equal(session.elapsedMs, 360000);
    session.advance(1000000, true);
    assert.equal(session.elapsedMs, 0, "A delayed timer counts only the recent-scroll window before the break resets it");
  });
  await check("mindful break, resume and invalid settings keep a bounded session", () => {
    const session = new MindfulScrollSession({ minutes: 1 });
    session.recordScroll(0, true);
    session.advance(5000, true);
    assert.equal(session.takeBreak(5000).phase, "recovery");
    session.recordScroll(10000, true);
    assert.equal(session.advance(20000, true).phase, "break");
    assert.equal(session.elapsedMs, 0);
    session.reset(20000);
    session.advance(40000, true);
    assert.equal(session.elapsedMs, 0);
    session.recordScroll(40000, true);
    session.advance(45000, true);
    session.advance(30000, true);
    assert.equal(session.elapsedMs, 5000, "A backwards timestamp must not add negative or repeated time");
    assert.equal(normalizeScrollMinutes(0), 1);
    assert.equal(normalizeScrollMinutes(121), 120);
    assert.equal(normalizeScrollMinutes("bad"), 10);
  });
}

const host = "document.getElementById('mt-mindful-scrolling')";
const element = (id) => `${host}.shadowRoot.getElementById(${JSON.stringify(id)})`;

export async function runMindfulAudit({ page, popup, storage, check, loadFixture, capture }) {
  await runMindfulClockAudit(check);
  const contexts = new Map();
  const onEvent = (event) => {
    if (event.sessionId === page.sessionId && event.method === "Runtime.executionContextCreated") {
      const context = event.params.context;
      if (!context.auxData?.isDefault && context.origin?.startsWith("chrome-extension://")) contexts.set(context.id, context);
    }
  };
  page.browser.on("event", onEvent);
  let restoreClock;
  try {
    await storage({ mindfulScrolling: "off", writerMode: "off", scrollLimitMinutes: 1, scrollReminderIntensity: "gentle" });
    await loadFixture("mindful.html");
    await page.send("Page.bringToFront");
    await check("mindful scrolling stays absent when disabled", async () => assert.equal(await page.evaluate(`${host} === null`), true));
    await storage({ mindfulScrolling: "on" });
    await page.wait(host);
    const contextId = [...contexts.values()].find((context) => context.origin.includes(page.browser.extensionId))?.id;
    assert.ok(contextId, "The fixture must expose the extension's isolated execution context for its test clock");
    const isolated = async (expression) => {
      const result = await page.send("Runtime.evaluate", { expression, contextId, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    // This clock exists only in the disposable fixture's isolated world.
    await isolated("globalThis.__mindfulAuditNow = performance.now(); globalThis.__mindfulAuditDescriptor = Object.getOwnPropertyDescriptor(performance, 'now'); Object.defineProperty(performance, 'now', { configurable:true, value:() => globalThis.__mindfulAuditNow }); true");
    restoreClock = () => isolated("delete document.fullscreenElement; if (globalThis.__mindfulAuditDescriptor) Object.defineProperty(performance, 'now', globalThis.__mindfulAuditDescriptor); else delete performance.now; delete globalThis.__mindfulAuditNow; delete globalThis.__mindfulAuditDescriptor; true");
    const advance = (milliseconds) => isolated(`globalThis.__mindfulAuditNow += ${milliseconds}`);
    const scroll = async () => {
      const before = await page.evaluate("window.scrollY");
      await page.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 500, y: 400, deltaX: 0, deltaY: 120 });
      await page.wait(`window.scrollY !== ${before}`);
    };

    await check("mindful popup persists numeric limits and reminder intensity", async () => {
      await popup.evaluate("document.getElementById('tab-focus').click()");
      await popup.wait("document.getElementById('scrollLimitMinutes') && !document.getElementById('scrollLimitMinutes').disabled");
      const editMinutes = async (value) => {
        await popup.send("Page.bringToFront");
        await popup.evaluate("(() => { const input = document.getElementById('scrollLimitMinutes'); input.focus(); input.select(); })()");
        await popup.send("Input.insertText", { text: String(value) });
        await popup.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
        await popup.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
      };
      await editMinutes(2);
      await popup.wait("document.getElementById('scrollLimitMinutes').value === '2'");
      const saved = await popup.send("Extensions.getStorageItems", { id: page.browser.extensionId, storageArea: "local", keys: ["scrollLimitMinutes"] });
      assert.equal(saved.data.scrollLimitMinutes, 2);
      await editMinutes(121);
      await popup.wait("document.getElementById('scrollLimitMinutes').value === '120'");
      await popup.evaluate("document.querySelector('#scrollReminderIntensity [data-value=clear]').click(); true");
      await page.wait(`${host}.dataset.intensity === 'clear'`);
      await storage({ scrollLimitMinutes: 1, scrollReminderIntensity: "gentle", mindfulScrolling: "off" });
      await page.wait(`${host} === null`);
      await storage({ mindfulScrolling: "on" });
      await page.wait(`${host}?.dataset.phase === 'quiet'`);
      await page.send("Page.bringToFront");
    });

    await check("mindful DOM changes, programmatic scrolling and captures do not start the clock", async () => {
      for (let index = 0; index < 7; index++) {
        await advance(10000);
        await page.evaluate(`document.querySelector('main').appendChild(document.createElement('div')); window.scrollTo(0, ${index * 20});`);
        await page.evaluate("new Promise(resolve => setTimeout(resolve, 1100))");
        assert.equal(await page.evaluate(`${host}.dataset.phase`), "quiet");
      }
      await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      assert.equal(await page.evaluate(`${host}.dataset.phase`), "quiet");
    });

    await check("mindful real feed scrolling reaches amber and red without changing native content", async () => {
      for (let index = 0; index <= 6; index++) {
        await advance(10000);
        await scroll();
        if (index === 5) {
          await page.wait(`${host}.dataset.phase === 'near'`);
          await capture?.("mindful-near");
        }
      }
      await page.wait(`${host}.dataset.phase === 'limit'`);
      assert.equal(await page.evaluate(`${element("cue")}.hidden`), false);
      assert.equal(await page.evaluate(`${element("announcement")}.getAttribute('role')`), "status");
      const geometry = await page.evaluate(`(() => { const edge = ${element("edge")}; const r = edge.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight,pointerEvents:getComputedStyle(edge).pointerEvents}; })()`);
      assert.deepEqual(geometry, { x: 0, y: 0, width: geometry.viewportWidth, height: geometry.viewportHeight, viewportWidth: geometry.viewportWidth, viewportHeight: geometry.viewportHeight, pointerEvents: "none" });
      assert.equal(await page.evaluate(`document.elementFromPoint(500,400) !== ${host}`), true);
      assert.equal(await page.evaluate("window.fixtureNativeArticle.isConnected && window.fixtureNativeAction.isConnected"), true);
      await page.evaluate("window.fixtureNativeAction.click()");
      assert.equal(await page.evaluate("window.fixtureNativeClickCount"), 1);
      assert.equal(await page.evaluate("getComputedStyle(document.getElementById('fixture-feed')).filter"), "none");
      assert.equal(await page.evaluate("getComputedStyle(document.getElementById('fixture-feed')).transform"), "none");
      await capture?.("mindful-limit");
    });

    await check("mindful reduced motion is static and composing hides the overlay", async () => {
      await storage({ scrollReminderIntensity: "clear" });
      await page.wait(`${host}.dataset.intensity === 'clear'`);
      await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      assert.equal(await page.evaluate(`getComputedStyle(${element("edge")}).animationName`), "none");
      assert.equal(await page.evaluate(`getComputedStyle(${element("edge")}).transitionDuration`), "0s");
      await page.evaluate("document.getElementById('composer').hidden = false; document.getElementById('composer-editor').focus()");
      await page.wait(`${host}.hidden`);
      await advance(10000);
      await page.evaluate("document.getElementById('composer-editor').blur(); document.getElementById('composer').hidden = true");
      await page.wait(`!${host}.hidden`);
      await isolated("Object.defineProperty(document, 'fullscreenElement', { configurable:true, get:() => document.documentElement }); true");
      await page.evaluate("document.querySelector('main').appendChild(document.createElement('div'))");
      await page.wait(`${host}.hidden`);
      await isolated("delete document.fullscreenElement; true");
      await page.evaluate("document.querySelector('main').appendChild(document.createElement('div'))");
      await page.wait(`!${host}.hidden`);
      await page.send("Emulation.setEmulatedMedia", { features: [] });
    });

    await check("mindful snooze and break are local choices with a recovery cue", async () => {
      await page.evaluate(`${element("snooze")}.click()`);
      await page.wait(`${host}.dataset.phase === 'quiet'`);
      await advance(300000);
      await scroll();
      // A meaningful break during snooze resets the session rather than restoring a stale warning.
      await page.wait(`${host}.dataset.phase === 'recovery'`);
      await advance(6000);
      await scroll();
      for (let index = 0; index < 6; index++) { await advance(10000); await scroll(); }
      await page.wait(`${host}.dataset.phase === 'limit'`);
      await page.evaluate(`${element("break")}.click()`);
      await page.wait(`${host}.dataset.phase === 'recovery' && ${element("break")}.textContent === 'Resume'`);
      await advance(6000);
      await scroll();
      await page.wait(`${host}.dataset.phase === 'break'`);
      await page.evaluate(`${element("break")}.click()`);
      await page.wait(`${host}.dataset.phase === 'recovery' && ${element("break")}.textContent === 'Take a break'`);
    });

    await check("mindful replaces a removed overlay without leaving its old timer or listeners", async () => {
      await page.evaluate(`window.fixtureRemovedMindfulHost = ${host}; window.fixtureRemovedMindfulHost.remove(); true`);
      await storage({ scrollLimitMinutes: 2 });
      await page.wait(`${host} && ${host} !== window.fixtureRemovedMindfulHost`);
      await page.evaluate("new Promise(resolve => setTimeout(resolve, 1100))");
      assert.equal(await page.evaluate("document.querySelectorAll('#mt-mindful-scrolling').length"), 1);
      assert.equal(await page.evaluate("window.fixtureRemovedMindfulHost.isConnected"), false);
    });

    await check("mindful disabling removes the overlay and prevents reinsertion", async () => {
      await storage({ mindfulScrolling: "off" });
      await page.wait(`${host} === null`);
      await advance(600000);
      await page.evaluate("document.querySelector('main').appendChild(document.createElement('div'))");
      await page.evaluate("new Promise(resolve => setTimeout(resolve, 1100))");
      assert.equal(await page.evaluate("document.querySelectorAll('#mt-mindful-scrolling').length"), 0);
      assert.equal(await page.evaluate("window.fixtureNativeArticle.isConnected && window.fixtureNativeAction.isConnected"), true);
    });
  } finally {
    page.browser.off("event", onEvent);
    await restoreClock?.().catch(() => {});
    await page.send("Emulation.setEmulatedMedia", { features: [] });
    await storage({ mindfulScrolling: "off" });
  }
  return ["mindfulScrolling", "scrollLimitMinutes", "scrollReminderIntensity"].map((setting) => ({ setting, status: "pass", live: "optional local reminder; fixture-tested" }));
}
