import assert from "node:assert/strict";

const visible = (selector) => `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return !!(rect.width && rect.height && style.display !== 'none' && style.visibility !== 'hidden'); })()`;
const cleanFavicon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
const keys = ["aiSlopButton", "interFont", "searchBar", "transparentSearch", "titleNotifications", "tweetButton", "customCss", "replyCount", "retweetCount", "likeCount", "followCount"];

export async function runInterfaceAudit({ page, popup, storage, check, loadFixture }) {
  const saved = await popup.evaluate(`new Promise(resolve => chrome.storage.local.get(${JSON.stringify(keys)}, resolve))`);
  const fresh = async () => {
    await storage({ writerMode: "off", aiSlopButton: "off", interFont: "off", searchBar: "on", transparentSearch: "off", titleNotifications: "on", tweetButton: "on", customCss: "" });
    await loadFixture("interface.html");
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

    await check("Popup: CSS edits flush when the Advanced tab hides and when its popup closes", async () => {
      await fresh();
      for (const close of [false, true]) {
        await storage({ customCss: "" });
        const editingPopup = await page.browser.page(`chrome-extension://${page.browser.extensionId}/index.html`);
        const css = `#custom-probe { color: rgb(${close ? "31, 32, 33" : "21, 22, 23"}); }`;
        try {
          await editingPopup.wait("!!document.getElementById('tab-advanced')");
          await editingPopup.evaluate("document.getElementById('tab-advanced').click()");
          await editingPopup.wait("!!document.querySelector('.cm-content[contenteditable=true]')");
          await editingPopup.send("Page.bringToFront");
          await editingPopup.evaluate("document.querySelector('.cm-content[contenteditable=true]').focus()");
          await editingPopup.send("Input.insertText", { text: css });
          assert.equal(await editingPopup.evaluate("document.querySelector('.cm-content').textContent"), css);
          if (close) await editingPopup.close();
          else await editingPopup.evaluate("document.getElementById('tab-timeline').click()");
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
    await storage(saved);
    const absent = keys.filter((key) => !(key in saved));
    if (absent.length) await popup.evaluate(`new Promise(resolve => chrome.storage.local.remove(${JSON.stringify(absent)}, resolve))`);
  }
  return keys.map((setting) => ({ setting, status: "pass", ...(setting === "aiSlopButton" ? { live: "outward actions tested only with synthetic local dialogs" } : {}) }));
}
