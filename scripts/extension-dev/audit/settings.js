import assert from "node:assert/strict";
import {allSettingsKeys, defaultPreferences} from "../../../storage-keys.js";

export async function runSettingsAudit({page,popup,storage,check,loadFixture}) {
  await loadFixture("filters.html");
  await check("settings export includes registered defaults and current values without private metadata",async()=>{
    await storage({...defaultPreferences,removeAiPosts:"on",scrollLimitMinutes:17});
    await popup.evaluate(`window.__settingsNativeCreateObjectURL = URL.createObjectURL;
      URL.createObjectURL = blob => {window.__settingsAuditBlob=blob;return window.__settingsNativeCreateObjectURL(blob);};
      window.__settingsPreventDownload = event => {if(event.target.closest('a[download]'))event.preventDefault();};
      document.addEventListener('click',window.__settingsPreventDownload,true);
      [...document.querySelectorAll('button')].find(button=>button.textContent === 'Export Settings').click(); true`);
    try {
      await popup.wait("!!window.__settingsAuditBlob");
      const payload = await popup.evaluate("window.__settingsAuditBlob.text().then(JSON.parse)");
      assert.equal(payload.version,1);
      assert.deepEqual(Object.keys(payload.settings).sort(),[...allSettingsKeys].sort());
      assert.deepEqual(payload.settings,{...defaultPreferences,removeAiPosts:"on",scrollLimitMinutes:17});
      assert.ok(Number.isFinite(Date.parse(payload.exportedAt)));
    } finally {
      await popup.evaluate("URL.createObjectURL = window.__settingsNativeCreateObjectURL; document.removeEventListener('click',window.__settingsPreventDownload,true); delete window.__settingsAuditBlob; delete window.__settingsNativeCreateObjectURL; delete window.__settingsPreventDownload; true");
    }
  });
  const importText = async text => {
    await popup.evaluate(`(() => {const input=document.querySelector('footer input[type=file]');const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(text)}],'settings.json',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  };
  await check("settings import updates independent filters and limits while ignoring unrelated fields",async()=>{
    await importText(JSON.stringify({version:1,settings:{removeAiPosts:"off",removePaidPartnershipPosts:"on",scrollLimitMinutes:23,allVanity:"hide",unrelatedPrivateField:"must not import"}}));
    await popup.wait("document.querySelector('footer').textContent.includes('Settings imported.')");
    const {data} = await popup.send("Extensions.getStorageItems",{id:page.browser.extensionId,storageArea:"local",keys:["removeAiPosts","removePaidPartnershipPosts","scrollLimitMinutes","unrelatedPrivateField","allVanity"]});
    assert.deepEqual(data,{removeAiPosts:"off",removePaidPartnershipPosts:"on",scrollLimitMinutes:23});
    await page.wait("document.getElementById('paid-post').getClientRects().length === 0 && document.getElementById('ai-post').getClientRects().length > 0");
    await popup.wait("document.getElementById('scrollLimitMinutes').value === '23'");
    assert.equal(await popup.evaluate("document.querySelector('footer input[type=file]').value"),"");
  });
  await check("malformed settings imports preserve saved preferences and report failure",async()=>{
    const before = await popup.send("Extensions.getStorageItems",{id:page.browser.extensionId,storageArea:"local",keys:allSettingsKeys});
    await importText('{invalid JSON');
    await popup.wait("document.querySelector('footer').textContent.includes('Import failed.')");
    const after = await popup.send("Extensions.getStorageItems",{id:page.browser.extensionId,storageArea:"local",keys:allSettingsKeys});
    assert.deepEqual(after.data,before.data);
    assert.equal(await popup.evaluate("document.querySelector('footer input[type=file]').value"),"");
  });
  return [];
}
