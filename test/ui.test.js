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
  // importing again adds nothing
  await p.click('[data-t=settings]');await p.click('text=Load sheet');await p.waitForSelector('text=10 already in your log');
  assert.ok(await p.locator('text=0 plays to import').count(),'re-import finds nothing new');
  await p.click('[data-a=cancelimport]');
  // log a new play with a new Valkyrie scenario
  await p.click('.bar [data-a=log]');
  await p.selectOption('select[name=sc]','__new');await p.fill('input[name=nsname]','The Lighthouse Keeper');
  await p.check('.seg.big .pass input',{force:true});
  await p.fill('.seat [name=pp]','Dan');await p.fill('.seat [name=pi]','Agatha');
  await p.click('[data-f=addseat]');await p.locator('.seat').nth(1).locator('[name=pp]').fill('Gerri');await p.locator('.seat').nth(1).locator('[name=pi]').fill('Ursula Downs');
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
  await p.click('[data-t=scenarios]');await p.waitForSelector('text=Official scenarios beaten');
  assert.ok(await p.locator('.scs >> text=The Lighthouse Keeper').count());
  await p.screenshot({path:out+'/5-scenarios.png',fullPage:true});
  // the built-in Valkyrie list: search it and log a play straight from it
  assert.ok(await p.locator('h2',{hasText:'Valkyrie scenarios'}).count(),'valkyrie group shown');
  await p.fill('#sq','exotic');
  await p.waitForFunction(()=>document.querySelectorAll('.scs li').length===1);
  assert.ok(await p.locator('.scs li',{hasText:'Exotic Material'}).locator('text=by Bruce').count(),'author shown');
  await p.screenshot({path:out+'/5b-scenarios-search.png'});
  await p.locator('.scs li',{hasText:'Exotic Material'}).locator('[data-a=log]').click();
  assert.strictEqual(await p.inputValue('select[name=sc]'),'v-exotic-material');
  await p.check('.seg.big .fail input',{force:true});await p.click('form[data-form=play] button[type=submit]');
  await p.waitForSelector('.pl-name >> text=Exotic Material');
  assert.ok(await p.locator('.play',{hasText:'Exotic Material'}).locator('text=Valkyrie').count(),'tagged Valkyrie');
  // switching the list off in Settings keeps played ones only
  await p.click('[data-t=settings]');await p.uncheck('#s-valk');await p.waitForTimeout(150);
  await p.click('[data-t=scenarios]');await p.fill('#sq','');await p.waitForTimeout(100);
  const vl=await p.locator('section',{has:p.locator('h2',{hasText:'Valkyrie scenarios'})}).locator('.scs li').count();
  assert.strictEqual(vl,2,'only the 2 played Valkyrie scenarios remain when the list is off (got '+vl+')');
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
  await p.locator('.seat [name=pi]').first().fill('Agatha Crane');  // Dan's seat keeps this investigator after picking the group
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
  await p.click('[data-t=settings]');
  const [chooser]=await Promise.all([p.waitForEvent('filechooser'),p.click('[data-a=pic]')]);
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
  assert.ok(await p.locator('.picrow .avatar img').count(),'shown in settings');
  await p.screenshot({path:out+'/6c-settings-pic.png'});
  await p.click('.acct-btn');await p.screenshot({path:out+'/6d-menu.png'});await p.keyboard.press('Escape');
  await p.click('[data-a=picrm]');await p.waitForSelector('.acct-btn .avatar:not(:has(img))');
  await Promise.all([p.waitForEvent('filechooser').then(c=>c.setFiles({name:'me.png',mimeType:'image/png',buffer:png})),p.click('[data-a=pic]')]);
  await p.waitForSelector('.crop canvas');await p.click('[data-use]');await p.waitForSelector('.acct-btn .avatar img');
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
