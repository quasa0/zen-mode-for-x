import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {join} from "node:path";

// Audited against the installed uBlock Origin source and its upstream messaging
// implementation: https://github.com/gorhill/uBlock/blob/master/src/js/messaging.js
// Pause only X in the dedicated test profile. Keep the previous trusted-site list
// in memory and restore it before closing the browser.
export async function pauseTestBrowserBlocker({browser,profile}) {
  let preferences;
  try {preferences=JSON.parse(await readFile(join(profile,"Default/Secure Preferences"),"utf8"));}
  catch(error) {if(error.code === "ENOENT")return {report:{present:false},verify:async()=>{},restore:async()=>{}};throw error;}
  const installed=Object.entries(preferences.extensions?.settings || {}).filter(([,value])=>value.manifest?.name === "uBlock Origin");
  if(!installed.length)return {report:{present:false},verify:async()=>{},restore:async()=>{}};
  assert.equal(installed.length,1,"The live audit supports one installed uBlock Origin");
  const [id]=installed[0];
  const control=await browser.page(`chrome-extension://${id}/popup-fenix.html`);
  let original,changed=false,restored=false;
  const report={present:true,extensionId:id,site:"x.com",verifiedReads:0};
  const message=(request,channel="dashboard")=>control.evaluate(`vAPI.messaging.send(${JSON.stringify(channel)},${JSON.stringify(request)})`);
  const restore=async()=>{
    if(restored)return;
    if(changed) {
      await message({what:"setWhitelist",whitelist:original.join("\n")});
      const actual=await message({what:"getWhitelist"});
      assert.deepEqual([...actual.whitelist].sort(),[...original].sort(),"Restore the dedicated profile's previous trusted sites");
    }
    restored=true;report.restored=true;
    await control.close();
  };
  try {
    await control.wait(`chrome.runtime.id === ${JSON.stringify(id)} && typeof vAPI?.messaging?.send === 'function'`);
    const {manifest,source}=await control.evaluate("fetch('js/messaging.js').then(response => {if(!response.ok)throw new Error('Installed blocker source unavailable');return response.text();}).then(source=>({manifest:chrome.runtime.getManifest(),source}))");
    assert.equal(manifest.name,"uBlock Origin");
    assert.ok(source.includes("case 'getWhitelist':") && source.includes("case 'setWhitelist':") &&
      source.includes("µb.netWhitelist = µb.whitelistFromString(request.whitelist)"),"Installed blocker must expose the reviewed trusted-site API");
    report.version=manifest.version;
    report.messagingSha256=createHash("sha256").update(source).digest("hex");
    await control.wait("vAPI.messaging.send('dashboard',{what:'readyToFilter'}).then(value=>value === true)");
    const saved=await message({what:"getWhitelist"});
    assert.ok(Array.isArray(saved.whitelist) && saved.whitelist.every(value=>typeof value === "string"));
    original=saved.whitelist;
    if(!original.includes("x.com")) {
      // Record cleanup responsibility before the mutation, including interrupted calls.
      changed=true;
      await message({what:"setWhitelist",whitelist:[...original,"x.com"].join("\n")});
    }
    const paused=await message({what:"getWhitelist"});
    assert.ok(paused.whitelist.includes("x.com"));
    report.changed=changed;
    const verify=async()=>{
      const tabs=await control.evaluate("chrome.tabs.query({url:'https://x.com/*'}).then(tabs=>tabs.map(({id,url})=>({id,url})))");
      assert.equal(tabs.length,1,"Verify blocker state for the one owned X audit tab");
      const state=await message({what:"getPopupData",tabId:tabs[0].id},"popupPanel");
      assert.equal(state.pageHostname,"x.com");
      assert.equal(state.netFilteringSwitch,false,"uBlock Origin must not remove X ads during this extension's live audit");
      report.verifiedReads++;
    };
    return {report,verify,restore};
  } catch(error) {
    try {await restore();} catch(cleanupError) {error.cleanupErrors=[{step:"Restore browser blocker",error:cleanupError.message}];}
    throw error;
  }
}
