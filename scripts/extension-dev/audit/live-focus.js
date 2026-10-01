import assert from "node:assert/strict";

const editorQuery = '[data-testid="primaryColumn"] [data-testid^="tweetTextarea_"][role="textbox"][contenteditable="true"]';
const editorExpression = `([...document.querySelectorAll(${JSON.stringify(editorQuery)})].find(editor => !editor.closest('[data-testid="tweet"], [role="dialog"]'))) `;
const settle = () => new Promise(resolve => setTimeout(resolve, 150));
const focusSample = `(() => {
  const editor = ${editorExpression};
  const visible = e => { if (!e) return false; const r = e.getBoundingClientRect(), s = getComputedStyle(e); return !!(r.width && r.height && s.display !== 'none' && s.visibility !== 'hidden'); };
  const rect = e => { if (!e) return null; const r = e.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; };
  const column = editor?.closest('[data-testid="primaryColumn"]');
  const composer = editor?.closest('.mt-writer-composer');
  const post = composer?.querySelector('[data-testid="tweetButtonInline"]') || column?.querySelector('[data-testid="tweetButtonInline"]');
  const shortcut = document.querySelector('header[role="banner"] .mt-writer-shortcut');
  return { url:location.href, viewport:{width:innerWidth,height:innerHeight}, focus:document.activeElement === editor,
    editorPresent:!!editor, editorVisible:visible(editor), editorLength:editor?.innerText.replace(/\\u200b/g, '').trim().length || 0,
    editorPreserved:editor === window.__zenLiveFocusEditor, postPreserved:post === window.__zenLiveFocusPost,
    writerActive:document.body.classList.contains('mt-writer-mode'), postVisible:visible(post),
    column:rect(column), editor:rect(editor), toolbar:rect(composer?.querySelector('[data-testid="toolBar"]')),
    shortcut:rect(shortcut), shortcutVisible:visible(shortcut),
    visibleNavigation:[...document.querySelectorAll('header[role="banner"] nav[role="navigation"] > *')].filter(visible).map(element=>element.getAttribute('aria-label')),
    overflow:document.documentElement.scrollWidth > innerWidth + 1, bodyOverflow:getComputedStyle(document.body).overflowY,
    scrollY, scrollHeight:document.documentElement.scrollHeight,
    visiblePosts:[...document.querySelectorAll('[data-testid="primaryColumn"] [data-testid="tweet"]')].filter(visible).length };
})()`;

async function clearTestDraft(page) {
  await page.evaluate(`(() => { const editor = ${editorExpression}; if (!editor) throw new Error('Native test editor disappeared before draft cleanup'); editor.focus({preventScroll:true}); })()`);
  // Official CDP Input supports selectAll editing commands and native Backspace.
  // https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Input.pdl
  const modifiers = await page.evaluate("/Mac/.test(navigator.platform) ? 4 : 2");
  await page.send("Input.dispatchKeyEvent", { type:"keyDown", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers, commands:["selectAll"] });
  await page.send("Input.dispatchKeyEvent", { type:"keyUp", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers });
  await page.send("Input.dispatchKeyEvent", { type:"keyDown", key:"Backspace", code:"Backspace", windowsVirtualKeyCode:8 });
  await page.send("Input.dispatchKeyEvent", { type:"keyUp", key:"Backspace", code:"Backspace", windowsVirtualKeyCode:8 });
  await page.wait(`!${editorExpression}?.innerText.replace(/\\u200b/g, '').trim()`);
  await page.send("Input.dispatchKeyEvent", { type:"keyDown", key:"Tab", code:"Tab", windowsVirtualKeyCode:9 });
  await page.send("Input.dispatchKeyEvent", { type:"keyUp", key:"Tab", code:"Tab", windowsVirtualKeyCode:9 });
  await page.wait(`document.activeElement !== ${editorExpression}`);
}

export async function runLiveFocusAudit({ page, storage, check, navigate, capture }) {
  const viewport = await page.evaluate("({width:innerWidth,height:innerHeight})");
  const geometry = [];
  let draftWritten = false, primaryError, result;
  const cleanupErrors = [];
  try {
    await storage({ writerMode:"off", zenWriterModeButton:"on", exploreButton:"on", followingTimeline:"off", removeTimelineTabs:"off", trendsHomeTimeline:"off", recentMedia:"off", mindfulScrolling:"off" });
    await page.send("Emulation.setDeviceMetricsOverride", {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await navigate("https://x.com/home");
    await page.send("Page.bringToFront");
    try { await page.wait(`!!${editorExpression}`, 10000); }
    catch { result = {status:"unsupported",reason:"Current authenticated Home has no native inline composer"}; }
    if (!result) {
      const existingLength = await page.evaluate(`${editorExpression}?.innerText.replace(/\\u200b/g, '').trim().length || 0`);
      if (existingLength) result = {status:"unsupported",reason:"Existing native draft preserved; write-and-clear audit skipped",existingLength};
    }
    if (!result) {
      await page.evaluate(`window.__zenLiveFocusEditor = ${editorExpression}; window.__zenLiveFocusPost = document.querySelector('[data-testid="primaryColumn"] [data-testid="tweetButtonInline"]'); true`);
      const baseline = await page.evaluate(focusSample);
      await check("live Writer Mode focuses the native composer and preserves controls at 1440 and 600 px", async () => {
        await storage({writerMode:"on"});
        await page.wait(`document.body.classList.contains('mt-writer-mode') && document.activeElement === ${editorExpression}`);
        for (const width of [1440,600]) {
          await page.send("Emulation.setDeviceMetricsOverride", {width,height:1000,deviceScaleFactor:1,mobile:false});
          await settle();
          const state = await page.evaluate(focusSample);
          assert.equal(state.editorPreserved, true);
          assert.equal(state.postPreserved, true);
          assert.equal(state.editorVisible, true);
          assert.equal(state.postVisible, true);
          assert.equal(state.shortcutVisible,true,"The exit shortcut must remain available");
          assert.equal(state.shortcut.x,12); assert.equal(state.shortcut.y,12);
          assert.equal(state.shortcut.width,44); assert.equal(state.shortcut.height,44);
          assert.ok(state.shortcut.bottom <= state.editor.y,"The exit shortcut must stay above the native composer");
          assert.deepEqual(state.visibleNavigation,["Zen Writer Mode"],"Focus must hide native and injected navigation distractions");
          assert.equal(state.overflow, false, `Writer overflow at ${width}px`);
          assert.ok(state.column.x >= -1 && state.column.right <= width + 1);
          assert.notEqual(state.bodyOverflow, "hidden");
          geometry.push(state);
          await capture(`live-focus-${width}`);
        }
      });
      await check("live long drafts scroll and clear through native input without sending", async () => {
        await page.evaluate(`${editorExpression}.focus({preventScroll:true})`);
        draftWritten = true;
        const text = Array.from({length:75},(_,index) => `Local unsent focus audit line ${index + 1}.`).join("\n");
        await page.send("Input.insertText", {text});
        await page.wait(`(${editorExpression}?.innerText.length || 0) > 1500`);
        await settle();
        await page.evaluate("window.scrollTo(0,0)");
        await settle();
        const before = await page.evaluate(focusSample);
        // Wheel over the page margin to exercise document scrolling, not editor-internal scroll.
        await page.send("Input.dispatchMouseEvent", {type:"mouseWheel",x:598,y:650,deltaX:0,deltaY:600});
        await settle();
        const after = await page.evaluate(focusSample);
        assert.ok(after.scrollHeight > 1000, "A long native draft must remain reachable");
        assert.notEqual(after.scrollY,before.scrollY,"The long draft must allow document scrolling");
        assert.equal(after.overflow,false);
        geometry.push(after);
        await capture("live-focus-long-draft");
        await clearTestDraft(page);
        draftWritten = false;
      });
      await check("live Writer off restores the same native editor controls and Home feed", async () => {
        await storage({writerMode:"off"});
        await page.wait("!document.getElementById('mt-style-writerMode') && !document.querySelector('.mt-writer-composer')");
        await page.send("Emulation.setDeviceMetricsOverride", {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
        await page.evaluate("window.scrollTo(0,0)");
        await settle();
        const restored = await page.evaluate(focusSample);
        assert.equal(restored.editorPreserved,true);
        assert.equal(restored.postPreserved,true);
        assert.equal(restored.editorLength,0);
        assert.equal(restored.writerActive,false);
        assert.equal(restored.overflow,false);
        assert.ok(restored.visiblePosts > 0);
        geometry.push(restored);
        await capture("live-focus-restored");
        result = {status:"pass",baseline,geometry,draftCleared:true};
      });
    }
  } catch (error) {
    primaryError = error;
    try { await capture("live-focus-failure"); } catch (captureError) { error.captureError = captureError.message; }
  } finally {
    const clean = async action => { try { await action(); } catch(error) { cleanupErrors.push(error); } };
    if (draftWritten) await clean(() => clearTestDraft(page));
    await clean(() => storage({writerMode:"off"}));
    await clean(() => page.evaluate("delete window.__zenLiveFocusEditor; delete window.__zenLiveFocusPost"));
    await clean(() => page.send("Emulation.setDeviceMetricsOverride", {...viewport,deviceScaleFactor:1,mobile:false}));
    await clean(() => page.navigate("about:blank"));
  }
  if (primaryError) { primaryError.cleanupErrors = cleanupErrors.map(error => error.message); throw primaryError; }
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors,"Live focus cleanup failed");
  return result;
}

export const profileMediaSample = `(() => {
  const column = document.querySelector('[data-testid="primaryColumn"]');
  const panel = document.getElementById('mt-profile-photos');
  const handle = location.pathname.split('/')[1]?.toLowerCase();
  const rect = e => { const r = e.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; };
  const nativePhotos = [...column?.querySelectorAll('[data-testid="tweetPhoto"] img') || []].flatMap(image => {
    const anchor = image.closest('a[href]');
    if (!anchor || image.closest('[data-testid="quoteTweet"], [data-testid="card.wrapper"], div[role="link"]')) return [];
    const post = image.closest('[data-testid="tweet"]');
    if (post?.parentElement.closest('[data-testid="tweet"]')) return [];
    const url = new URL(anchor.href), parts = url.pathname.split('/');
    const r = image.getBoundingClientRect();
    if (url.origin !== location.origin || parts[1]?.toLowerCase() !== handle || parts[2] !== 'status' || parts[4] !== 'photo' || !r.width || !r.height) return [];
    return [{href:anchor.getAttribute('href'),src:image.getAttribute('src'),alt:image.getAttribute('alt') || ''}];
  });
  return {url:location.href,viewport:{width:innerWidth,height:innerHeight},
    nativeProfileHeader:!!column?.querySelector('[data-testid="UserName"], [data-testid="UserProfileHeader_Items"]'),
    renderedPosts:column?.querySelectorAll('[data-testid="tweet"]').length || 0,
    emptyState:!!column?.querySelector('[data-testid="emptyState"]'),nativePhotos,
    nativeNodesPreserved:window.__zenLiveMediaPhotos?.every(record=>record.image.isConnected && record.image.outerHTML === record.html),
    panel:panel && {rect:rect(panel),visible:!!panel.getClientRects().length && !panel.hidden,position:getComputedStyle(panel).position,
      background:getComputedStyle(panel).backgroundColor,color:getComputedStyle(panel).color,font:getComputedStyle(panel).fontFamily,
      nativeBackground:getComputedStyle(document.body).backgroundColor,themeText:getComputedStyle(document.documentElement).getPropertyValue('--main-text-color').trim(),
      heading:panel.querySelector('.mt-profile-photos-heading')?.getAttribute('href'),
      photos:[...panel.querySelectorAll('.mt-profile-photos-grid a')].map(anchor=>({href:anchor.getAttribute('href'),src:anchor.querySelector('img')?.getAttribute('src'),alt:anchor.querySelector('img')?.getAttribute('alt')}))},
    overflow:document.documentElement.scrollWidth > innerWidth + 1,
    column:column && rect(column),columnTransform:column && getComputedStyle(column).transform };
})()`;

export async function runLiveRecentMediaAudit({page,storage,check,navigate,capture,profiles=["quasa0","addyosmani"]}) {
  const rows = [];
  const viewport = await page.evaluate("({width:innerWidth,height:innerHeight})");
  let primaryError;
  const cleanupErrors = [];
  try {
    await storage({writerMode:"off",recentMedia:"off"});
    await page.send("Emulation.setDeviceMetricsOverride", {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    for (const handle of profiles) {
      if (!/^[a-zA-Z0-9_]+$/.test(handle)) throw new Error("Invalid profile handle");
      await navigate(`https://x.com/${handle}`);
      await page.send("Page.bringToFront");
      await page.wait("!!document.querySelector('[data-testid=primaryColumn] [data-testid=tweet], [data-testid=primaryColumn] [data-testid=emptyState]')",30000);
      await settle();
      const baseline = await page.evaluate(profileMediaSample);
      await capture(`live-profile-media-${handle}`);
      if (!baseline.nativePhotos.length) {
        rows.push({handle,status:"unsupported",reason:"Loaded native profile posts contain no profile photo links",baseline});
        continue;
      }
      await check(`live Recent Media ${handle} copies loaded photos without moving native posts and reverses cleanly`,async()=>{
        await page.evaluate("window.__zenLiveMediaPhotos = [...document.querySelectorAll('[data-testid=primaryColumn] [data-testid=tweetPhoto] img')].map(image=>({image,html:image.outerHTML})); true");
        await storage({recentMedia:"on"});
        await page.wait("!!document.querySelector('#mt-profile-photos .mt-profile-photos-grid img')");
        const enabled = await page.evaluate(profileMediaSample);
        assert.equal(enabled.panel.position,"fixed");
        assert.equal(enabled.panel.background,enabled.panel.nativeBackground,"Photo panel must use the current native theme background");
        assert.equal(enabled.panel.color,enabled.panel.themeText,"Photo panel text must use the current native theme foreground");
        assert.ok(enabled.panel.font.includes("system-ui"),"Photo panel must use a system font rather than the document fallback font");
        assert.equal(enabled.panel.heading,`/${handle}/media`);
        assert.ok(enabled.panel.photos.length > 0 && enabled.panel.photos.length <= 6);
        assert.equal(enabled.nativeNodesPreserved,true);
        assert.equal(enabled.columnTransform,baseline.columnTransform);
        assert.ok(Math.abs(enabled.column.right - baseline.column.right) <= 1);
        assert.equal(enabled.overflow,false);
        const room = 1440 - enabled.column.right - 32;
        assert.equal(enabled.panel.visible,room >= 160);
        if (enabled.panel.visible) {
          assert.ok(enabled.panel.rect.x >= enabled.column.right + 16 - 1);
          assert.ok(enabled.panel.rect.right <= 1440 - 15);
        }
        for(const photo of enabled.panel.photos) {
          const native = enabled.nativePhotos.find(record=>record.href === photo.href);
          assert.ok(native,"A panel photo must come from a native loaded post");
          assert.equal(photo.src,native.src);
          assert.equal(photo.alt,native.alt);
        }
        await capture(`live-profile-media-${handle}-enabled`);
        await page.send("Emulation.setDeviceMetricsOverride", {width:1000,height:1000,deviceScaleFactor:1,mobile:false});
        await page.wait("document.getElementById('mt-profile-photos').getClientRects().length === 0");
        await page.send("Emulation.setDeviceMetricsOverride", {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
        await settle();
        await storage({recentMedia:"off"});
        await page.wait("!document.getElementById('mt-profile-photos') && !document.getElementById('mt-style-recentMedia')");
        const restored = await page.evaluate(profileMediaSample);
        assert.equal(restored.columnTransform,baseline.columnTransform);
        assert.equal(restored.nativeNodesPreserved,true);
        await capture(`live-profile-media-${handle}-restored`);
        rows.push({handle,status:"pass",baseline,enabled,restored});
      });
      await page.evaluate("delete window.__zenLiveMediaPhotos");
    }
  } catch(error) {
    primaryError = error;
    try { await capture("live-profile-media-failure"); } catch(captureError) { error.captureError = captureError.message; }
  } finally {
    const clean = async action => { try { await action(); } catch(error) { cleanupErrors.push(error); } };
    await clean(() => storage({recentMedia:"off"}));
    await clean(() => page.evaluate("delete window.__zenLiveMediaPhotos"));
    await clean(() => page.send("Emulation.setDeviceMetricsOverride", {...viewport,deviceScaleFactor:1,mobile:false}));
  }
  if(primaryError) { primaryError.cleanupErrors = cleanupErrors.map(error=>error.message); throw primaryError; }
  if(cleanupErrors.length) throw new AggregateError(cleanupErrors,"Live profile media cleanup failed");
  return rows;
}
