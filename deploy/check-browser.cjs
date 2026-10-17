const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../dist/site');
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.png':'image/png','.mp4':'video/mp4'};
const server=http.createServer((req,res)=>{
 const f=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname.replace(/\/$/,'/index.html')));
 if(!f.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f));}catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 let checks=0;const errors=[];
 try{
  for(const width of [390,1440]){
   const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base);await page.waitForFunction(()=>document.querySelector('video').currentTime>.15);
   for(const lang of ['ru','en']){
    await page.locator(`[data-lang="${lang}"]`).click();
    const s=await page.evaluate(()=>{const h=document.querySelector('.brand-intro').getBoundingClientRect(),v=document.querySelector('video');return {height:h.bottom,width:h.width,overflow:document.documentElement.scrollWidth>innerWidth,controls:v.controls,paused:v.paused,buttons:document.querySelectorAll('.brand-intro button,.hero-film-control').length}});
    assert.ok(Math.abs(s.height-900)<1);assert.equal(s.width,width);assert.equal(s.overflow,false);assert.equal(s.controls,false);assert.equal(s.paused,false);assert.equal(s.buttons,0);checks++;
   }
   await page.goto(base+'/talent.html');
   for(const lang of ['ru','en']){await page.locator(`[data-lang="${lang}"]`).click();assert.equal(await page.locator('a[href="tel:+79165362414"]').count(),0);assert.equal(await page.locator('.recruit-contact-card a[href="tel:+74951081801"]').count(),1);checks++;}
   await page.goto(base+'/education.html');assert.ok(await page.locator('img[src*="portrait-cropped.png"]').count());checks++;await page.close();
  }
  for(const mode of ['reduce','blocked']){
   const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:mode==='reduce'?'reduce':'no-preference'});
   if(mode==='blocked')await ctx.addInitScript(()=>{const p=HTMLMediaElement.prototype,a=Object.getOwnPropertyDescriptor(p,'autoplay');Object.defineProperty(p,'autoplay',{get:a.get,set(){a.set.call(this,false)}});p.play=function(){return Promise.reject(new DOMException('Test browser restriction','NotAllowedError'))}});
   const p=await ctx.newPage();await p.goto(base);await p.waitForFunction(()=>document.querySelector('.hero-poster').naturalWidth>0);await p.waitForTimeout(250);
   assert.equal(await p.locator('video').evaluate(v=>getComputedStyle(v).opacity),'0');checks++;await ctx.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({browser_checks:checks,errors}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
