import assert from "node:assert/strict";

const visible = (selector) => `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return !!(rect.width && rect.height && style.display !== 'none' && style.visibility !== 'hidden'); })()`;
const cleanFavicon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
const modalText = "Modal @mention stays together.\nSecond line.\n\nAfter blank line.---typefully-split---Second thread post.";
const keys = ["aiSlopButton", "typefullyEnhancementsButtons", "interFont", "searchBar", "transparentSearch", "titleNotifications", "tweetButton", "customCss", "replyCount", "retweetCount", "likeCount", "followCount"];

export async function runInterfaceAudit({ page, popup, storage, check, loadFixture }) {
  const saved = await popup.evaluate(`new Promise(resolve => chrome.storage.local.get(${JSON.stringify(keys)}, resolve))`);
  const contexts = [];
  let draftContextId;
  let draftReadCount = 0;
  const contextListener = (event) => {
    if (event.sessionId === page.sessionId && event.method === "Runtime.executionContextCreated") contexts.push(event.params.context);
  };
  page.browser.on("event", contextListener);
  const fresh = async () => {
    await storage({ writerMode: "off", aiSlopButton: "off", interFont: "off", searchBar: "on", transparentSearch: "off", titleNotifications: "on", tweetButton: "on", typefullyEnhancementsButtons: "off", customCss: "" });
    await popup.send("Extensions.removeStorageItems", { id: page.browser.extensionId, storageArea: "local", keys: ["tp-box-seen:typefully-callout"] });
    contexts.length = 0;
    draftContextId = undefined;
    draftReadCount = 0;
    await loadFixture("interface.html");
  };
  const stubDraftWindows = async () => {
    const id = page.browser.extensionId;
    let context;
    for (const candidate of contexts.filter((candidate) => candidate.origin.startsWith(`chrome-extension://${id}`) || candidate.name.includes(id))) {
      const identity = await page.send("Runtime.evaluate", { contextId:candidate.id, expression:`globalThis.chrome?.runtime?.id === ${JSON.stringify(id)}`, returnByValue:true });
      if (!identity.exceptionDetails && identity.result.value === true) { context = candidate; break; }
    }
    assert.ok(context, `Cannot safely stub Typefully navigation without its isolated world. Contexts: ${JSON.stringify(contexts.map(({ origin, name, auxData }) => ({ origin, name, auxData })))}`);
    draftContextId = context.id;
    const result = await page.send("Runtime.evaluate", {
      contextId: context.id,
      returnByValue: true,
      expression: `window.__zenInterfaceDraftEvents = [];
      for (const type of ['keydown', 'click']) document.addEventListener(type, event => {
        const control = event.target instanceof Element && event.target.closest('[id^=typefully]');
        if (control) window.__zenInterfaceDraftEvents.push({type, key:event.key, trusted:event.isTrusted, targetId:control.id, focusedId:document.activeElement?.id});
      }, true);
      window.__zenInterfaceDraftStub = (url, target, features) => {
        const marker = document.createElement('output');
        marker.className = 'fixture-typefully-open';
        marker.hidden = true;
        marker.dataset.url = String(url);
        marker.dataset.features = String(features);
        document.body.appendChild(marker);
        return null;
      };
      window.open = window.__zenInterfaceDraftStub;
      window.open === window.__zenInterfaceDraftStub;`,
    });
    assert.equal(result.exceptionDetails, undefined);
    assert.equal(result.result.value, true, "Typefully's current isolated world must retain the draft-window stub");
  };
  const draftDiagnostics = async () => {
    const diagnostics = {};
    try {
      diagnostics.page = await page.evaluate("({focusedTag:document.activeElement?.tagName,focusedId:document.activeElement?.id,documentFocused:document.hasFocus(),editorCount:document.querySelectorAll('[data-testid=primaryColumn] [contenteditable=true][data-testid^=tweetTextarea_]').length})");
      diagnostics.setting = await popup.evaluate("new Promise(resolve => chrome.storage.local.get('typefullyEnhancementsButtons', data => resolve(data.typefullyEnhancementsButtons)))");
      if (draftContextId !== undefined) {
        const isolated = await page.send("Runtime.evaluate", { contextId:draftContextId, returnByValue:true, expression:"({extensionId:chrome.runtime.id,openType:typeof window.open,sameStub:window.open === window.__zenInterfaceDraftStub,enhancementsEnabled:typeof enhancementsEnabled === 'undefined' ? null : enhancementsEnabled,draftReaderType:typeof getCurrentTextAndSendToTypefully,editorCount:document.querySelectorAll('[data-testid=primaryColumn] [contenteditable=true][data-testid^=tweetTextarea_]').length,events:window.__zenInterfaceDraftEvents})" });
        diagnostics.isolated = isolated.exceptionDetails || isolated.result.value;
      }
    } catch (error) { diagnostics.error = error.message; }
    return diagnostics;
  };
  const lastDraft = async () => {
    try { await page.wait(`document.querySelectorAll('.fixture-typefully-open').length > ${draftReadCount}`, 2000); }
    catch (error) { assert.fail(`A Typefully control must open a draft URL in the synthetic window stub. ${JSON.stringify(await draftDiagnostics())}`); }
    const result = await page.evaluate("(() => { const markers = [...document.querySelectorAll('.fixture-typefully-open')]; const last = markers.at(-1); return { count: markers.length, url: last?.dataset.url, features: last?.dataset.features }; })()");
    assert.ok(result.url, "A Typefully control must open a draft URL in the synthetic window stub");
    assert.equal(result.count, draftReadCount + 1, "Each Typefully activation must open exactly one draft");
    draftReadCount = result.count;
    return { ...result, url: new URL(result.url) };
  };
  const freshThread = async () => {
    await fresh();
    await page.evaluate("window.interfaceFixture.enterThread()");
    await storage({ aiSlopButton: "on" });
    await page.wait("document.querySelectorAll('#reply-post .mt-ai-slop-button').length === 1");
  };
  const doubleClickReply = () => page.evaluate("(() => { const button = document.querySelector('#reply-post .mt-ai-slop-button'); button.click(); button.click(); })()");

  try {
    await check("Popup: rapid changes to distinct controls persist both values and external changes stay coherent", async () => {
      await fresh();
      await popup.wait("document.getElementById('interFont')?.getAttribute('aria-checked') === 'false' && document.getElementById('transparentSearch')?.getAttribute('aria-checked') === 'false'");
      await popup.evaluate("document.getElementById('interFont').click(); document.getElementById('transparentSearch').click()");
      await page.wait("getComputedStyle(document.getElementById('font-probe')).fontFamily.startsWith('Inter') && getComputedStyle(document.querySelector('#sidebar-search > div > div')).backgroundColor === 'rgba(0, 0, 0, 0)'");
      const { data } = await popup.send("Extensions.getStorageItems", { id: page.browser.extensionId, storageArea: "local", keys: ["interFont", "transparentSearch"] });
      assert.deepEqual(data, { interFont: "on", transparentSearch: "on" });
      await storage({ interFont: "off", transparentSearch: "off" });
      await popup.wait("document.getElementById('interFont')?.getAttribute('aria-checked') === 'false' && document.getElementById('transparentSearch')?.getAttribute('aria-checked') === 'false'");
    });

    await check("Popup: mixed vanity counts derive the group state and group changes save atomically", async () => {
      await fresh();
      await storage({ replyCount: "hide", retweetCount: "show", likeCount: "show", followCount: "show" });
      await popup.wait("document.getElementById('all')?.getAttribute('aria-checked') === 'mixed'");
      await popup.evaluate("if (!document.getElementById('reply')) document.querySelector('label[for=all]').parentElement.querySelector('button').click()");
      await popup.wait("document.getElementById('reply')?.getAttribute('aria-checked') === 'true' && document.getElementById('like')?.getAttribute('aria-checked') === 'false'");
      await popup.evaluate("document.getElementById('all').click()");
      await popup.wait("['all','reply','retweet','like','follow'].every(id => document.getElementById(id)?.getAttribute('aria-checked') === 'true')");
      await popup.wait("new Promise(resolve => chrome.storage.local.get(['replyCount','retweetCount','likeCount','followCount'], data => resolve(Object.values(data).every(value => value === 'hide'))))");
      await popup.evaluate(`window.interfaceStorageEvents = []; window.interfaceStorageListener = (changes, area) => { if (area === 'local') window.interfaceStorageEvents.push(changes); }; chrome.storage.onChanged.addListener(window.interfaceStorageListener)`);
      try {
        await popup.evaluate("document.getElementById('all').click()");
        await popup.wait("window.interfaceStorageEvents.length > 0");
        const events = await popup.evaluate("window.interfaceStorageEvents");
        assert.equal(events.length, 1, "A group change must produce one storage update");
        assert.deepEqual(Object.keys(events[0]).sort(), ["followCount", "likeCount", "replyCount", "retweetCount"]);
        assert.equal(Object.values(events[0]).every(({ newValue }) => newValue === "show"), true);
        await popup.wait("['all','reply','retweet','like','follow'].every(id => document.getElementById(id)?.getAttribute('aria-checked') === 'false')");
        await popup.evaluate("document.getElementById('like').click()");
        await popup.wait("document.getElementById('all')?.getAttribute('aria-checked') === 'mixed' && document.getElementById('like')?.getAttribute('aria-checked') === 'true'");
        const { data } = await popup.send("Extensions.getStorageItems", { id: page.browser.extensionId, storageArea: "local", keys: ["replyCount", "retweetCount", "likeCount", "followCount"] });
        assert.deepEqual(data, { replyCount: "show", retweetCount: "show", likeCount: "hide", followCount: "show" });
      } finally {
        await popup.evaluate("chrome.storage.onChanged.removeListener(window.interfaceStorageListener); delete window.interfaceStorageListener; delete window.interfaceStorageEvents");
      }
    });

    await check("Popup: CSS edits flush when the editor hides and when its popup closes", async () => {
      await fresh();
      for (const close of [false, true]) {
        await storage({ customCss: "" });
        const editingPopup = await page.browser.page(`chrome-extension://${page.browser.extensionId}/index.html`);
        const css = `#custom-probe { color: rgb(${close ? "31, 32, 33" : "21, 22, 23"}); }`;
        try {
          await editingPopup.wait("[...document.querySelectorAll('button')].some(button => button.textContent === 'Show CSS Editor')");
          await editingPopup.evaluate("[...document.querySelectorAll('button')].find(button => button.textContent === 'Show CSS Editor').click()");
          await editingPopup.wait("!!document.querySelector('.cm-content[contenteditable=true]')");
          await editingPopup.send("Page.bringToFront");
          await editingPopup.evaluate("document.querySelector('.cm-content[contenteditable=true]').focus()");
          await editingPopup.send("Input.insertText", { text: css });
          assert.equal(await editingPopup.evaluate("document.querySelector('.cm-content').textContent"), css);
          if (close) await editingPopup.close();
          else await editingPopup.evaluate("[...document.querySelectorAll('button')].find(button => button.textContent === 'Hide CSS Editor').click()");
          await page.wait(`getComputedStyle(document.getElementById('custom-probe')).color === ${JSON.stringify(close ? "rgb(31, 32, 33)" : "rgb(21, 22, 23)")}`);
          const { data } = await popup.send("Extensions.getStorageItems", { id: page.browser.extensionId, storageArea: "local", keys: ["customCss"] });
          assert.equal(data.customCss, css);
        } finally {
          if (page.browser.pages.has(editingPopup)) await editingPopup.close();
        }
      }
      await page.send("Page.bringToFront");
    });

    await check("Interface: Inter font loads and disabling it restores the native font", async () => {
      await fresh();
      const native = await page.evaluate("getComputedStyle(document.getElementById('font-probe')).fontFamily");
      await storage({ interFont: "on" });
      await page.wait("getComputedStyle(document.getElementById('font-probe')).fontFamily.startsWith('Inter')");
      assert.equal(await page.evaluate("document.fonts.load('16px Inter').then(fonts => fonts.length > 0)"), true, "The packaged font must load");
      await storage({ interFont: "off" });
      await page.wait(`getComputedStyle(document.getElementById('font-probe')).fontFamily === ${JSON.stringify(native)}`);
    });

    await check("Interface: sidebar Search toggles without hiding timeline Search or retaining layout offsets", async () => {
      await fresh();
      await page.wait(visible("#sidebar-search"));
      const nativeTop = await page.evaluate("getComputedStyle(document.getElementById('native-trends')).top");
      await storage({ searchBar: "off" });
      await page.wait(`!${visible("#sidebar-search")}`);
      assert.equal(await page.evaluate(visible("#primary-search")), true);
      await storage({ searchBar: "on" });
      await page.wait(visible("#sidebar-search"));
      assert.equal(await page.evaluate("getComputedStyle(document.getElementById('native-trends')).top"), nativeTop);
    });

    await check("Interface: transparent Search changes only its shell and reverses cleanly", async () => {
      await fresh();
      const native = await page.evaluate("getComputedStyle(document.querySelector('#sidebar-search > div > div')).backgroundColor");
      const other = await page.evaluate("getComputedStyle(document.getElementById('primary-search')).backgroundColor");
      await storage({ transparentSearch: "on" });
      await page.wait("getComputedStyle(document.querySelector('#sidebar-search > div > div')).backgroundColor === 'rgba(0, 0, 0, 0)'");
      assert.equal(await page.evaluate("getComputedStyle(document.getElementById('primary-search')).backgroundColor"), other);
      await storage({ transparentSearch: "off" });
      await page.wait(`getComputedStyle(document.querySelector('#sidebar-search > div > div')).backgroundColor === ${JSON.stringify(native)}`);
      assert.equal(await page.evaluate("getComputedStyle(document.querySelector('#sidebar-search input')).transform"), "none");
    });

    await check("Interface: the sidebar Post control toggles without changing the native inline Post control", async () => {
      await fresh();
      const inline = await page.evaluate(visible('[data-testid="tweetButtonInline"]'));
      await storage({ tweetButton: "off" });
      await page.wait(`!${visible('[data-testid="SideNav_NewTweet_Button"]')}`);
      assert.equal(await page.evaluate(visible('[data-testid="tweetButtonInline"]')), inline);
      await storage({ tweetButton: "on" });
      await page.wait(visible('[data-testid="SideNav_NewTweet_Button"]'));
    });

    await check("Interface: title and favicon notifications restore the latest native state", async () => {
      await fresh();
      await page.evaluate("document.title = '(12) Home / X'; document.getElementById('native-favicon').href = 'https://x.com/favicons/twitter-pip.3.ico'");
      await storage({ titleNotifications: "off" });
      await page.wait("document.title === 'Home / X' && !document.getElementById('native-favicon').getAttribute('href').includes('twitter-pip')");
      await page.evaluate("document.title = '(2) Search / X'; document.getElementById('native-favicon').href = 'https://x.com/favicons/twitter-pip.4.ico'");
      await page.wait("document.title === 'Search / X' && !document.getElementById('native-favicon').getAttribute('href').includes('twitter-pip')");
      await storage({ titleNotifications: "on" });
      await page.wait("document.title === '(2) Search / X' && document.getElementById('native-favicon').getAttribute('href') === 'https://x.com/favicons/twitter-pip.4.ico'");
      await storage({ titleNotifications: "off" });
      await page.wait("document.title === 'Search / X'");
      await page.evaluate(`document.title = 'Search / X'; document.getElementById('native-favicon').setAttribute('href', ${JSON.stringify(cleanFavicon)})`);
      await page.evaluate("new Promise(resolve => setTimeout(resolve, 100))");
      await storage({ titleNotifications: "on" });
      await page.wait("document.title === 'Search / X'");
      assert.equal(await page.evaluate("document.getElementById('native-favicon').getAttribute('href')"), cleanFavicon, "Re-enabling notifications must preserve a native badge-clear update");
    });

    await check("Interface: custom CSS works without a CDN stylesheet, persists across other settings, and clears", async () => {
      await fresh();
      assert.equal(await page.evaluate("!!document.getElementById('mt-external-stylesheet')"), false);
      const native = await page.evaluate("(() => { const style = getComputedStyle(document.getElementById('custom-probe')); return { color: style.color, margin: style.marginLeft }; })()");
      await storage({ customCss: "#custom-probe { color: rgb(201, 2, 3); margin-left: 17px; }" });
      await page.wait("getComputedStyle(document.getElementById('custom-probe')).color === 'rgb(201, 2, 3)'");
      await storage({ tweetButton: "off" });
      await page.wait(`!${visible('[data-testid="SideNav_NewTweet_Button"]')}`);
      assert.equal(await page.evaluate("getComputedStyle(document.getElementById('custom-probe')).marginLeft"), "17px");
      await storage({ customCss: "" });
      await page.wait(`getComputedStyle(document.getElementById('custom-probe')).color === ${JSON.stringify(native.color)}`);
      assert.equal(await page.evaluate("getComputedStyle(document.getElementById('custom-probe')).marginLeft"), native.margin);
      assert.equal(await page.evaluate("document.querySelectorAll('#custom-css').length"), 0);
    });

    await check("Typefully: enabled inline draft stays separate, supports keyboard use, and handles aria-disabled=false", async () => {
      await fresh(); await stubDraftWindows();
      await storage({ typefullyEnhancementsButtons: "on" });
      await page.wait(visible("#typefully-link-inline"));
      await page.send("Page.bringToFront");
      await page.evaluate("document.getElementById('typefully-link-inline').focus()");
      await page.send("Input.dispatchKeyEvent", {type:"keyDown",key:"Enter",code:"Enter",windowsVirtualKeyCode:13,text:"\r",unmodifiedText:"\r"});
      await page.send("Input.dispatchKeyEvent", {type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13});
      const draft = await lastDraft();
      assert.equal(draft.url.origin, "https://typefully.com");
      assert.equal(draft.url.searchParams.get("new"), "Inline draft stays separate.");
      assert.equal(draft.url.searchParams.has("replyTo"), false);
      assert.equal(draft.features, "noopener,noreferrer");
      await page.evaluate("document.querySelector('[data-testid=tweetButtonInline]').setAttribute('aria-disabled', 'true'); window.interfaceFixture.tick()");
      await page.wait("!document.getElementById('typefully-link-inline')");
      assert.equal(await page.evaluate("getComputedStyle(document.querySelector('[data-testid=tweetButtonInline]')).marginLeft"), "3px");
    });

    await check("Typefully: modal draft preserves mentions, paragraphs, blank lines, and thread boundaries", async () => {
      await fresh(); await stubDraftWindows();
      await storage({ typefullyEnhancementsButtons: "on" });
      await page.evaluate("window.interfaceFixture.openComposer()");
      await page.wait(visible("#typefully-link"));
      await page.evaluate("document.getElementById('typefully-link').click()");
      assert.equal((await lastDraft()).url.searchParams.get("new"), modalText);
      await page.evaluate("document.getElementById('typefully-link-inline').click()");
      assert.equal((await lastDraft()).url.searchParams.get("new"), "Inline draft stays separate.");
      assert.equal(await page.evaluate("document.querySelectorAll('#typefully-callout-box').length"), 1, "Callout creation must not duplicate its ID across concurrent producers");
    });

    await check("Typefully: reply draft uses the outer post and repeated mutations do not add reply handlers", async () => {
      await fresh(); await stubDraftWindows();
      await storage({ typefullyEnhancementsButtons: "on" });
      await page.wait("!document.getElementById('mt-style-typefullyEnhancementsButtons')");
      await page.evaluate("(() => { for (let i = 0; i < 8; i++) window.interfaceFixture.tick(); })()");
      await page.evaluate("document.querySelector('#reply-post [data-testid=reply]').click()");
      await page.wait(visible("#typefully-reply-link"));
      assert.equal(await page.evaluate("document.querySelectorAll('#typefully-reply-link').length"), 1);
      await page.evaluate("document.getElementById('typefully-reply-link').click()");
      const draft = await lastDraft();
      assert.equal(draft.url.searchParams.get("replyTo"), "https://x.com/reply_author/status/101");
      assert.equal(draft.url.searchParams.get("new"), modalText);
      assert.equal(await page.evaluate("window.interfaceFixture.modalOpens"), 1);
    });

    await check("Typefully: scheduling opens only a scoped draft and disabling removes additions and native layout changes", async () => {
      await fresh(); await stubDraftWindows();
      const nativeMargin = await page.evaluate("getComputedStyle(document.querySelector('[data-testid=tweetButtonInline]')).marginLeft");
      await storage({ typefullyEnhancementsButtons: "on" });
      await page.evaluate("window.interfaceFixture.openComposer(); window.interfaceFixture.openSchedule()");
      await page.wait(visible("#typefully-schedule-button"));
      await page.evaluate("document.getElementById('typefully-schedule-button').click()");
      const draft = await lastDraft();
      assert.equal(draft.url.searchParams.get("utm_content"), "schedule-button");
      assert.equal(draft.url.searchParams.get("new"), modalText);
      assert.equal(await page.evaluate("window.interfaceFixture.nativePostActions"), 0);
      await storage({ typefullyEnhancementsButtons: "off" });
      await page.wait("!document.querySelector('[id^=typefully-]')");
      assert.equal(await page.evaluate("getComputedStyle(document.querySelector('[data-testid=tweetButtonInline]')).marginLeft"), nativeMargin);
      await page.evaluate("window.interfaceFixture.tick()");
      await page.evaluate("new Promise(resolve => setTimeout(resolve, 150))");
      assert.equal(await page.evaluate("document.querySelectorAll('[id^=typefully-]').length"), 0, "Disabled producers must not re-insert Typefully additions");
      assert.equal(await page.evaluate("document.querySelectorAll('.fixture-typefully-open').length"), 1);
      assert.equal(await page.evaluate("!!document.getElementById('native-schedule-confirm')"), true);
    });

    await check("AI Slop: controls target replies, preserve native controls, and require timely second confirmation", async () => {
      await freshThread();
      assert.equal(await page.evaluate("document.querySelectorAll('#root-post .mt-ai-slop-button').length"), 0);
      assert.equal(await page.evaluate("document.querySelectorAll('#reply-post .mt-ai-slop-button').length"), 1);
      assert.equal(await page.evaluate("document.querySelectorAll('#native-grok-101').length"), 1);
      assert.equal(await page.evaluate("document.querySelectorAll('[data-testid=caret]').length"), 5, "Extension controls must not clone native test IDs");
      await page.evaluate("document.querySelector('#reply-post .mt-ai-slop-button').click()");
      assert.deepEqual(await page.evaluate("window.interfaceFixture.reportRequests"), []);
      assert.deepEqual(await page.evaluate("window.interfaceFixture.blockedAuthors"), []);
      await page.wait("document.querySelector('#reply-post .mt-ai-slop-button').getAttribute('aria-label') === 'AI slop'", 5000);
      await page.evaluate("document.querySelector('#reply-post .mt-ai-slop-button').click()");
      assert.deepEqual(await page.evaluate("window.interfaceFixture.menuOpens"), []);
      await storage({ aiSlopButton: "off" });
      await page.wait("!document.querySelector('.mt-ai-slop-button')");
    });

    await check("AI Slop: recycled replies require confirmation for the current post and author", async () => {
      await freshThread();
      await page.evaluate("document.querySelector('#reply-post .mt-ai-slop-button').click(); window.interfaceFixture.recyclePost('reply-post', 'recycled_author', '103')");
      await page.wait("document.querySelector('#reply-post .mt-ai-slop-button').getAttribute('aria-label') === 'AI slop'");
      await page.evaluate("(() => { const button = document.querySelector('#reply-post .mt-ai-slop-button'); button.click(); window.interfaceFixture.recyclePost('reply-post', 'current_author', '104'); button.click(); })()");
      assert.deepEqual(await page.evaluate("window.interfaceFixture.reportRequests"), []);
      assert.deepEqual(await page.evaluate("window.interfaceFixture.blockedAuthors"), []);
      assert.deepEqual(await page.evaluate("window.interfaceFixture.menuOpens"), []);
      assert.equal(await page.evaluate("document.querySelector('#reply-post .mt-ai-slop-button').getAttribute('aria-label')"), "Click again within 3 seconds to report this post as spam and block @current_author");
      await page.evaluate("document.querySelector('#reply-post .mt-ai-slop-button').click()");
      await page.wait("!!document.querySelector('#reply-post .mt-ai-slop-reported-view-button')", 15000);
      assert.deepEqual(await page.evaluate("window.interfaceFixture.reportRequests"), ["104"]);
      assert.deepEqual(await page.evaluate("window.interfaceFixture.blockedAuthors"), ["current_author"]);
      assert.deepEqual(await page.evaluate("window.interfaceFixture.menuOpens"), ["current_author", "current_author"]);
    });

    await check("AI Slop: synthetic reporting blocks the outer author and View restores native inline display", async () => {
      await freshThread();
      await doubleClickReply();
      await page.wait("!!document.querySelector('#reply-post .mt-ai-slop-reported-view-button')", 15000);
      assert.deepEqual(await page.evaluate("window.interfaceFixture.reportRequests"), ["101"]);
      assert.deepEqual(await page.evaluate("window.interfaceFixture.blockedAuthors"), ["reply_author"]);
      assert.deepEqual(await page.evaluate("window.interfaceFixture.menuOpens"), ["reply_author", "reply_author"]);
      assert.equal(await page.evaluate(visible("#reply-post .post-content")), false);
      await page.evaluate("document.querySelector('#reply-post .mt-ai-slop-reported-view-button').click()");
      assert.equal(await page.evaluate(visible("#reply-post .post-content")), true);
      assert.deepEqual(await page.evaluate("(() => { const style = document.querySelector('#reply-post .post-content').style; return { display: style.display, priority: style.getPropertyPriority('display') }; })()"), { display: "flex", priority: "important" });
    });

    await check("AI Slop: disabling cancels an in-flight native workflow before report or block submission", async () => {
      await freshThread();
      await doubleClickReply();
      await page.wait("!!document.querySelector('[role=dialog]')");
      await storage({ aiSlopButton: "off" });
      await page.wait("!document.querySelector('.mt-ai-slop-button')");
      await page.evaluate("new Promise(resolve => setTimeout(resolve, 800))");
      assert.deepEqual(await page.evaluate("window.interfaceFixture.reportRequests"), []);
      assert.deepEqual(await page.evaluate("window.interfaceFixture.blockedAuthors"), []);
      assert.equal(await page.evaluate(visible("#reply-post .post-content")), true);
    });

    await check("AI Slop: closing a report after choosing Spam stops before report submission or blocking", async () => {
      await freshThread();
      await page.evaluate("window.interfaceFixture.cancelReportAfterSpam = true");
      await doubleClickReply();
      await page.wait("document.querySelector('#reply-post .mt-ai-slop-button').getAttribute('aria-label') === 'failed'");
      assert.deepEqual(await page.evaluate("window.interfaceFixture.reportSelections"), ["spam"]);
      assert.deepEqual(await page.evaluate("window.interfaceFixture.reportRequests"), []);
      assert.deepEqual(await page.evaluate("window.interfaceFixture.blockedAuthors"), []);
      assert.deepEqual(await page.evaluate("window.interfaceFixture.menuOpens"), ["reply_author"]);
      assert.equal(await page.evaluate(visible("#reply-post .post-content")), true);
    });

    await check("AI Slop: a missing Report action does not silently block an account", async () => {
      await freshThread();
      await page.evaluate("window.interfaceFixture.reportAvailable = false");
      await doubleClickReply();
      await page.wait("document.querySelector('#reply-post .mt-ai-slop-button').getAttribute('aria-label') === 'failed'");
      assert.deepEqual(await page.evaluate("window.interfaceFixture.reportRequests"), []);
      assert.deepEqual(await page.evaluate("window.interfaceFixture.blockedAuthors"), []);
    });

    await check("AI Slop: an unexpected block-confirmation author is never confirmed", async () => {
      await freshThread();
      await page.evaluate("window.interfaceFixture.blockDialogHandle = 'wrong_author'");
      await doubleClickReply();
      await page.wait("document.querySelector('#reply-post .mt-ai-slop-button').getAttribute('aria-label') === 'failed'", 15000);
      assert.deepEqual(await page.evaluate("window.interfaceFixture.reportRequests"), ["101"]);
      assert.deepEqual(await page.evaluate("window.interfaceFixture.blockedAuthors"), []);
    });
  } finally {
    page.browser.off("event", contextListener);
    await storage(saved);
    const absent = keys.filter((key) => !(key in saved));
    if (absent.length) await popup.evaluate(`new Promise(resolve => chrome.storage.local.remove(${JSON.stringify(absent)}, resolve))`);
  }
  return keys.map((setting) => ({ setting, status: "pass", ...(["aiSlopButton", "typefullyEnhancementsButtons"].includes(setting) ? { live: "outward actions tested only with synthetic local dialogs and intercepted draft windows" } : {}) }));
}
