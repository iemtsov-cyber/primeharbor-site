// Isolated browser regression test. No user browser profile or credentials.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.env.TEST_SITE_ROOT || path.join(__dirname,'../dist/site'));
const origin='https://primeharbor.ru', key='primeharbor-analytics-consent';
const consent=(statistics,replay=false)=>({version:'2026-10-17-v1',statistics,replay,expires:Date.now()+86400000});
const vendorStub=`window.__metricaCalls=[];window.ym=function(){window.__metricaCalls.push(Array.from(arguments))};`;
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.pdf':'application/pdf'};
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true});
 let checks=0;
 async function setup({stored,url='/talent.html',width=1440,storageBlocked=false,delayVendor=false}={}){
  const context=await browser.newContext({viewport:{width,height:900},locale:'ru-RU'});
  if(stored)await context.addInitScript(({key,stored})=>localStorage.setItem(key,JSON.stringify(stored)),{key,stored});
  if(storageBlocked)await context.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage unavailable')}})});
  const requests=[],pending=[];
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin===origin){
    const f=path.resolve(root,'.'+u.pathname.replace(/\/$/,'/index.html'));
    if(!f.startsWith(root+path.sep))return route.abort();
    try{return await route.fulfill({body:fs.readFileSync(f),contentType:types[path.extname(f)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:''});}
   }
   if(/(^|\.)yandex\./.test(u.hostname)){
    requests.push(u.href);
    if(delayVendor){pending.push(route);return;}
    return route.fulfill({body:vendorStub,contentType:'application/javascript'});
   }
   return route.abort();
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+url);await page.waitForTimeout(100);
  return {context,page,requests,pending,errors};
 }
 try{
  // Viewing, closing and rejecting the banner never load the vendor or set its cookies.
  for(const width of [390,1440]){
   const t=await setup({width});
   assert.equal(t.requests.length,0);assert.equal((await t.context.cookies()).length,0);
   assert.equal(await t.page.locator('[data-analytics-banner]').isVisible(),true);
   for(const lang of ['ru','en']){
    await t.page.locator(`[data-lang="${lang}"]`).click();
    assert.equal(await t.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const b=await t.page.locator('[data-analytics-banner]').boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width&&b.y>=0&&b.y+b.height<=900);checks++;
   }
   await t.page.locator('[data-analytics-close]').click();assert.equal(t.requests.length,0);
   await t.page.locator('[data-analytics-settings]').click();await t.page.locator('[data-analytics-choice="reject"]').click();
   await t.page.reload();assert.equal(t.requests.length,0);assert.equal(await t.page.locator('[data-analytics-banner]').isVisible(),false);
   assert.deepEqual(t.errors,[]);checks++;await t.context.close();
  }
  // Both opt-in branches: only four generic goals; no field/link payloads.
  for(const replay of [false,true]){
   const t=await setup();
   await t.page.evaluate(()=>{const f=document.createElement('form');f.className='ym-show-content';f.innerHTML='<input class="ym-record-keys" value="SYNTHETIC_PRIVATE_CANARY"><textarea class="ym-show-content">SYNTHETIC_MESSAGE_CANARY</textarea>';document.body.append(f);});
   await t.page.locator(`[data-analytics-choice="${replay?'replay':'statistics'}"]`).click();
   await t.page.waitForFunction(()=>window.__metricaCalls?.some(c=>c[1]==='reachGoal'));
   assert.equal(t.requests.length,1);
   const calls=await t.page.evaluate(()=>window.__metricaCalls);
   const init=calls.find(c=>c[1]==='init')[2];
   assert.equal(init.webvisor,replay);assert.equal(init.defer,true);assert.equal(init.trackLinks,false);assert.equal(init.ecommerce,false);assert.equal(init.clickmap,false);assert.equal(init.sendTitle,false);
   assert.deepEqual(calls.find(c=>c[1]==='hit'),[113659573,'hit',origin+'/talent.html',{title:'Prime Harbor — Talent',referer:''}]);
   assert.equal(await t.page.locator('form.ym-hide-content.ym-disable-submit').count(),1);
   assert.equal(await t.page.locator('input.ym-hide-content.ym-disable-keys,textarea.ym-hide-content.ym-disable-keys').count(),2);
   assert.equal(await t.page.locator('form .ym-record-keys,form .ym-show-content').count(),0);
   assert.equal(await t.page.locator('.legal-details.ym-hide-content').count(),1);
   await t.page.evaluate(()=>{
    document.addEventListener('click',e=>{if(e.target.closest('a'))e.preventDefault()});
    for(const href of ['assets/docs/Prime_Harbor_Recruitment_Sri_Lanka_2026.pdf','tel:+74951081801','mailto:igor@primeharbor.ru?body=SYNTHETIC_MESSAGE_CANARY','https://example.org/private']){
     const a=document.createElement('a');a.href=href;document.body.append(a);a.click();a.remove();
    }
   });
   const goals=await t.page.evaluate(()=>window.__metricaCalls.filter(c=>c[1]==='reachGoal'));
   assert.deepEqual(goals.map(c=>c[2]),['talent_view','proposal_download','phone_click','email_click']);
   assert.ok(goals.every(c=>c.length===3));
   await t.page.evaluate(()=>{document.cookie='_ym_uid=test;path=/';localStorage.setItem('_ym_test','test')});
   await t.page.locator('[data-analytics-settings]').click();
   await Promise.all([t.page.waitForEvent('load'),t.page.locator('[data-analytics-choice="reject"]').click()]);
   assert.equal(t.requests.length,1);assert.equal(await t.page.evaluate(()=>localStorage.getItem('_ym_test')),null);
   assert.ok((await t.context.cookies()).every(c=>!c.name.startsWith('_ym')));
   assert.deepEqual(t.errors,[]);checks+=6;await t.context.close();
  }
  // Unknown URL values, duplicated tags and other pages are not eligible for collection.
  for(const url of ['/talent.html?email=canary%40example.invalid','/talent.html#SYNTHETIC_PRIVATE_CANARY','/talent.html?utm_source=unexpected','/talent.html?utm_source=primeharbor&utm_source=primeharbor','/index.html']){
   const t=await setup({stored:consent(true,true),url});assert.equal(t.requests.length,0);checks++;await t.context.close();
  }
  const signature=await setup({stored:consent(true),url:'/talent.html?utm_source=primeharbor&utm_medium=email&utm_campaign=recruitment_2026&utm_content=signature_link#enquiry'});
  await signature.page.waitForFunction(()=>window.__metricaCalls?.length>1);
  assert.equal((await signature.page.evaluate(()=>window.__metricaCalls.find(c=>c[1]==='hit')[2])).includes('#'),false);checks++;await signature.context.close();
  for(const stored of [{...consent(true),expires:Date.now()-1},{...consent(true),version:'old'},'malformed']){
   const t=await setup({stored});assert.equal(t.requests.length,0);assert.equal(await t.page.locator('[data-analytics-banner]').isVisible(),true);checks++;await t.context.close();
  }
  const blocked=await setup({storageBlocked:true});await blocked.page.locator('[data-analytics-choice="statistics"]').click();assert.equal(blocked.requests.length,0);assert.deepEqual(blocked.errors,[]);checks++;await blocked.context.close();
  // Withdrawal while the vendor download is pending cannot initialize the counter later.
  const race=await setup({delayVendor:true});await race.page.locator('[data-analytics-choice="replay"]').click();await race.page.locator('[data-analytics-settings]').click();
  await Promise.all([race.page.waitForEvent('load'),race.page.locator('[data-analytics-choice="reject"]').click()]);
  for(const r of race.pending)await r.fulfill({body:vendorStub,contentType:'application/javascript'}).catch(()=>{});
  assert.equal(race.requests.length,1);assert.equal(await race.page.evaluate(()=>typeof window.ym),'undefined');checks++;await race.context.close();
  console.log(JSON.stringify({consent_checks:checks,third_party_requests_before_consent:0,goals:['talent_view','proposal_download','phone_click','email_click'],errors:[]}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
