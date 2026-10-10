// Takes the README pictures in docs/screenshots/ from the sample casebook (js/demo.js, invented players and games),
// in dark mode, with the site's real fonts.
// Run: PW=<path to playwright> CHROME=<path to chromium> FONTS=<a clone of github.com/google/fonts> node scripts/screenshots.js
// FONTS is optional; without it the pictures fall back to the browser's own fonts.
const {chromium}=require(process.env.PW||'playwright');const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),out=path.join(root,'docs','screenshots');fs.mkdirSync(out,{recursive:true});
const types={html:'text/html',js:'text/javascript',css:'text/css',png:'image/png',webmanifest:'application/manifest+json'};
const G=process.env.FONTS,FONTS=G?{
  '/ss.ttf':G+'/ofl/sourcesans3/SourceSans3[wght].ttf','/lf.ttf':G+'/ofl/librefranklin/LibreFranklin[wght].ttf',
  '/fell.ttf':G+'/ofl/imfellenglish/IMFeENrm28P.ttf','/fellit.ttf':G+'/ofl/imfellenglish/IMFeENit28P.ttf','/mono.ttf':G+'/ofl/ibmplexmono/IBMPlexMono-Medium.ttf'}:{};
const FONTCSS=G?"@font-face{font-family:'Source Sans 3';font-weight:200 900;src:url(https://f.test/ss.ttf)}@font-face{font-family:'Libre Franklin';font-weight:100 900;src:url(https://f.test/lf.ttf)}"+
  "@font-face{font-family:'IM Fell English';src:url(https://f.test/fell.ttf)}@font-face{font-family:'IM Fell English';font-style:italic;src:url(https://f.test/fellit.ttf)}@font-face{font-family:'IBM Plex Mono';font-weight:500;src:url(https://f.test/mono.ttf)}":'';
// the README pictures don't need the sample's "nothing is saved" note
const HIDE='.demoban{display:none!important}';
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME||undefined});
  async function page(vp,scale,url){
    const c=await browser.newContext({viewport:vp,deviceScaleFactor:scale,colorScheme:'dark',serviceWorkers:'block',isMobile:vp.width<500,hasTouch:vp.width<500});
    await c.route('**/*',r=>{const u=new URL(r.request().url());
      if(u.hostname==='fonts.googleapis.com')return r.fulfill({body:FONTCSS,contentType:'text/css'});
      if(u.hostname==='f.test'&&FONTS[u.pathname])return r.fulfill({body:fs.readFileSync(FONTS[u.pathname]),contentType:'font/ttf'});
      // signed out (the welcome page) uses the test stand-in for Firebase; the sample replaces it with js/localfb.js
      if(u.hostname==='www.gstatic.com')return r.fulfill({body:u.pathname.includes('firebase-app-compat')?fs.readFileSync(path.join(root,'test','fake-firebase.js'),'utf8'):'',contentType:'text/javascript'});
      if(u.hostname!=='mom.test')return r.abort();
      if(u.pathname==='/__/firebase/init.json')return r.fulfill({body:'{"projectId":"momcasebook"}',contentType:'application/json'});
      const f=path.join(root,u.pathname==='/'?'index.html':decodeURIComponent(u.pathname));
      if(!fs.existsSync(f))return r.fulfill({status:404,body:''});
      r.fulfill({body:fs.readFileSync(f),contentType:types[f.split('.').pop()]||'application/octet-stream'});});
    const p=await c.newPage();await p.goto('https://mom.test/'+(url===undefined?'?demo=1':url));
    await p.addStyleTag({content:HIDE});await p.evaluate(()=>document.fonts.ready);
    return p;
  }
  const settle=async(p,keepScroll)=>{await p.mouse.move(1,1);await p.evaluate(k=>{if(document.activeElement)document.activeElement.blur();if(!k)window.scrollTo(0,0);document.querySelectorAll('.dlg').forEach(d=>d.scrollTop=0);return document.fonts.ready;},!!keepScroll);await p.waitForTimeout(350);};
  const shot=async(p,name,clipH)=>{await settle(p);const o={path:path.join(out,name)};
    if(clipH){const w=p.viewportSize().width;o.clip={x:0,y:0,width:w,height:clipH};o.fullPage=true;}await p.screenshot(o);console.log('wrote',name);};
  const tab=async(p,t)=>{await p.click('[data-t='+t+']');await p.waitForTimeout(200);};
  const W={width:1000,height:720},WS=1.4,P={width:390,height:844},PS=600/390;

  // Computer
  let p=await page(W,WS);await p.waitForSelector('.plays > li');
  await shot(p,'plays.png',700);
  await tab(p,'scenarios');await p.locator('details[data-box=starred] .desc summary').first().click();
  await shot(p,'scenarios.png',760);
  await tab(p,'players');await shot(p,'players.png',640);
  await tab(p,'stats');await shot(p,'stats.png',760);
  await tab(p,'plays');await p.click('.nextup [data-a=calmenu]');await shot(p,'next-game.png',420);
  await p.context().close();

  // Phone
  p=await page(P,PS);await p.waitForSelector('.plays > li');
  await shot(p,'plays-phone.png');
  await p.locator('.play').first().click();await p.waitForSelector('.dlg');await shot(p,'log-phone.png');
  await p.keyboard.press('Escape');await p.waitForTimeout(150);
  await tab(p,'scenarios');await shot(p,'scenarios-phone.png');
  await tab(p,'stats');await shot(p,'stats-phone.png');
  await p.context().close();

  // The welcome page, signed out
  p=await page({width:1280,height:900},1.1,'');await p.waitForSelector('#demoframe');
  await p.frameLocator('#demoframe').locator('.plays > li').first().waitFor();
  await p.waitForTimeout(500);await shot(p,'welcome.png',900);
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
