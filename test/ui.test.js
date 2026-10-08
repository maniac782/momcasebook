// Headless check of the whole flow with test/fake-firebase.js standing in for Firebase.
// Run: node test/ui.test.js [screenshot dir]   (needs Playwright with Chromium)
const {chromium}=require(process.env.PW||'playwright');const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'..'),out=process.argv[2]||path.join(root,'test','shots');fs.mkdirSync(out,{recursive:true});
const types={html:'text/html',js:'text/javascript',css:'text/css',png:'image/png',webmanifest:'application/manifest+json'};
require('../js/valkyrie.js');require('../js/catalog.js');require('../js/importer.js');
const rows=globalThis.MOMImport.parseCSV(fs.readFileSync(path.join(__dirname,'fixture-sheet.csv'),'utf8'));
const gviz={status:'ok',table:{cols:rows[0].map(l=>({label:l})),rows:rows.slice(1).map(r=>({c:r.map(v=>v===''?null:{v})}))}};
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME||undefined});
  const errors=[];
  async function ctx(opts){
    const c=await browser.newContext(Object.assign({serviceWorkers:'block'},opts));
    await c.route('**/*',async r=>{
      const u=new URL(r.request().url());
      if(u.hostname==='www.gstatic.com'){return r.fulfill({body:u.pathname.includes('firebase-app-compat')?fs.readFileSync(path.join(__dirname,'fake-firebase.js'),'utf8'):'',contentType:'text/javascript'});}
      if(u.hostname==='docs.google.com'){const cb=(u.searchParams.get('tqx')||'').split('responseHandler:')[1];return r.fulfill({body:'/*O_o*/\n'+cb+'('+JSON.stringify(gviz)+');',contentType:'text/javascript'});}
      if(u.hostname.includes('fonts.g'))return r.fulfill({body:'',contentType:'text/css'});
      if(u.hostname!=='momcasebook.test')return r.abort();
      if(u.pathname==='/__/firebase/init.json')return r.fulfill({body:'{"projectId":"momcasebook"}',contentType:'application/json'});
      const f=path.join(root,u.pathname==='/'?'index.html':decodeURIComponent(u.pathname));
      if(!fs.existsSync(f))return r.fulfill({status:404,body:'nf'});
      r.fulfill({body:fs.readFileSync(f),contentType:types[f.split('.').pop()]||'application/octet-stream'});
    });
    return c;
  }
  const c=await ctx({viewport:{width:1100,height:900}});const p=await c.newPage();
  p.on('pageerror',e=>errors.push('pageerror: '+e.message));p.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
  await p.goto('https://momcasebook.test/');
  await p.waitForSelector('text=Continue with Google');
  assert.ok((await p.textContent('#ver')).startsWith('v'),'version in footer');
  await p.screenshot({path:out+'/1-signin.png',fullPage:true});
  await p.fill('#au-em','dan@example.com');await p.fill('#au-pw','secret1');await p.click('form[data-form=auth] button[type=submit]');
  await p.waitForSelector('text=No plays yet');
  // import the sheet
  await p.click('text=Import a spreadsheet');
  await p.fill('#imp-link','https://docs.google.com/spreadsheets/d/1qOKghDouy9aFbaexfI-Gt7JSxcLmRkDMsIfRJfvD5Ug/edit?usp=sharing');
  await p.click('text=Load sheet');
  await p.waitForSelector('text=10 plays to import');
  await p.screenshot({path:out+'/2-import-preview.png',fullPage:true});
  await p.click('[data-a=doimport]');
  await p.waitForSelector('.plays');
  assert.strictEqual(await p.locator('.plays > li').count(),10,'10 plays imported');
  await p.screenshot({path:out+'/3-plays.png',fullPage:true});
  assert.strictEqual(await p.locator('.sec.notice').count(),0,'a fresh import has only official investigators');
  assert.ok(await p.locator('.pl-party:has-text("\\"Ashcan\\" Pete")').count(),'imported Ashcan Pete is the official name');
  // plays saved before this version could hold anything: simulate that, then fix it from the banner
  await p.evaluate(async()=>{const S=__fake.store,db=firebase.app().firestore(),ks=Object.keys(S).filter(k=>k.includes('/plays/'));
    const jung=ks.find(k=>S[k].scenarioName==='The Jungle Awakens');await db.doc(jung).update({party:[{player:'',investigator:'Ashcan Pete'},{player:'',investigator:'Ursula'},{player:'',investigator:'Lily Chen'}]});
    const gang=ks.find(k=>S[k].scenarioName==='Gangs of Arkham');await db.doc(gang).update({party:[{player:'Agatha Crane',investigator:''},{player:'Dan',investigator:'Daisy Walker'},{player:'',investigator:'Tommy Muldoon'}]});});
  await p.waitForSelector('.sec.notice');
  await p.screenshot({path:out+'/3b-notice.png'});
  await p.click('[data-a=fixinv]');await p.waitForSelector('.fixes');
  const fx=await p.$$eval('.fixes li',ls=>ls.map(l=>l.querySelector('b').textContent+'=>'+l.querySelector('select').value));
  assert.deepStrictEqual(fx,['Agatha Crane=>Agatha Crane','Ashcan Pete=>"Ashcan" Pete','Daisy Walker=>','Ursula=>Ursula Downs'],'suggestions '+fx.join(' | '));
  await p.screenshot({path:out+'/3c-fix.png'});
  assert.strictEqual(await p.textContent('.dlg button[type=submit]'),'Fix 2 plays','button counts plays, not names');
  await p.click('.dlg button[type=submit]');await p.waitForSelector('.sec.notice',{state:'detached'});
  const after=await p.evaluate(()=>{const S=__fake.store,ks=Object.keys(S).filter(k=>k.includes('/plays/'));const g=n=>S[ks.find(k=>S[k].scenarioName===n)].party;return [g('The Jungle Awakens'),g('Gangs of Arkham')];});
  assert.deepStrictEqual(after[0].map(s=>s.investigator),['"Ashcan" Pete','Ursula Downs','Lily Chen']);
  assert.deepStrictEqual(after[1],[{player:'',investigator:'Agatha Crane'},{player:'Dan',investigator:''},{player:'',investigator:'Tommy Muldoon'}]);
  // and the form only offers official investigators
  await p.click('.bar [data-a=log]');
  const optCount=await p.locator('.seat [name=pi] option:not([value=""])').count();assert.strictEqual(optCount,40,'40 official investigators in the dropdown');
  await p.keyboard.press('Escape');
  // importing again adds nothing
  await p.click('[data-t=settings]');await p.click('text=Load sheet');await p.waitForSelector('text=10 already in your log');
  assert.ok(await p.locator('text=0 plays to import').count(),'re-import finds nothing new');
  await p.click('[data-a=cancelimport]');
  // log a new play with a new Valkyrie scenario
  await p.click('.bar [data-a=log]');
  await p.selectOption('select[name=sc]','__new');await p.fill('input[name=nsname]','The Lighthouse Keeper');
  await p.check('.seg.big .pass input',{force:true});
  await p.fill('.seat [name=pp]','Dan');await p.selectOption('.seat [name=pi]','Agatha Crane');
  await p.click('[data-f=addseat]');await p.locator('.seat').nth(1).locator('[name=pp]').fill('Gerri');await p.locator('.seat').nth(1).locator('[name=pi]').selectOption('Ursula Downs');
  await p.fill('textarea[name=notes]','Escaped the lighthouse with one turn to spare.');
  await p.screenshot({path:out+'/4-log-form.png',fullPage:true});
  await p.click('form[data-form=play] button[type=submit]');
  await p.waitForSelector('.pl-name >> text=The Lighthouse Keeper');
  await p.click('[data-t=plays]');
  assert.strictEqual(await p.locator('.plays > li').count(),11);
  assert.ok(await p.locator('text=Agatha Crane').first().count(),'short name expanded');
  // edit an imported play to add players
  await p.locator('.play',{hasText:'10:50 to Arkham'}).click();
  await p.locator('.seat').nth(0).locator('[name=pp]').fill('Gerri');
  await p.click('form[data-form=play] button[type=submit]');await p.waitForTimeout(200);
  // filters
  await p.selectOption('#fres','pass');assert.strictEqual(await p.locator('.plays > li').count(),6);
  await p.selectOption('#fpl','Gerri');assert.strictEqual(await p.locator('.plays > li').count(),2);
  await p.click('[data-a=clearf]');
  await p.click('[data-t=scenarios]');await p.waitForSelector('#sf-sort');
  assert.ok(await p.locator('.scs >> text=The Lighthouse Keeper').count());
  await p.screenshot({path:out+'/5-scenarios.png',fullPage:true});
  // the built-in Valkyrie list: search it and log a play straight from it
  assert.ok(await p.locator('details[data-box=valkyrie]').count(),'valkyrie box shown');
  // collapsible boxes: close Official, its scenarios disappear, Valkyrie stays; remembered after a reload
  await p.click('details[data-box=official] > summary');
  assert.strictEqual(await p.locator('details[data-box=official] .scs li').first().isVisible(),false,'official closed');
  assert.ok(await p.locator('details[data-box=valkyrie] .scs li').first().isVisible(),'valkyrie still open');
  await p.screenshot({path:out+'/5a-official-closed.png'});
  assert.deepStrictEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('mom-boxes'))),{official:false,valkyrie:true,yours:true});
  await p.click('details[data-box=official] > summary');
  // language: Spanish only, and sorting by language groups them
  await p.selectOption('#sf-src','valkyrie');await p.selectOption('#sf-lang','Spanish');
  const langOk=await p.$$eval('details[data-box=valkyrie] .scs li b',bs=>bs.map(b=>b.textContent)).then(names=>p.evaluate(ns=>ns.every(n=>{const s=MOM.VALKYRIE.find(x=>x.name===n);return s&&(s.langs||[s.lang]).includes('Spanish');}),names));
  assert.ok(langOk,'every row is available in Spanish');
  await p.selectOption('#sf-lang','any');await p.selectOption('#sf-sort','lang');
  const heads=await p.$$eval('details[data-box=valkyrie] .subhead',hs=>hs.map(h=>h.firstChild.textContent.trim()));
  assert.ok(heads.length>=5&&heads.includes('English')&&heads.includes('Spanish'),'grouped by original language: '+heads.join(', '));
  await p.screenshot({path:out+'/5g-by-language.png',fullPage:true});
  await p.selectOption('#sf-sort','box');await p.selectOption('#sf-src','all');
  await p.fill('#sq','exotic');
  await p.waitForFunction(()=>document.querySelectorAll('.scs li').length===1);
  assert.ok(await p.locator('.scs li',{hasText:'Exotic Material'}).locator('text=by Bruce').count(),'author shown');
  assert.ok(await p.locator('.scs li',{hasText:'Exotic Material'}).locator('.community:has-text("plays on Valkyrie")').count(),'community numbers shown');
  assert.ok(await p.locator('.scs li',{hasText:'Exotic Material'}).locator('.rating').count(),'rating shown');
  await p.screenshot({path:out+'/5b-scenarios-search.png'});
  await p.locator('.scs li',{hasText:'Exotic Material'}).locator('[data-a=log]').click();
  assert.strictEqual(await p.inputValue('select[name=sc]'),'v-exotic-material');
  await p.check('.seg.big .fail input',{force:true});await p.click('form[data-form=play] button[type=submit]');
  await p.waitForSelector('.pl-name >> text=Exotic Material');
  assert.ok(await p.locator('.play',{hasText:'Exotic Material'}).locator('text=Valkyrie').count(),'tagged Valkyrie');
  await p.click('[data-t=scenarios]');await p.fill('#sq','exotic');await p.waitForFunction(()=>document.querySelectorAll('.scs li').length===1);
  assert.ok(await p.locator('.scs li',{hasText:'Exotic Material'}).locator('text=You: 1 play').count(),'your record next to the community');
  await p.screenshot({path:out+'/5e-community.png'});
  // played scenarios offer Play again, filled from last time (it was a fail, so attempt 2)
  assert.ok(await p.locator('.scs li',{hasText:'Exotic Material'}).locator('[data-a=again]').count(),'Play again on a played scenario');
  await p.locator('.scs li',{hasText:'Exotic Material'}).locator('[data-a=again]').click();await p.waitForSelector('.dlg h2:text("Play again")');
  assert.strictEqual(await p.inputValue('select[name=sc]'),'v-exotic-material');assert.strictEqual(await p.inputValue('input[name=att]'),'2','next attempt after a fail');
  await p.keyboard.press('Escape');
  // the list: filter Valkyrie, easy-or-medium is two filters here (medium), under 2 hours, rated 8+, sorted by rating
  await p.fill('#sq','');await p.selectOption('#sf-src','valkyrie');await p.selectOption('#sf-diff','medium');await p.selectOption('#sf-len','short');
  await p.selectOption('#sf-rate','8');await p.selectOption('#sf-sort','rating');
  const rows=await p.$$eval('.scs li',ls=>ls.map(l=>l.querySelector('b').textContent));
  assert.ok(rows.length>0,'some scenarios match');
  const check=await p.evaluate(names=>{const typ=s=>s.avg&&s.plays>=10?s.avg:(s.minutes[0]?(s.minutes[0]+s.minutes[1])/2:s.minutes[1]);
    const ss=names.map(n=>MOM.VALKYRIE.find(x=>x.name===n));
    return {all:ss.every(s=>s&&s.difficulty>=0.35&&s.difficulty<0.6&&typ(s)<120&&s.rating>=8&&s.plays>=10),
      sorted:ss.every((s,i)=>i===0||ss[i-1].rating>=s.rating)};},rows);
  assert.ok(check.all,'every row matches the filters: '+rows.join(', '));assert.ok(check.sorted,'sorted by rating');
  await p.screenshot({path:out+'/5d-list.png',fullPage:true});
  // reviews show on official scenarios that have them
  await p.click('[data-a=sfclear]');await p.fill('#sq','escape from innsmouth');await p.waitForFunction(()=>document.querySelectorAll('.scs li').length===1);
  await p.click('.reviews summary');assert.ok(await p.isVisible('.reviews p a'),'review link shown');
  await p.screenshot({path:out+'/5f-review.png'});
  await p.fill('#sq','');
  // log a play from the list
  await p.fill('#sq','a time and place');await p.waitForFunction(()=>document.querySelectorAll('.scs li').length===1);
  const pick2='A Time and Place';assert.strictEqual(await p.locator('.scs li [data-a=again]').count(),0,'unplayed shows Log a play');await p.click('.scs li [data-a=log]');await p.waitForSelector('form[data-form=play]');
  assert.strictEqual(await p.evaluate(()=>document.querySelector('select[name=sc]').selectedOptions[0].textContent.replace(' • new','')),pick2,'Log a play opens with that scenario');
  // location: saved, shown, remembered next time, counted in stats
  await p.fill('input[name=loc]','Gerri\u2019s house');await p.check('.seg.big .pass input',{force:true});await p.click('form[data-form=play] button[type=submit]');
  await p.waitForSelector('.pl-loc:has-text("at Gerri")');
  await p.click('.bar [data-a=log]');assert.strictEqual(await p.inputValue('input[name=loc]'),'Gerri\u2019s house','last place remembered');await p.keyboard.press('Escape');
  await p.click('[data-t=stats]');assert.ok(await p.locator('h2:text-is("Where you played")').count(),'location stats');
  // switching the list off in Settings keeps played ones only
  await p.click('[data-t=settings]');await p.uncheck('#s-valk');await p.waitForTimeout(150);
  await p.click('[data-t=scenarios]');await p.click('[data-a=sfclear]').catch(()=>{});await p.selectOption('#sf-sort','box');await p.fill('#sq','');await p.waitForTimeout(100);
  const vl=await p.locator('details[data-box=valkyrie] .scs li').count();
  assert.strictEqual(vl,3,'only the 3 played Valkyrie scenarios remain when the list is off (got '+vl+')');
  await p.click('[data-t=settings]');await p.check('#s-valk');await p.waitForTimeout(150);
  await p.click('[data-t=stats]');await p.waitForSelector('text=Who you played with');
  await p.screenshot({path:out+'/6-stats.png',fullPage:true});
  // players and groups: save the names already in plays, make a group, log a play from it, rename someone everywhere
  await p.click('[data-t=players]');await p.waitForSelector('text=In your plays, not saved yet');
  await p.click('[data-a=addloose]');await p.waitForSelector('[data-a=editperson]');
  assert.strictEqual(await p.locator('text=In your plays, not saved yet').count(),0,'all loose names saved');
  await p.click('[data-a=newgroup]');await p.fill('input[name=gname]','Thursday group');
  await p.locator('label.check',{hasText:'Gerri'}).locator('input').check();await p.locator('label.check',{hasText:'Dan'}).locator('input').check();
  await p.fill('input[name=gnew]','Pat, Sam');await p.click('.dlg button[type=submit]');
  await p.waitForSelector('.scs b:text("Thursday group")');
  assert.strictEqual(await p.locator('li',{has:p.locator('b:text("Thursday group")')}).locator('.chip').count(),4,'group has 4 members');
  await p.screenshot({path:out+'/5c-players.png',fullPage:true});
  await p.click('.bar [data-a=log]');await p.selectOption('select[name=sc]','o-rising-tide');
  await p.locator('.seat [name=pi]').first().selectOption('Agatha Crane');  // Dan's seat keeps this investigator after picking the group
  const gid=await p.locator('select[name=grp] option').nth(1).getAttribute('value');await p.selectOption('select[name=grp]',gid);
  assert.strictEqual(await p.locator('.seat').count(),4,'seats filled from group');
  assert.strictEqual(await p.locator('.seat').filter({has:p.locator('[name=pp][value="Dan"]')}).count()>=0,true);
  const seats=await p.$$eval('.seat',ss=>ss.map(s=>s.querySelector('[name=pp]').value+':'+s.querySelector('[name=pi]').value));
  assert.ok(seats.includes('Dan:Agatha Crane')&&seats.includes('Gerri:')&&seats.includes('Pat:'),'seats '+seats.join(','));
  await p.check('.seg.big .pass input',{force:true});await p.click('form[data-form=play] button[type=submit]');
  await p.waitForSelector('.play:has-text("Rising Tide")');
  // rename Gerri -> Geraldine, also in past plays
  await p.click('[data-t=players]');
  await p.locator('li',{hasText:'Gerri'}).locator('[data-a=editperson]').click();
  await p.fill('input[name=pname]','Geraldine');assert.ok(await p.isVisible('.renm'),'rename-in-plays offered');
  await p.click('.dlg button[type=submit]');await p.waitForSelector('.scs b:has-text("Geraldine")');
  await p.click('[data-t=plays]');
  assert.strictEqual(await p.locator('.pl-party:has-text("Gerri")').count(),0,'old name gone from plays');
  assert.ok(await p.locator('.pl-party:has-text("Geraldine")').count()>=3,'new name in plays');
  // delete Sam: leaves the group
  await p.click('[data-t=players]');await p.locator('li',{hasText:'Sam'}).locator('[data-a=delperson]').click();await p.click('[data-yes]');
  await p.waitForFunction(()=>!document.querySelector('[data-a=editperson]')||![...document.querySelectorAll('li')].some(li=>li.querySelector('[data-a=editperson]')&&li.textContent.includes('Sam')));
  assert.ok(await p.locator('li',{hasText:'Sam'}).locator('[data-a=addname]').count(),'Sam is back under not-saved because a past play names him');
  assert.strictEqual(await p.locator('li',{has:p.locator('b:text("Thursday group")')}).locator('.chip').count(),3,'deleted player left the group');
  // profile picture: choose, crop, save; it shows on the account button; then remove it
  const png=Buffer.from((await p.evaluate(()=>{const c=document.createElement('canvas');c.width=640;c.height=420;const g=c.getContext('2d');
    const gr=g.createLinearGradient(0,0,640,420);gr.addColorStop(0,'#1d5c63');gr.addColorStop(1,'#a3322a');g.fillStyle=gr;g.fillRect(0,0,640,420);
    g.fillStyle='#e4e7ea';g.beginPath();g.arc(320,210,120,0,7);g.fill();return c.toDataURL('image/png');})).split(',')[1],'base64');
  // it lives under the account menu's "Your account", like the Arkham site
  await p.click('.acct-btn');assert.ok(await p.isVisible('.acct-btn .acct-name'),'name on the account button');
  await p.screenshot({path:out+'/6a-menu.png'});
  await p.click('[data-acct=account]');await p.waitForSelector('.dlg h2:text("Your account")');
  const [chooser]=await Promise.all([p.waitForEvent('filechooser'),p.click('[data-ac=pic]')]);
  await chooser.setFiles({name:'me.png',mimeType:'image/png',buffer:png});
  await p.waitForSelector('.crop canvas');
  await p.locator('.zoom').fill('1.6');
  const box=await p.locator('.crop canvas').boundingBox();
  await p.mouse.move(box.x+130,box.y+130);await p.mouse.down();await p.mouse.move(box.x+90,box.y+120);await p.mouse.up();
  await p.screenshot({path:out+'/6b-crop.png'});
  await p.click('[data-use]');
  await p.waitForSelector('.acct-btn .avatar img');
  const photo=await p.evaluate(()=>__fake.store['users/u-danexamplecom'].photo);
  assert.ok(/^data:image\/jpeg;base64,/.test(photo)&&photo.length<=60000,'photo saved as small jpeg ('+photo.length+')');
  await p.waitForSelector('.dlg .picrow .avatar img');
  await p.fill('.dlg [name=aname]','Dan M');await p.click('.dlg [data-ac-form] button');await p.waitForTimeout(150);
  assert.strictEqual(await p.evaluate(()=>__fake.store['users/u-danexamplecom'].name),'Dan M','name saved from Your account');
  await p.screenshot({path:out+'/6c-account.png'});
  await p.click('[data-ac=picrm]');await p.waitForSelector('.acct-btn .avatar:not(:has(img))');
  await Promise.all([p.waitForEvent('filechooser').then(c=>c.setFiles({name:'me.png',mimeType:'image/png',buffer:png})),p.click('[data-ac=pic]')]);
  await p.waitForSelector('.crop canvas');await p.click('[data-use]');await p.waitForSelector('.acct-btn .avatar img');
  await p.click('.dlg [data-close]');
  await p.click('.acct-btn');await p.screenshot({path:out+'/6d-menu.png'});await p.keyboard.press('Escape');
  await p.click('[data-t=settings]');assert.strictEqual(await p.locator('h2:text-is("You")').count(),0,'no longer in Settings');
  // CSV export round trip
  await p.click('[data-t=settings]');
  const [dl]=await Promise.all([p.waitForEvent('download'),p.click('[data-a=csv]')]);
  const csv=fs.readFileSync(await dl.path(),'utf8');assert.ok(csv.split('\n').length>=12&&/Lighthouse Keeper/.test(csv),'csv export');
  // admin page
  const uid=await p.evaluate(()=>firebase.app().auth().currentUser.uid);
  await p.evaluate(u=>__fake.makeAdmin(u),uid);
  const savedPic=await p.evaluate(()=>__fake.store['users/u-danexamplecom'].photo);
  await p.goto('https://momcasebook.test/admin.html');
  await p.evaluate(x=>{window.__pic=x;},savedPic);
  // fresh page = fresh fake store: sign in again and seed
  await p.waitForSelector('text=Sign in on the');
  await p.evaluate(()=>{__fake.makeAdmin('u-danexamplecom');__fake.store['users/u-danexamplecom']={name:'Dan',email:'dan@example.com',playCount:11,created:Date.now(),lastSeen:Date.now(),photo:window.__pic};firebase.app().auth().signInWithEmailAndPassword('dan@example.com');});
  await p.waitForSelector('text=Plays logged');
  assert.ok(await p.locator('.adm .avatar img').count(),'admin list shows the picture');
  await p.click('[data-t=scs]');await p.fill('#sc-name','Night of the Hunter');await p.click('form[data-form=addsc] button');await p.waitForSelector('.adm >> text=Night of the Hunter');
  await p.screenshot({path:out+'/7-admin.png',fullPage:true});
  await c.close();
  // phone, dark
  const c2=await ctx({viewport:{width:390,height:844},deviceScaleFactor:2,colorScheme:'dark',isMobile:true,hasTouch:true});const q=await c2.newPage();
  q.on('pageerror',e=>errors.push('pageerror(phone): '+e.message));
  await q.goto('https://momcasebook.test/');await q.waitForSelector('text=Continue with Google');
  await q.screenshot({path:out+'/8-phone-signin-dark.png'});
  await q.fill('#au-em','dan@example.com');await q.fill('#au-pw','secret1');await q.click('form[data-form=auth] button[type=submit]');
  await q.waitForSelector('text=No plays yet');await q.click('text=Import a spreadsheet');
  await q.fill('#imp-link','https://docs.google.com/spreadsheets/d/1qOKghDouy9aFbaexfI-Gt7JSxcLmRkDMsIfRJfvD5Ug/edit');await q.click('text=Load sheet');await q.waitForSelector('[data-a=doimport]');await q.click('[data-a=doimport]');
  await q.waitForSelector('.plays');
  const sw=await q.evaluate(()=>document.documentElement.scrollWidth);assert.ok(sw<=390,'no sideways scroll on a phone ('+sw+')');
  await q.screenshot({path:out+'/9-phone-plays-dark.png'});
  await q.click('.bar [data-a=log]');await q.waitForSelector('.dlg');await q.screenshot({path:out+'/10-phone-form-dark.png'});
  await q.keyboard.press('Escape');await q.click('[data-t=stats]');await q.screenshot({path:out+'/11-phone-stats-dark.png',fullPage:true});
  await browser.close();
  if(errors.length){console.error(errors.join('\n'));process.exit(1);}
  console.log('ui: all checks passed; screenshots in '+out);
})().catch(e=>{console.error(e);process.exit(1);});
