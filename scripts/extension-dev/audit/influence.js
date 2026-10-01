import assert from "node:assert/strict";
import { InfluenceMessages, INFLUENCE_API_URL, INFLUENCE_MODEL, influenceDefaults } from "../../../influence-shared.js";

const fakeKey = "apikey_fixture_only_not_a_real_credential_0123456789abcdef";
const settings = Object.keys(influenceDefaults);
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const warning = (id) => `document.getElementById(${JSON.stringify(id)})?.querySelector('[data-mt-influence-warning]')`;
const warningLabel = (id) => `(${warning(id)}?.shadowRoot?.querySelector('[data-testid=mt-influence-button]')?.getAttribute('aria-label') || '')`;
const fixtureText = (id) => `document.getElementById(${JSON.stringify(id)})?.querySelector('[data-testid=tweetText]')?.textContent || ''`;

async function until(read, predicate, description, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await read();
    if (predicate(value)) return value;
    await pause(100);
  }
  throw new Error(`Influence audit timed out: ${description}`);
}

export async function runInfluenceAudit({ page, popup, storage, check, loadFixture, capture }) {
  const browser = page.browser;
  const saved = await popup.evaluate(`new Promise(resolve => chrome.storage.local.get(${JSON.stringify(settings)}, resolve))`);
  const contexts = [];
  let isolatedContextId;
  let workerSessionId;
  const contextListener = (event) => {
    if (event.sessionId === page.sessionId && event.method === "Runtime.executionContextCreated") contexts.push(event.params.context);
  };
  browser.on("event", contextListener);
  const admin = (type, extra = {}) => popup.evaluate(`new Promise(resolve => chrome.runtime.sendMessage(${JSON.stringify({ type, ...extra })}, response => resolve(chrome.runtime.lastError ? {ok:false,error:'runtime'} : response)))`);
  const isolated = async (expression) => {
    assert.ok(isolatedContextId, "The extension's verified isolated world is required");
    const result = await page.send("Runtime.evaluate", { expression, contextId: isolatedContextId, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const scan = (post) => isolated(`new Promise(resolve => chrome.runtime.sendMessage(${JSON.stringify({ type: InfluenceMessages.scan, post })}, response => resolve(chrome.runtime.lastError ? {ok:false,error:'runtime'} : response)))`);
  const worker = async (expression) => {
    assert.ok(workerSessionId, "The verified extension worker must retain the fetch stub");
    const result = await browser.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, workerSessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const calls = () => worker("globalThis.__zenInfluenceFixture.requests");
  const configure = async () => assert.equal((await admin(InfluenceMessages.configure, { apiKey: fakeKey })).ok, true);
  const findContext = async () => {
    for (const context of contexts.filter((item) => item.origin.startsWith(`chrome-extension://${browser.extensionId}`) || item.name.includes(browser.extensionId))) {
      const result = await page.send("Runtime.evaluate", { expression: `globalThis.chrome?.runtime?.id === ${JSON.stringify(browser.extensionId)}`, contextId: context.id, returnByValue: true });
      if (!result.exceptionDetails && result.result.value === true) { isolatedContextId = context.id; return; }
    }
    throw new Error("Cannot find this extension's isolated world; another extension cannot substitute for it");
  };
  const fresh = async () => {
    await storage({ influenceWarnings: "off", influenceSensitivity: 0.8, influenceDailyLimit: 200 });
    contexts.length = 0;
    isolatedContextId = undefined;
    await loadFixture("influence.html");
    await findContext();
  };
  const quiet = async () => {
    await storage({ influenceWarnings: "off" });
    await page.evaluate("document.getElementById('fixture-posts').style.display = 'none'; fixture.removeLate(); scrollTo(0,0); true");
  };
  const nativePost = async (id, status) => ({ url: `https://x.com/fixture/status/${status}`, text: (await page.evaluate(fixtureText(id))).trim(), quotedText: "", links: [] });
  try {
    await fresh();
    await admin(InfluenceMessages.status);
    const { targetInfos } = await browser.send("Target.getTargets");
    const target = targetInfos.find((item) => item.type === "service_worker" && item.url === `chrome-extension://${browser.extensionId}/background.js`);
    assert.ok(target, "Only this extension's background worker may receive the API stub");
    ({ sessionId: workerSessionId } = await browser.send("Target.attachToTarget", { targetId: target.targetId, flatten: true }));
    await browser.send("Runtime.enable", {}, workerSessionId);
    assert.equal(await worker(`globalThis.chrome?.runtime?.id === ${JSON.stringify(browser.extensionId)}`), true);
    await worker(`(() => {
      const original = globalThis.fetch;
      const fixture = globalThis.__zenInfluenceFixture = { original, requests: [], mode: 'ok', pending: new Set() };
      const scores = text => text.startsWith('Helpful') || text.startsWith('New useful') || text.startsWith('Quote discussion')
        ? {sales:.02,fomo:.03,bait:.04} : text.startsWith('Soft promotion')
          ? {sales:.72,fomo:.03,bait:.04} : text.startsWith('Fear of missing out')
            ? {sales:.03,fomo:.99,bait:.04} : {sales:.98,fomo:.03,bait:.04};
      globalThis.fetch = (input, options = {}) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url !== ${JSON.stringify(INFLUENCE_API_URL)}) return original(input, options);
        const body = JSON.parse(options.body);
        fixture.requests.push({url,body,method:options.method,credentials:options.credentials,redirect:options.redirect,hasAuthorization:new Headers(options.headers).has('Authorization')});
        const mode = fixture.mode;
        const response = () => {
          if (mode === '401' || mode === '429') return new Response('{}',{status:Number(mode),headers:{'Content-Type':'application/json','Retry-After':'1'}});
          const values = scores(body.state.post.text);
          const payload = mode === 'malformed' ? {model:${JSON.stringify(INFLUENCE_MODEL)},answers:{sales:{type:'noul',noul:2}}}
            : {model:${JSON.stringify(INFLUENCE_MODEL)},answers:Object.fromEntries(Object.entries(values).map(([id,noul])=>[id,{type:'noul',noul}])),usage:{input_tokens:420,output_tokens:45}};
          return new Response(JSON.stringify(payload),{status:200,headers:{'Content-Type':'application/json'}});
        };
        if (mode !== 'hold') return Promise.resolve(response());
        return new Promise((resolve,reject) => {
          const pending = {finish:null};
          const onAbort = () => { fixture.pending.delete(pending); reject(new DOMException('Aborted','AbortError')); };
          pending.finish = () => { options.signal?.removeEventListener('abort',onAbort); fixture.pending.delete(pending); resolve(response()); };
          fixture.pending.add(pending);
          if (options.signal?.aborted) onAbort(); else options.signal?.addEventListener('abort',onAbort,{once:true});
        });
      };
      return true;
    })()`);
    await configure();

    await check("influence warnings default off and private credentials reject content-script administration", async () => {
      assert.equal(influenceDefaults.influenceWarnings, "off");
      await pause(850);
      assert.equal((await calls()).length, 0);
      assert.equal(await page.evaluate("document.querySelectorAll('[data-mt-influence-warning]').length"), 0);
      const before = await admin(InfluenceMessages.status);
      assert.equal(before.configured, true);
      for (const type of [InfluenceMessages.status, InfluenceMessages.configure, InfluenceMessages.clearCache]) {
        const result = await isolated(`new Promise(resolve => chrome.runtime.sendMessage(${JSON.stringify({ type, clearKey: true })},resolve))`);
        assert.equal(result.ok, false, `${type} cannot expose or alter private state from X`);
      }
      const after = await admin(InfluenceMessages.status);
      assert.equal(after.configured, true);
      assert.equal(after.cacheCount, before.cacheCount);
      assert.equal(JSON.stringify(after).includes(fakeKey), false);
    });

    await check("visible public posts receive independent warnings after dwell while quoted private hidden and offscreen text stay scoped", async () => {
      await storage({ influenceWarnings: "on" });
      assert.equal((await calls()).length, 0, "Enabling must not send every post before visible dwell");
      await until(calls, (items) => items.length === 5, "five visible public posts scanned");
      await page.wait(`${warningLabel("sales-post")}.includes('Possible sales pitch') && ${warningLabel("recycled-post")}.includes('Possible FOMO pressure')`);
      for (const id of ["helpful-post", "quote-post", "soft-post", "protected-post", "hidden-post", "offscreen-post"]) assert.equal(await page.evaluate(`!!(${warning(id)})`), false, id);
      const requests = await calls();
      const quotation = requests.find((item) => item.body.state.post.text.startsWith("Quote discussion"));
      assert.ok(quotation);
      assert.equal(quotation.body.state.post.text.includes("Only three spots"), false);
      assert.ok(quotation.body.state.post.quotedText.includes("Only three spots"));
      assert.equal(requests.some((item) => /Protected post|Hidden post|Offscreen post/.test(item.body.state.post.text)), false);
      for (const request of requests) {
        assert.equal(request.url, INFLUENCE_API_URL);
        assert.equal(request.body.model, INFLUENCE_MODEL);
        assert.equal(request.method, "POST");
        assert.equal(request.credentials, "omit");
        assert.equal(request.redirect, "error");
        assert.equal(request.hasAuthorization, true);
        assert.deepEqual(Object.keys(request.body.questions).sort(), ["bait", "fomo", "sales"]);
        assert.equal(JSON.stringify(request.body).includes(fakeKey), false);
        assert.equal(request.body.state.post.url, undefined, "The API needs text and context, not the browsing URL");
      }
    });

    await check("warning controls preserve native nodes and open accessible details without viewport overflow", async () => {
      assert.equal(await page.evaluate("fixture.nativeNodes.every(node => node.isConnected)"), true);
      assert.equal(await page.evaluate("document.getElementById('sales-time').getAttribute('href')"), "/fixture/status/101?s=20");
      await page.evaluate(`${warning("sales-post")}.shadowRoot.querySelector('[data-testid=mt-influence-button]').focus(); true`);
      await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" });
      await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await page.wait("!!document.getElementById('mt-influence-popover')?.shadowRoot?.querySelector('[role=dialog]')");
      const details = await page.evaluate("document.getElementById('mt-influence-popover').shadowRoot.querySelector('[data-testid=mt-influence-details]').textContent");
      assert.ok(/sales/i.test(details));
      assert.ok(/FOMO/i.test(details));
      assert.ok(/bait/i.test(details));
      assert.ok(/jev|TypeSafe/i.test(details));
      assert.ok(/images/i.test(details) && /videos/i.test(details) && /linked/i.test(details));
      const flagged = await page.evaluate("[...document.getElementById('mt-influence-popover').shadowRoot.querySelectorAll('li[data-flagged]')].map(row => row.textContent)");
      assert.equal(flagged.length, 1);
      assert.ok(/sales/i.test(flagged[0]));
      await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await page.wait("!document.getElementById('mt-influence-popover')");
      assert.equal(await page.evaluate(`document.activeElement === ${warning("sales-post")} && ${warning("sales-post")}.shadowRoot.activeElement?.dataset.testid === 'mt-influence-button'`), true, "Escape must return focus to the warning");
      for (const width of [600, 1440]) {
        await page.send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
        await page.wait("document.documentElement.scrollWidth <= innerWidth + 1");
        await page.evaluate(`${warning("sales-post")}.shadowRoot.querySelector('[data-testid=mt-influence-button]').click(); true`);
        await page.wait("!!document.getElementById('mt-influence-popover')");
        assert.equal(await page.evaluate("(() => {const r=document.getElementById('mt-influence-popover').getBoundingClientRect();return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1})()"), true);
        await page.evaluate("document.getElementById('mt-influence-popover').shadowRoot.querySelector('button').click(); true");
      }
      await page.wait("!document.getElementById('mt-influence-popover')");
      assert.equal(await page.evaluate("fixture.nativeNodes.every(node => node.isConnected) && document.getElementById('sales-post').querySelectorAll('[data-testid=reply]').length === 1"), true);
      if (capture) await capture("influence-warnings");
    });

    await check("positive and negative judgments persist across a fresh document and thresholds reuse cached probabilities", async () => {
      const before = (await calls()).length;
      await fresh();
      await storage({ influenceWarnings: "on" });
      await page.wait(`${warningLabel("sales-post")}.includes('Possible sales pitch') && ${warningLabel("recycled-post")}.includes('Possible FOMO pressure')`);
      await pause(250);
      assert.equal((await calls()).length, before, "Positive and negative cache entries must both survive navigation");
      await storage({ influenceSensitivity: 0.65 });
      await page.wait(`!!(${warning("soft-post")})`);
      await storage({ influenceSensitivity: 0.9 });
      await page.wait(`!(${warning("soft-post")})`);
      assert.equal((await calls()).length, before, "Changing the warning threshold must not rerun Jev");
      assert.equal(await page.evaluate(`!!(${warning("helpful-post")}) || !!(${warning("quote-post")})`), false);
    });

    await check("private message routes remove warnings and reject scans before any provider request", async () => {
      const before = (await calls()).length;
      await page.evaluate("history.pushState({},'', '/messages'); document.getElementById('home-header').appendChild(document.createElement('i')); true");
      await page.wait("document.querySelectorAll('[data-mt-influence-warning], #mt-influence-popover').length === 0");
      const rejected = await scan({ url: "https://x.com/fixture/status/301", text: "Private message text must not be submitted.", quotedText: "", links: [] });
      assert.equal(rejected.ok, false);
      assert.equal(rejected.error, "not-allowed");
      assert.equal((await calls()).length, before);
      await page.evaluate("history.pushState({},'', '/home'); document.getElementById('home-header').appendChild(document.createElement('i')); true");
      await page.wait(`${warningLabel("sales-post")}.includes('Possible sales pitch')`);
      assert.equal((await calls()).length, before);
    });

    await check("recycled native posts invalidate URL and text evidence and clear obsolete warning controls", async () => {
      const nodeIsSame = "document.getElementById('recycled-post') === window.__influenceRecycledNode";
      const before = (await calls()).length;
      await page.evaluate("window.__influenceRecycledNode = document.getElementById('recycled-post'); fixture.reuse('recycled-post',105,'New useful advice: use a partial index when a stable WHERE clause excludes most rows.'); true");
      await page.wait(`!(${warning("recycled-post")})`);
      await until(calls, (items) => items.length === before + 1, "same-URL changed text rescanned");
      await pause(150);
      assert.equal(await page.evaluate(nodeIsSame), true);
      assert.equal(await page.evaluate(`!!(${warning("recycled-post")})`), false);
      await page.evaluate("fixture.reuse('recycled-post',205,'Fear of missing out: join tonight or everyone else will leave you behind.'); true");
      await page.wait(`${warningLabel("recycled-post")}.includes('Possible FOMO pressure')`);
      assert.equal((await calls()).length, before + 2);
      assert.equal(await page.evaluate(nodeIsSame), true);
    });

    await check("protected quotations and incomplete post headers stay entirely local without model requests", async () => {
      await quiet();
      const before = (await calls()).length;
      await page.evaluate("fixture.addProtectedQuote('protected-quote-post',609); fixture.addHeaderlessPost('headerless-post',610); true");
      await storage({ influenceWarnings: "on" });
      await pause(1100);
      assert.equal((await calls()).length, before, "A protected quoted author excludes the entire enclosing public post");
      assert.equal(await page.evaluate(`!!(${warning("protected-quote-post")})`), false);
      assert.equal(await page.evaluate(`!!(${warning("headerless-post")})`), false);
      assert.equal(await page.evaluate("document.getElementById('protected-quote-post').getBoundingClientRect().height > 0 && document.querySelector('#protected-quote-post [aria-label=\"Protected account\"]') !== null"), true);
      assert.equal(await page.evaluate("document.getElementById('headerless-post').getBoundingClientRect().height > 0 && document.querySelector('#headerless-post a time') !== null"), true);
      assert.equal(JSON.stringify(await calls()).includes("Protected quoted secret"), false);
      assert.equal(JSON.stringify(await calls()).includes("headerless incomplete post"), false);
    });

    await check("late responses cannot attach warnings after disable or virtual-node reuse", async () => {
      await quiet();
      await worker("globalThis.__zenInfluenceFixture.mode = 'hold'; true");
      let before = (await calls()).length;
      await page.evaluate("fixture.addPost('pending-post',501,'Sales offer: buy the old coaching package for $299.'); true");
      await storage({ influenceWarnings: "on" });
      await until(calls, (items) => items.length === before + 1, "held post request");
      await page.evaluate("fixture.reuse('pending-post',502,'New useful advice: run EXPLAIN ANALYZE before adding an index.'); true");
      await worker("globalThis.__zenInfluenceFixture.mode = 'ok'; for(const pending of [...globalThis.__zenInfluenceFixture.pending]) pending.finish(); true");
      await until(calls, (items) => items.length === before + 2, "new post after pending-node reuse");
      await pause(200);
      assert.equal(await page.evaluate(`!!(${warning("pending-post")})`), false);
      await storage({ influenceWarnings: "off" });
      await page.evaluate("fixture.reuse('pending-post',503,'Sales offer: buy a different package for $399.'); true");
      await worker("globalThis.__zenInfluenceFixture.mode = 'hold'; true");
      before = (await calls()).length;
      await storage({ influenceWarnings: "on" });
      await until(calls, (items) => items.length === before + 1, "held request before disable");
      await storage({ influenceWarnings: "off" });
      await worker("globalThis.__zenInfluenceFixture.mode = 'ok'; for(const pending of [...globalThis.__zenInfluenceFixture.pending]) pending.finish(); true");
      await pause(250);
      assert.equal(await page.evaluate("document.querySelectorAll('[data-mt-influence-warning], #mt-influence-popover').length"), 0);
    });

    await check("daily scan cap blocks new requests while cached positive and negative results remain usable", async () => {
      await quiet();
      const status = await admin(InfluenceMessages.status);
      assert.ok(status.dailyUsed >= 5 && status.dailyUsed <= 2000);
      await storage({ influenceWarnings: "on", influenceDailyLimit: status.dailyUsed });
      const before = (await calls()).length;
      const blocked = await scan({ url: "https://x.com/fixture/status/601", text: "Sales offer: buy a new uncached package.", quotedText: "", links: [] });
      assert.equal(blocked.ok, false);
      assert.equal(blocked.error, "daily-limit");
      for (const [id, statusId] of [["sales-post", 101], ["helpful-post", 102]]) {
        const cached = await scan(await nativePost(id, statusId));
        assert.equal(cached.ok, true);
        assert.equal(cached.cached, true);
      }
      assert.equal((await calls()).length, before);
      await storage({ influenceDailyLimit: 200 });
    });

    await check("raising the daily cap while an old blocked reply is pending resumes one visible scan", async () => {
      await quiet();
      const status = await admin(InfluenceMessages.status);
      const before = (await calls()).length;
      await storage({ influenceDailyLimit: status.dailyUsed });
      await isolated(`(() => {
        const original = chrome.runtime.sendMessage;
        const fixture = globalThis.__zenInfluenceCapRace = {original,held:null,didHold:false,attempts:0};
        chrome.runtime.sendMessage = function(message,callback) {
          const watched = message?.type === ${JSON.stringify(InfluenceMessages.scan)} && /\\/status\\/620$/.test(message.post?.url || '');
          if (!watched || typeof callback !== 'function') return original.apply(chrome.runtime,arguments);
          fixture.attempts++;
          return original.call(chrome.runtime,message,response => {
            if (response?.error === 'daily-limit' && !fixture.didHold) {
              fixture.didHold = true;
              fixture.held = () => {fixture.held = null; callback(response);};
            } else callback(response);
          });
        };
        return true;
      })()`);
      try {
        await page.evaluate("fixture.addPost('cap-race-post',620,'Sales offer: a visible post should resume when its daily scan cap increases.'); true");
        await storage({ influenceWarnings: "on" });
        await until(() => isolated("!!globalThis.__zenInfluenceCapRace.held"), (held) => held, "real daily-limit reply buffered in the content world");
        assert.equal((await calls()).length, before, "The old cap must block the initial model request");
        await storage({ influenceDailyLimit: status.dailyUsed + 1 });
        await pause(500);
        await isolated("globalThis.__zenInfluenceCapRace.held(); true");
        await page.wait(`${warningLabel("cap-race-post")}.includes('Possible sales pitch')`);
        await pause(850);
        assert.equal((await calls()).length, before + 1, "Only the fresh allowed scan may reach Jev");
        assert.equal(await isolated("globalThis.__zenInfluenceCapRace.attempts"), 2, "One blocked attempt and one resumed attempt are expected");
      } finally {
        await storage({ influenceWarnings: "off", influenceDailyLimit: 200 });
        await isolated("if(globalThis.__zenInfluenceCapRace){ chrome.runtime.sendMessage=globalThis.__zenInfluenceCapRace.original; globalThis.__zenInfluenceCapRace.held?.(); delete globalThis.__zenInfluenceCapRace;} true");
      }
    });

    await check("authentication rate limits and malformed model answers fail open without badges or automatic retries", async () => {
      await quiet();
      for (const [mode, id] of [["malformed", 701], ["429", 702], ["401", 703]]) {
        await configure();
        await worker(`globalThis.__zenInfluenceFixture.mode = ${JSON.stringify(mode)}; true`);
        await page.evaluate(`fixture.removeLate(); fixture.addPost('service-post',${id},'Sales offer: service failure must leave this post visible.'); true`);
        await storage({ influenceWarnings: "on" });
        const before = (await calls()).length;
        const result = await scan({ url: `https://x.com/fixture/status/${id}`, text: "Sales offer: service failure must leave this post visible.", quotedText: "", links: [] });
        assert.equal(result.ok, false, mode);
        assert.equal(typeof result.error, "string");
        assert.equal(JSON.stringify(result).includes(fakeKey), false);
        await pause(900);
        assert.equal(await page.evaluate("document.getElementById('service-post').getBoundingClientRect().height > 0"), true);
        assert.equal(await page.evaluate(`!!(${warning("service-post")})`), false);
        assert.equal((await calls()).length, before + 1);
        await storage({ influenceWarnings: "off" });
      }
      await worker("globalThis.__zenInfluenceFixture.mode = 'ok'; true");
      await configure();
    });

    await check("API keys never enter page DOM preference storage status or settings exports and clearing is explicit", async () => {
      const local = await popup.evaluate("new Promise(resolve => chrome.storage.local.get(null,resolve))");
      assert.equal(JSON.stringify(local).includes(fakeKey), false);
      assert.equal(await page.evaluate(`document.documentElement.outerHTML.includes(${JSON.stringify(fakeKey)})`), false);
      assert.equal(await popup.evaluate("document.getElementById('jev-api-key').value"), "");
      assert.equal(JSON.stringify(await admin(InfluenceMessages.status)).includes(fakeKey), false);
      await popup.evaluate("window.__influenceCreateURL = URL.createObjectURL; URL.createObjectURL = blob => {window.__influenceExport=blob; return window.__influenceCreateURL(blob);}; window.__influenceBlockDownload = event => {if(event.target.closest('a[download]'))event.preventDefault();}; document.addEventListener('click',window.__influenceBlockDownload,true); [...document.querySelectorAll('button')].find(button=>button.textContent === 'Export Settings').click(); true");
      try {
        await popup.wait("!!window.__influenceExport");
        const exported = await popup.evaluate("window.__influenceExport.text()");
        assert.equal(exported.includes(fakeKey), false);
        assert.equal(exported.includes("zenInfluenceCacheV1"), false);
        assert.equal(exported.includes("zenInfluenceBudgetV1"), false);
        assert.equal(JSON.parse(exported).settings.influenceWarnings, "off");
      } finally {
        await popup.evaluate("URL.createObjectURL = window.__influenceCreateURL; document.removeEventListener('click',window.__influenceBlockDownload,true); delete window.__influenceCreateURL; delete window.__influenceBlockDownload; delete window.__influenceExport; true");
      }
      assert.equal((await admin(InfluenceMessages.clearCache)).cacheCount, 0);
      assert.equal((await admin(InfluenceMessages.configure, { clearKey: true })).configured, false);
      assert.equal((await admin(InfluenceMessages.status)).configured, false);
    });
  } finally {
    browser.removeListener("event", contextListener);
    const failures = [];
    const clean = async (action) => { try { await action(); } catch (error) { failures.push(error.message); } };
    await clean(() => storage({ influenceWarnings: "off" }));
    await clean(() => admin(InfluenceMessages.configure, { clearKey: true }));
    await clean(() => admin(InfluenceMessages.clearCache));
    if (workerSessionId) {
      await clean(() => worker("if(globalThis.__zenInfluenceFixture){ for(const pending of [...globalThis.__zenInfluenceFixture.pending])pending.finish(); globalThis.fetch=globalThis.__zenInfluenceFixture.original; delete globalThis.__zenInfluenceFixture;} true"));
      await clean(() => browser.send("Target.detachFromTarget", { sessionId: workerSessionId }));
    }
    await clean(() => popup.send("Extensions.removeStorageItems", { id: browser.extensionId, storageArea: "local", keys: ["zenInfluenceCacheV1", "zenInfluenceBudgetV1", "zenInfluenceServiceV1"] }));
    await clean(() => storage(saved));
    const absent = settings.filter((key) => !(key in saved));
    if (absent.length) await clean(() => popup.send("Extensions.removeStorageItems", { id: browser.extensionId, storageArea: "local", keys: absent }));
    await clean(() => page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }));
    assert.deepEqual(failures, [], "Influence audit must restore preferences, key/cache and fetch without lingering work");
  }
  return settings.map((setting) => ({ setting, status: "pass" }));
}
