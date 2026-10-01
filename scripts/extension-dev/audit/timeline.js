import assert from "node:assert/strict";

const keys = ["writerMode", "exploreButton", "followingTimeline", "removeTimelineTabs", "removeTopicsToFollow", "trendsHomeTimeline", "timelineWidth", "timelineBorders", "stickyHeader", "tweetBorders", "recentMedia", "replyCount", "retweetCount", "likeCount", "followCount", "hideViewCount", "videoResolutionOverlay", "hideGrokDrawer"];
const visible = (id) => `(() => { const e = document.getElementById(${JSON.stringify(id)}); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'; })()`;
const settle = "new Promise(resolve => setTimeout(resolve, 120))";

export async function runTimelineAudit({ page, popup, storage, check, loadFixture }) {
  const saved = await popup.evaluate(`new Promise(resolve => chrome.storage.local.get(${JSON.stringify(keys)}, resolve))`);
  const viewport = await page.evaluate("({ width: innerWidth, height: innerHeight })");
  try {
    await storage({ writerMode: "off", exploreButton: "on", followingTimeline: "off", removeTimelineTabs: "off", removeTopicsToFollow: "off", trendsHomeTimeline: "off", timelineWidth: 700, timelineBorders: "off", stickyHeader: "on", tweetBorders: "off", recentMedia: "off", replyCount: "show", retweetCount: "show", likeCount: "show", followCount: "show", hideViewCount: "off", videoResolutionOverlay: "off", hideGrokDrawer: "off" });
    await loadFixture("timeline-features.html");
    await page.wait("!!document.querySelector('#inline-toolbar .mt-writer-mode-composer-button')");

    await check("timeline controls affect Home tabs and never composer tabs or profile routes", async () => {
      await storage({ removeTimelineTabs: "on" });
      await page.wait(`!${visible("home-nav")}`);
      assert.equal(await page.evaluate(visible("composer-nav")), true);
      assert.equal(await page.evaluate(visible("media-button")), true);
      await storage({ removeTimelineTabs: "off", followingTimeline: "on" });
      await page.wait("document.getElementById('home-following').getAttribute('aria-selected') === 'true'");
      await page.evaluate("fixture.mutate()");
      await page.evaluate(settle);
      assert.equal(await page.evaluate("fixture.followingClicks"), 1);
      assert.equal(await page.evaluate("fixture.composerClicks"), 0);
      await storage({ followingTimeline: "off" });
      await page.evaluate("fixture.route('/fixture'); document.getElementById('home-for-you').click(); fixture.followingClicks = 0");
      await storage({ followingTimeline: "on", removeTimelineTabs: "on", trendsHomeTimeline: "on" });
      await page.wait("!document.getElementById('mt-style-removeTimelineTabs') && !document.getElementById('mt-style-trendsHomeTimeline')");
      assert.equal(await page.evaluate("fixture.followingClicks"), 0);
      assert.equal(await page.evaluate(visible("composer-nav")), true);
      await storage({ followingTimeline: "off", removeTimelineTabs: "off", trendsHomeTimeline: "off" });
      await page.evaluate("fixture.route('/home')");
    });

    await check("timeline width borders and sticky header reverse without changing unrelated positions", async () => {
      await page.evaluate("document.getElementById('unrelated-content').style.position = 'relative'");
      await storage({ timelineWidth: 800, timelineBorders: "on", stickyHeader: "off", tweetBorders: "on" });
      await page.wait("getComputedStyle(document.querySelector('[data-testid=primaryColumn]')).width === '800px'");
      await page.wait("getComputedStyle(document.getElementById('home-header')).position === 'static'");
      assert.equal(await page.evaluate("getComputedStyle(document.getElementById('unrelated-content')).position"), "relative");
      await page.wait(`!${visible("tweet-separator")}`);
      assert.equal(await page.evaluate(visible("unrelated-separator")), true);
      assert.equal(await page.evaluate("getComputedStyle(document.querySelector('[data-testid=primaryColumn]')).borderTopStyle"), "hidden");
      await storage({ timelineWidth: 700, timelineBorders: "off", stickyHeader: "on", tweetBorders: "off" });
      await page.wait("getComputedStyle(document.getElementById('home-header')).position === 'sticky'");
      assert.equal(await page.evaluate(visible("tweet-separator")), true);
      assert.equal(await page.evaluate("getComputedStyle(document.querySelector('[data-testid=primaryColumn]')).borderTopStyle"), "solid");
    });

    await check("Home trends reverse without leaving profile layout rules", async () => {
      await storage({ trendsHomeTimeline: "on" });
      await page.wait("getComputedStyle(document.querySelector('[data-testid=sidebarColumn] section')).position === 'fixed'");
      await storage({ trendsHomeTimeline: "off" });
      await page.wait("getComputedStyle(document.querySelector('[data-testid=sidebarColumn] section')).position === 'static'");
    });

    await check("profile photos preserve native nodes cache virtual posts and clear on off route and profile changes", async () => {
      await page.send("Emulation.setDeviceMetricsOverride", {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
      await page.evaluate("fixture.route('/fixture'); for (let id = 124; id <= 130; id++) fixture.addPhoto('fixture', String(id), 1, 'Native alt ' + id); fixture.addPhoto('other', '999'); fixture.addPhoto('fixture', '9999'); const quoted = document.getElementById('photo-post-9999-1'), quote = document.createElement('div'); quote.dataset.testid = 'quoteTweet'; quote.appendChild(quoted.firstElementChild); quoted.appendChild(quote); window.__zenNativePhoto = document.querySelector('#photo-post-130-1 img'); true");
      const native = await page.evaluate("({html:window.__zenNativePhoto.outerHTML,transform:getComputedStyle(document.querySelector('[data-testid=primaryColumn]')).transform,right:document.querySelector('[data-testid=primaryColumn]').getBoundingClientRect().right})");
      await storage({ recentMedia: "on" });
      await page.wait("document.querySelectorAll('#mt-profile-photos .mt-profile-photos-grid img').length === 6 && !document.getElementById('mt-profile-photos').hidden");
      const enabled = await page.evaluate("(() => { const p = document.getElementById('mt-profile-photos'), c = document.querySelector('[data-testid=primaryColumn]'); return {href:p.querySelector('.mt-profile-photos-heading').getAttribute('href'),photos:[...p.querySelectorAll('.mt-profile-photos-grid a')].map(a=>({href:a.getAttribute('href'),alt:a.querySelector('img').alt})),left:p.getBoundingClientRect().left,right:c.getBoundingClientRect().right,transform:getComputedStyle(c).transform,html:window.__zenNativePhoto.outerHTML,overflow:document.documentElement.scrollWidth>innerWidth+1}; })()");
      assert.equal(enabled.href,"/fixture/media");
      assert.equal(enabled.photos[0].href,"/fixture/status/130/photo/1");
      assert.equal(enabled.photos[0].alt,"Native alt 130");
      assert.equal(enabled.photos.some(p=>p.href.includes('/other/')),false);
      assert.equal(enabled.photos.some(p=>p.href.includes('/9999/')),false);
      assert.equal(new Set(enabled.photos.map(p=>p.href)).size,6);
      assert.equal(enabled.transform,native.transform);
      assert.equal(enabled.right,native.right);
      assert.equal(enabled.html,native.html);
      assert.ok(enabled.left >= enabled.right + 16);
      assert.equal(enabled.overflow,false);
      await page.evaluate("document.querySelectorAll('#profile-photo-posts article').forEach(p=>{if(!p.contains(window.__zenNativePhoto))p.remove()}); fixture.mutate()");
      await page.evaluate(settle);
      assert.equal(await page.evaluate("document.querySelectorAll('#mt-profile-photos .mt-profile-photos-grid img').length"),6);
      await page.evaluate("window.__zenNativePhoto.closest('a').href = '/fixture/status/190/photo/2'; window.__zenNativePhoto.alt = 'Recycled native alt'; true");
      await page.wait("document.querySelector('#mt-profile-photos .mt-profile-photos-grid a').getAttribute('href') === '/fixture/status/190/photo/2'");
      assert.equal(await page.evaluate("document.querySelector('#mt-profile-photos .mt-profile-photos-grid img').alt"),"Recycled native alt");
      await page.send("Emulation.setDeviceMetricsOverride", {width:1000,height:1000,deviceScaleFactor:1,mobile:false});
      await page.wait(`!${visible("mt-profile-photos")}`);
      await page.send("Emulation.setDeviceMetricsOverride", {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
      await page.wait(visible("mt-profile-photos"));
      await page.evaluate("window.__zenMediaColumnStyle = document.querySelector('[data-testid=primaryColumn]').getAttribute('style'); document.querySelector('[data-testid=primaryColumn]').style.transform = 'translateX(600px)'; fixture.mutate()");
      await page.wait("document.getElementById('mt-profile-photos').hidden");
      await page.evaluate("const column = document.querySelector('[data-testid=primaryColumn]'); if(window.__zenMediaColumnStyle === null)column.removeAttribute('style'); else column.setAttribute('style',window.__zenMediaColumnStyle); delete window.__zenMediaColumnStyle; fixture.mutate()");
      await page.wait(visible("mt-profile-photos"));
      await page.evaluate("fixture.route('/second/media')");
      await page.wait("document.querySelector('#mt-profile-photos .mt-profile-photos-heading')?.getAttribute('href') === '/second/media' && !document.querySelector('#mt-profile-photos img')");
      await page.evaluate("fixture.addPhoto('second', '200', 1, 'Second profile photo')");
      await page.wait("document.querySelector('#mt-profile-photos .mt-profile-photos-grid a')?.getAttribute('href') === '/second/status/200/photo/1'");
      await page.evaluate("fixture.addPhoto('second', '201', 1, 'Late standalone photo'); window.__zenLatePhoto = document.querySelector('#photo-post-201-1 img'); window.__zenLatePhoto.remove(); true");
      await page.evaluate(settle);
      await page.evaluate("document.querySelector('#photo-post-201-1 [data-testid=tweetPhoto]').appendChild(window.__zenLatePhoto); true");
      await page.wait("document.querySelector('#mt-profile-photos .mt-profile-photos-grid a')?.getAttribute('href') === '/second/status/201/photo/1'");
      await storage({ recentMedia: "off" });
      await page.wait("!document.getElementById('mt-profile-photos') && !document.getElementById('mt-style-recentMedia')");
      assert.equal(await page.evaluate("window.__zenNativePhoto.isConnected"),true);
      assert.equal(await page.evaluate("document.querySelector('#photo-post-200-1 img').alt"),"Second profile photo");
      await storage({ recentMedia: "on" });
      await page.wait("!!document.querySelector('#mt-profile-photos img')");
      await page.evaluate("document.querySelector('#profile-header [data-testid=UserName]').removeAttribute('data-testid'); fixture.mutate()");
      await page.wait("!document.getElementById('mt-profile-photos')");
      await page.evaluate("document.querySelector('#profile-header h2').dataset.testid = 'UserName'; fixture.route('/second/with_replies')");
      await page.wait("!!document.querySelector('#mt-profile-photos img')");
      await page.evaluate("fixture.route('/home')");
      await page.wait("!document.getElementById('mt-profile-photos') && !document.getElementById('mt-style-recentMedia')");
      await storage({ recentMedia: "off" });
      await page.evaluate("document.getElementById('profile-photo-posts').replaceChildren(); delete window.__zenNativePhoto; delete window.__zenLatePhoto");
    });

    await check("topic and account recommendations hide late UserCells and restore while lists and posts remain", async () => {
      await storage({removeTopicsToFollow:"on"});
      await page.wait(`!${visible("profile-suggestions")} && !${visible("topic-carousel")} && !${visible("topic-picker")}`);
      assert.equal(await page.evaluate(visible("list-carousel")),true);
      assert.equal(await page.evaluate(visible("count-post")),true);
      await page.evaluate("const aside = document.createElement('aside'); aside.id = 'late-user-suggestions'; aside.setAttribute('role','complementary'); aside.innerHTML = '<h2>Recommended people</h2><ul role=list></ul>'; document.getElementById('recommendations-mount').appendChild(aside); const user = document.createElement('li'); user.dataset.testid = 'UserCell'; user.textContent = 'Late recommended account'; aside.querySelector('ul').appendChild(user); true");
      await page.wait(`!${visible("late-user-suggestions")}`);
      await page.evaluate("fixture.route('/fixture')");
      assert.equal(await page.evaluate(visible("list-carousel")),true);
      assert.equal(await page.evaluate(visible("count-post")),true);
      await storage({removeTopicsToFollow:"off"});
      await page.wait(visible("profile-suggestions"));
      for(const id of ["late-user-suggestions","topic-carousel","topic-picker","list-carousel"]) assert.equal(await page.evaluate(visible(id)),true,id);
      assert.equal(await page.evaluate("document.querySelectorAll('.mt-whoToFollow').length"),0);
      await page.evaluate("fixture.route('/home')");
    });

    await check("count hiding preserves actions profile labels and original analytics display", async () => {
      await storage({ replyCount: "hide", retweetCount: "hide", likeCount: "hide", followCount: "hide", hideViewCount: "on" });
      await page.wait("getComputedStyle(document.getElementById('reply-number')).visibility === 'hidden'");
      for (const id of ["reply-number", "repost-number", "like-number", "following-number", "followers-number"]) {
        assert.equal(await page.evaluate(`getComputedStyle(document.getElementById(${JSON.stringify(id)})).visibility`), "hidden", id);
      }
      for (const id of ["reply-action", "repost-action", "like-action", "bookmark-action", "following-label", "followers-label", "followers-navigation"]) assert.equal(await page.evaluate(visible(id)), true, id);
      assert.equal(await page.evaluate(visible("view-action")), false);
      assert.equal(await page.evaluate("document.getElementById('view-action').style.display"), "grid");
      await page.evaluate("document.querySelector('#view-action a').href = '/i/bookmarks'; true");
      await page.wait(visible("view-action"));
      await page.evaluate("document.getElementById('view-action').innerHTML = '<button data-testid=bookmark>Recycled native bookmark</button>'; fixture.mutate(); true");
      await page.wait("!document.getElementById('view-action').classList.contains('mt-hidden-view-count')");
      assert.equal(await page.evaluate(visible("view-action")),true,"A reused analytics action must not hide a new native control");
      await page.evaluate("document.getElementById('view-action').innerHTML = '<a role=link href=/fixture/status/123/analytics><svg></svg><span>100</span></a>'; fixture.mutate(); true");
      await page.wait(`!${visible("view-action")}`);
      // These are the current default values. They must also reverse a prior hide.
      await storage({ replyCount: "on", retweetCount: "on", likeCount: "on", followCount: "on", hideViewCount: "off" });
      await page.wait(visible("view-action"));
      for (const id of ["reply-number", "repost-number", "like-number", "following-number", "followers-number"]) assert.equal(await page.evaluate(visible(id)), true, id);
      assert.equal(await page.evaluate("getComputedStyle(document.getElementById('view-action')).display"), "grid");
    });

    await check("late videos in mixed mutation batches receive metadata overlays and clean toggle reversal", async () => {
      await storage({ videoResolutionOverlay: "on" });
      await page.wait("!!document.getElementById('mt-style-videoResolutionOverlay')");
      await page.evaluate("fixture.insertVideo()");
      await page.wait("document.querySelector('#video-mount > .mt-videoResolutionOverlay')?.textContent === '320x180 · 16:9'");
      assert.equal(await page.evaluate(visible("late-video")), true);
      await storage({ videoResolutionOverlay: "off" });
      await page.wait("!document.querySelector('.mt-videoResolutionOverlay')");
      await page.evaluate("document.getElementById('late-video').dispatchEvent(new Event('loadedmetadata'))");
      assert.equal(await page.evaluate("document.querySelectorAll('.mt-videoResolutionOverlay').length"), 0);
      await storage({ videoResolutionOverlay: "on" });
      await page.wait("!!document.querySelector('#video-mount > .mt-videoResolutionOverlay')");
      await page.evaluate("const mount = document.createElement('div'); mount.id = 'second-video-mount'; mount.dataset.testid = 'videoPlayer'; document.getElementById('fixture-timeline').appendChild(mount); mount.appendChild(document.getElementById('late-video')); document.getElementById('late-video').dispatchEvent(new Event('resize'))");
      await page.wait("!!document.querySelector('#second-video-mount > .mt-videoResolutionOverlay') && !document.querySelector('#video-mount > .mt-videoResolutionOverlay')");
      assert.equal(await page.evaluate("document.querySelectorAll('.mt-videoResolutionOverlay').length"), 1);
      await page.evaluate("URL.revokeObjectURL(document.getElementById('late-video').src); document.getElementById('late-video').remove()");
      await page.wait("!document.querySelector('.mt-videoResolutionOverlay')");
      await storage({ videoResolutionOverlay: "off" });
    });

    await check("Grok deliberate opening handles lazy drawers repeated mutations close and disable", async () => {
      await storage({ hideGrokDrawer: "on" });
      await page.wait(`!${visible("grok-drawer")}`);
      for (let i = 0; i < 3; i++) await page.evaluate("fixture.mutate()");
      await page.evaluate("document.getElementById('post-grok').click(); fixture.openGrok()");
      await page.wait(visible("grok-drawer"));
      await page.evaluate(settle);
      await page.evaluate("fixture.closeGrok()");
      await page.wait(`!${visible("grok-drawer")}`);
      await page.evaluate("document.getElementById('grok-drawer').remove(); fixture.mutate()");
      await page.evaluate(settle);
      await page.evaluate("document.getElementById('post-grok').click(); const d = document.createElement('div'); d.id = 'grok-drawer'; d.dataset.testid = 'GrokDrawer'; d.innerHTML = '<div data-testid=GrokDrawerHeader><h2>Lazy Grok</h2><button>Close</button></div>'; document.getElementById('drawer-mount').appendChild(d)");
      await page.wait(visible("grok-drawer"));
      await storage({ hideGrokDrawer: "off" });
      await page.wait("!document.getElementById('grok-drawer').classList.contains('typefully-grok-drawer-enabled')");
      await page.evaluate("document.getElementById('post-grok').click()");
      assert.equal(await page.evaluate("document.getElementById('grok-drawer').classList.contains('typefully-grok-drawer-enabled')"), false);
    });

    await check("writer focus finds the inline composer preserves native controls and allows long-draft scrolling", async () => {
      assert.equal(await page.evaluate(visible("fixture-explore")),true);
      await page.evaluate("window.__zenNativeExplore = document.getElementById('fixture-explore'); true");
      await storage({ writerMode: "on" });
      await page.wait("document.getElementById('inline-composer').classList.contains('mt-writer-composer')");
      await page.wait(`!${visible("fixture-explore")}`);
      assert.equal(await page.evaluate(visible("fixture-home")),false);
      assert.equal(await page.evaluate(visible("fixture-zen-shortcut")),true);
      assert.equal(await page.evaluate(visible("fixture-header-marketing")),false);
      assert.equal(await page.evaluate("window.__zenNativeExplore === document.getElementById('fixture-explore')"),true);
      assert.equal(await page.evaluate("document.activeElement.matches('#inline-composer [role=textbox]')"), true);
      for (const id of ["inline-composer", "inline-post", "media-button", "composer-option", "profile-header", "followers-label", "unrelated-content"]) assert.equal(await page.evaluate(visible(id)), true, id);
      assert.equal(await page.evaluate(visible("fixture-timeline")), false);
      assert.equal(await page.evaluate("parseFloat(getComputedStyle(document.querySelector('#inline-composer [role=textbox]')).minHeight) >= 160"), true);
      assert.notEqual(await page.evaluate("getComputedStyle(document.body).overflowY"), "hidden");
      await page.evaluate("const editor = document.querySelector('#inline-composer [role=textbox]'); editor.replaceChildren(...Array.from({length: 90}, () => { const line = document.createElement('div'); line.textContent = 'A long draft remains reachable.'; return line; })); window.scrollTo(0, 500)");
      assert.equal(await page.evaluate("scrollY > 0"), true);
      await page.send("Emulation.setDeviceMetricsOverride", { width: 420, height: 700, deviceScaleFactor: 1, mobile: false });
      await page.wait("document.querySelector('[data-testid=primaryColumn]').getBoundingClientRect().right <= innerWidth");
      assert.equal(await page.evaluate(visible("inline-post")), true);
      await page.evaluate("window.scrollTo(0,0)");
      await page.evaluate(settle);
      const compact = await page.evaluate("(() => { const shortcut = document.getElementById('fixture-zen-shortcut').getBoundingClientRect(), editor = document.querySelector('#inline-composer [role=textbox]').getBoundingClientRect(); return {x:shortcut.x,y:shortcut.y,width:shortcut.width,height:shortcut.height,bottom:shortcut.bottom,editorTop:editor.top}; })()");
      assert.deepEqual({x:compact.x,y:compact.y,width:compact.width,height:compact.height},{x:12,y:12,width:44,height:44});
      assert.ok(compact.bottom <= compact.editorTop,"The compact shortcut must stay above the native editor");
      assert.equal(await page.evaluate(visible("fixture-header-marketing")),false);
    });

    await check("writer modal and compose route keep two independent composers and return cleanly", async () => {
      await page.evaluate("fixture.openModal(); fixture.route('/compose/post')");
      await page.wait("document.querySelectorAll('.mt-writer-mode-composer-button').length === 2 && document.getElementById('fixture-modal').classList.contains('mt-writer-dialog')");
      for (const id of ["modal-post", "modal-media", "modal-close", "modal-quote", "media-button", "inline-post"]) assert.equal(await page.evaluate(visible(id)), true, id);
      assert.equal(await page.evaluate("document.getElementById('fixture-modal').getBoundingClientRect().width <= innerWidth - 32"), true);
      await page.evaluate("document.querySelector('#modal-composer [role=textbox]').focus(); document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))");
      await page.evaluate(settle);
      assert.equal(await popup.evaluate("new Promise(resolve => chrome.storage.local.get('writerMode', data => resolve(data.writerMode)))"), "on");
      assert.equal(await page.evaluate("fixture.modalEscapes"), 1);
      await page.evaluate("document.getElementById('fixture-modal').remove(); fixture.route('/home')");
      await page.wait("document.querySelectorAll('.mt-writer-mode-composer-button').length === 1 && document.getElementById('fixture-timeline').classList.contains('mt-writer-hidden')");
      await page.evaluate("document.querySelector('#inline-toolbar .mt-writer-mode-composer-button').click()");
      await page.wait("!document.getElementById('mt-style-writerMode') && !document.body.classList.contains('mt-writer-mode')");
      await page.wait(visible("fixture-explore"));
      assert.equal(await page.evaluate("window.__zenNativeExplore === document.getElementById('fixture-explore')"),true);
      assert.equal(await page.evaluate(visible("fixture-zen-shortcut")),true);
      assert.equal(await page.evaluate(visible("fixture-header-marketing")),true);
      assert.equal(await page.evaluate(visible("count-post")), true);
      assert.equal(await page.evaluate("document.querySelector('#inline-composer [role=textbox]').textContent.includes('A long draft')"), true);
      assert.equal(await page.evaluate("document.title"), "Timeline feature audit / X");
      assert.equal(await page.evaluate("document.querySelectorAll('#typefully-writermode-link').length"), 0);
      await storage({ writerMode: "on" });
      await page.wait("document.body.classList.contains('mt-writer-mode')");
      await page.evaluate("fixture.route('/fixture')");
      await page.wait("!document.getElementById('mt-style-writerMode') && !document.querySelector('.mt-writer-composer')");
      assert.equal(await page.evaluate(visible("fixture-explore")),true);
      await page.evaluate("delete window.__zenNativeExplore");
      assert.equal(await page.evaluate(visible("count-post")), true);
      assert.equal(await page.evaluate(visible("profile-header")), true);
      await page.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))");
      await page.evaluate(settle);
      assert.equal(await popup.evaluate("new Promise(resolve => chrome.storage.local.get('writerMode', data => resolve(data.writerMode)))"), "on");
    });
  } finally {
    await page.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false });
    await storage(saved);
    const absent = keys.filter((key) => !(key in saved));
    if (absent.length) await popup.evaluate(`new Promise(resolve => chrome.storage.local.remove(${JSON.stringify(absent)}, resolve))`);
  }
  return keys.map((setting) => ({ setting, status: "pass" }));
}
