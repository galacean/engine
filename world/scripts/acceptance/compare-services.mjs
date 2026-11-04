import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const out=path.resolve(import.meta.dirname,'../../.acceptance/services');
const summary=[];
const actionsOnly = Boolean(process.env.SERVICE_ACTIONS_ONLY);
const suffix = actionsOnly ? '-actions' : '';
const browser=await chromium.launch({headless:true,args:['--ignore-gpu-blocklist','--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const stats=a=>{a.sort((a,b)=>a-b);return {n:a.length,median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)]}};
try {
for(const [kind,ports] of [['resident',[5203,5204]],['masonry',[5201,5202]]]) {
 for(const variant of process.env.REVERSE_ORDER ? ['migrated','baseline'] : ['baseline','migrated']) {
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  const row={kind,variant,errors:[],httpFailures:[],windows:[]};
  page.on('pageerror',e=>row.errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)row.httpFailures.push({url:r.url(),status:r.status()})});
  await page.addInitScript(()=>{
   const raf=window.requestAnimationFrame.bind(window);
   window.__serviceTiming={active:false,cpu:[],frames:[],last:undefined};
   window.requestAnimationFrame=callback=>raf(t=>{
    const s=window.__serviceTiming, start=performance.now();
    if(s.active && t!==s.last) {if(s.last!==undefined)s.frames.push(t-s.last);s.last=t;}
    try{callback(t)}finally{if(s.active)s.cpu.push(performance.now()-start)}
   });
  });
  const port=ports[Number(variant==='migrated')];
  await page.goto(`http://127.0.0.1:${port}/?workspace=round-gothic`);
  await page.waitForFunction(()=> (window.resident?.metrics.frames ?? window.__surfaceDemo?.metrics?.frames ?? 0)>60);
  await page.waitForTimeout(3000);
  for(let i=0;i<(actionsOnly ? 0 : 3);i++) {
   await page.evaluate(()=>Object.assign(window.__serviceTiming,{active:true,cpu:[],frames:[],last:undefined}));
   await page.waitForTimeout(5000);
   const measured=await page.evaluate(()=>{window.__serviceTiming.active=false;return {timing:window.__serviceTiming,renderer:window.resident?.metrics??window.__surfaceDemo?.metrics}});
   row.windows.push({cpu:stats(measured.timing.cpu),frame:stats(measured.timing.frames),renderer:measured.renderer});
  }
  const canvas=page.locator(kind==='resident'?'canvas':'#scene-canvas');
  row.screenshot=path.join(out,`${kind}-${variant}${suffix}-verified.png`);
  await canvas.screenshot({path:row.screenshot});
  if(kind==='resident') {
   row.originalDocument=await page.evaluate(()=>window.resident.document);
   await page.locator('#audit').click();
   await page.waitForFunction(()=>document.querySelector('#audit-result').textContent.includes('coverageMismatch'));
   row.captureAudit=JSON.parse(await page.locator('#audit-result').innerText());
   row.edits=[];
   for(const selector of ['[data-unit="wooden_plank"]','#local','#hide','#reset']) {
    await page.locator(selector).click();
    row.edits.push({selector,metrics:await page.evaluate(()=>window.resident.metrics.lastEdit)});
   }
   await canvas.screenshot({path:path.join(out,`${kind}-${variant}${suffix}-reset.png`)});
  } else {
   row.state=await page.evaluate(()=>window.__surfaceDemo);
   // Layer visibility is a real client operation; publication is covered separately over HTTP.
   const first=page.locator('#layers button[aria-pressed="true"]').first();
   if(await first.count()) {
    const layer=await first.getAttribute('data-layer');
    await first.click();
    row.hiddenState=await page.evaluate(()=>window.__surfaceDemo);
    await page.locator(`#layers button[data-layer="${layer}"]`).click();
    row.restoredState=await page.evaluate(()=>window.__surfaceDemo);
    if(row.hiddenState.draws >= row.state.draws || row.restoredState.draws !== row.state.draws)
      throw Error('Layer visibility did not hide and restore actual draws');
   }
  }
  fs.writeFileSync(path.join(out,`${kind}-${variant}${suffix}-verification.json`),JSON.stringify(row,null,2));
  summary.push(row);console.log(kind,variant,JSON.stringify({errors:row.errors,httpFailures:row.httpFailures,windows:row.windows.map(w=>({cpu:w.cpu,frame:w.frame})),audit:row.captureAudit?.total}));
  await page.close();
 }
}
} finally {await browser.close();fs.writeFileSync(path.join(out,`verification${suffix}.json`),JSON.stringify(summary,null,2));}
