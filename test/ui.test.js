// Headless check of the whole flow with test/fake-firebase.js standing in for Firebase.
// Run: node test/ui.test.js [screenshot dir]   (needs Playwright with Chromium)
const {chromium}=require(process.env.PW||'playwright');const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'..'),out=process.argv[2]||path.join(root,'test','shots');fs.mkdirSync(out,{recursive:true});
const types={html:'text/html',js:'text/javascript',css:'text/css',png:'image/png',webmanifest:'application/manifest+json'};
require('../js/valkyrie.js');require('../js/catalog.js');require('../js/importer.js');
const rows=globalThis.MOMImport.parseCSV(fs.readFileSync(path.join(__dirname,'fixture-sheet.csv'),'utf8'));
const typo=[['Scenario','Played','Pass/Fail'],['Altered Fate','Y','Fail'],['Escape Innsmouth','Y','Pass'],['Mansion','Y','Pass'],['The Lighthouse Keeper','Y','Pass']];
const toGviz=rows=>({status:'ok',table:{cols:rows[0].map(l=>({label:l})),rows:rows.slice(1).map(r=>({c:r.map(v=>v===''?null:{v})}))}});
const gviz={status:'ok',table:{cols:rows[0].map(l=>({label:l})),rows:rows.slice(1).map(r=>({c:r.map(v=>v===''?null:{v})}))}};
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME||undefined});
  const errors=[];
  async function ctx(opts){
    const c=await browser.newContext(Object.assign({serviceWorkers:'block'},opts));
    await c.route('**/*',async r=>{
      const u=new URL(r.request().url());
      if(u.hostname==='www.gstatic.com'){return r.fulfill({body:u.pathname.includes('firebase-app-compat')?fs.readFileSync(path.join(__dirname,'fake-firebase.js'),'utf8'):'',contentType:'text/javascript'});}
      if(u.hostname==='docs.google.com'){const cb=(u.searchParams.get('tqx')||'').split('responseHandler:')[1];return r.fulfill({body:'/*O_o*/\n'+cb+'('+JSON.stringify(u.pathname.includes('TYPOSHEET')?toGviz(typo):gviz)+');',contentType:'text/javascript'});}
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
  assert.strictEqual(await p.locator('.play:has-text("No date")').count(),0,'no "No date" on cards');
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
  // an older version could save a made-up scenario: the Plays tab asks to match it, with a good guess filled in
  await p.evaluate(async()=>{const db=firebase.app().firestore(),u=firebase.app().auth().currentUser.uid;
    await db.doc('users/'+u+'/scenarios/c-altered-fate').set({name:'Altered Fate',type:'custom',author:'',link:'',created:1});
    await db.collection('users/'+u+'/plays').add({scenarioId:'c-altered-fate',scenarioName:'Altered Fate',scenarioType:'custom',date:'',result:'fail',attempts:1,party:[],solo:false,rules:'',notes:'',created:1});});
  await p.waitForSelector('[data-a=fixsc]');assert.ok(await p.locator('details[data-box=p-fix] .plays > li').count()===1,'shown under Needs a scenario');
  await p.screenshot({path:out+'/3e-needs-scenario.png'});
  await p.click('[data-a=fixsc]');await p.waitForSelector('.fixes select');
  assert.strictEqual(await p.inputValue('.fixes select'),'o-altered-fates','best guess Altered Fates');
  await p.click('.dlg button[type=submit]');await p.waitForSelector('[data-a=fixsc]',{state:'detached'});
  assert.strictEqual(await p.evaluate(()=>Object.keys(__fake.store).filter(k=>k.includes('/scenarios/c-')).length),0,'old personal scenario removed');
  assert.strictEqual(await p.evaluate(()=>Object.values(__fake.store).filter(v=>v&&v.scenarioName==='Altered Fates').length),2,'now two Altered Fates plays');
  await p.evaluate(async()=>{const db=firebase.app().firestore();for(const [k,v] of Object.entries(__fake.store))if(k.includes('/plays/')&&v&&v.created===1)await db.doc(k).delete();});
  // and the form only offers official investigators
  await p.click('.bar [data-a=log]');
  const optCount=await p.locator('.seat [name=pi] option:not([value=""])').count();assert.strictEqual(optCount,40,'40 official investigators in the dropdown');
  await p.keyboard.press('Escape');
  // a sheet with typos: sure matches are used, the rest wait for a choice in the preview
  await p.click('[data-t=settings]');await p.fill('#imp-link','https://docs.google.com/spreadsheets/d/TYPOSHEETxxxxxxxxxxxxxxxxxxxxxxxxx/edit');await p.click('text=Load sheet');
  await p.waitForSelector('.unmatched');
  assert.strictEqual(await p.locator('.unmatched select').count(),2,'two names need a choice');
  assert.ok((await p.inputValue('#um-0')).startsWith('v-'),'Mansion: a best guess is chosen');
  assert.strictEqual(await p.inputValue('#um-1'),'','made-up name: skip by default');
  await p.screenshot({path:out+'/2b-import-matching.png',fullPage:true});
  const keysBefore=await p.evaluate(()=>Object.keys(__fake.store).filter(k=>k.includes('/plays/')));const nBefore=keysBefore.length;
  await p.click('[data-a=doimport]');await p.waitForSelector('.plays');
  const nAfter=await p.evaluate(()=>Object.keys(__fake.store).filter(k=>k.includes('/plays/')).length);
  assert.strictEqual(nAfter-nBefore,3,'three imported, the made-up one skipped');
  assert.ok(await p.evaluate(()=>Object.values(__fake.store).every(v=>!v||!v.scenarioType||v.scenarioType==='official'||v.scenarioType==='valkyrie')),'no custom scenarios saved');
  // remove those three again so the rest of the test's counts hold
  await p.evaluate(async kb=>{const db=firebase.app().firestore();for(const k of Object.keys(__fake.store).filter(k=>k.includes('/plays/')&&!kb.includes(k)))await db.doc(k).delete();},keysBefore);
  // importing again adds nothing
  await p.click('[data-t=settings]');await p.fill('#imp-link','https://docs.google.com/spreadsheets/d/1qOKghDouy9aFbaexfI-Gt7JSxcLmRkDMsIfRJfvD5Ug/edit?usp=sharing');await p.click('text=Load sheet');await p.waitForSelector('text=10 already in your log');
  assert.ok(await p.locator('text=0 plays to import').count(),'re-import finds nothing new');
  await p.click('[data-a=cancelimport]');
  // log a new play with a new Valkyrie scenario
  await p.click('.bar [data-a=log]');
  assert.strictEqual(await p.locator('select[name=sc] option[value=__new]').count(),0,'no way to add a custom scenario');await p.selectOption('select[name=sc]','v-the-sea-devils');
  await p.check('.seg.big .pass input',{force:true});
  await p.fill('.seat [name=pp]','Dan');if(await p.locator('.dd-wrap.combo').count())await p.keyboard.press('Escape');await p.selectOption('.seat [name=pi]','Agatha Crane');
  await p.click('[data-f=addseat]');await p.locator('.seat').nth(1).locator('[name=pp]').fill('Gerri');if(await p.locator('.dd-wrap.combo').count())await p.keyboard.press('Escape');await p.locator('.seat').nth(1).locator('[name=pi]').selectOption('Ursula Downs');
  await p.fill('textarea[name=notes]','Escaped the lighthouse with one turn to spare.');
  await p.screenshot({path:out+'/4-log-form.png',fullPage:true});
  await p.click('form[data-form=play] button[type=submit]');
  await p.waitForSelector('.pl-name >> text=The Sea Devils');
  await p.click('[data-t=plays]');
  assert.strictEqual(await p.locator('.plays > li').count(),11);
  assert.ok(await p.locator('text=Agatha Crane').first().count(),'short name expanded');
  // plays are split into Official and Valkyrie boxes; closing one hides only its plays
  assert.strictEqual(await p.locator('details[data-box=p-official] .plays > li').count(),10,'10 official plays');
  assert.strictEqual(await p.locator('details[data-box=p-valkyrie] .plays > li').count(),1,'1 Valkyrie play');
  await p.click('details[data-box=p-official] > summary');
  assert.strictEqual(await p.locator('details[data-box=p-official] .plays > li').first().isVisible(),false,'official plays hidden');
  assert.ok(await p.locator('details[data-box=p-valkyrie] .plays > li').first().isVisible(),'valkyrie plays still shown');
  await p.screenshot({path:out+'/3d-play-boxes.png',fullPage:true});
  await p.click('details[data-box=p-official] > summary');
  // edit an imported play to add players
  await p.locator('.play',{hasText:'10:50 to Arkham'}).click();
  await p.locator('.seat').nth(0).locator('[name=pp]').fill('Gerri');if(await p.locator('.dd-wrap.combo').count())await p.keyboard.press('Escape');
  await p.click('form[data-form=play] button[type=submit]');await p.waitForTimeout(200);
  // filters
  await p.selectOption('#fres','pass');assert.strictEqual(await p.locator('.plays > li').count(),6);
  await p.selectOption('#fpl','Gerri');assert.strictEqual(await p.locator('.plays > li').count(),2);
  await p.click('[data-a=clearf]');
  // players: pick from known players or type a new one; a known player brings their usual investigator
  await p.click('.bar [data-a=log]');await p.waitForSelector('.dlg');await p.waitForTimeout(150);   // the form moves focus to its first field just after opening
  await p.locator('.seat [name=pp]').first().fill('');await p.locator('.seat [name=pi]').first().selectOption('');
  await p.locator('.seat [name=pp]').first().click();await p.waitForSelector('.dd-wrap.combo .dd-opt');
  assert.ok(await p.locator('.dd-wrap.combo .dd-opt:has-text("Gerri")').count(),'known players listed');
  await p.keyboard.type('ger');await p.waitForTimeout(100);
  assert.ok(/Gerri/.test(await p.locator('.dd-wrap.combo .dd-opt').first().textContent()),'typing narrows to matching players');
  await p.screenshot({path:out+'/4b-player-combo.png'});
  await p.click('.dd-wrap.combo .dd-opt:has-text("Gerri")');await p.waitForSelector('.dd-wrap.combo',{state:'detached'});
  assert.strictEqual(await p.locator('.seat [name=pp]').first().inputValue(),'Gerri','picked a known player');
  assert.ok((await p.locator('.seat [name=pi]').first().inputValue())!=='','their usual investigator filled in');
  await p.click('[data-f=addseat]');await p.waitForTimeout(150);
  assert.ok(await p.locator('.dd-wrap.combo .dd-opt:has-text("Gerri")').count(),'a player already in this play can be picked again (two investigators)');
  await p.keyboard.type('Robin Q');await p.waitForTimeout(100);
  assert.ok(await p.locator('.dd-wrap.combo .dd-new:has-text("Robin Q")').count(),'a new name is offered as new');
  await p.keyboard.press('Escape');assert.strictEqual(await p.locator('.dlg').count(),1,'Escape closes only the list');
  assert.strictEqual(await p.locator('.seat').nth(1).locator('[name=pp]').inputValue(),'Robin Q','typed name kept');
  await p.keyboard.press('Escape');await p.waitForSelector('.dlg',{state:'detached'});
  // our own dropdown menu: mouse, keyboard, search on long lists, and Escape only closes the menu inside a dialog
  await p.click('#fres');await p.waitForSelector('.dd .dd-opt.sel');
  assert.strictEqual((await p.textContent('.dd .dd-opt.sel')).trim(),'Any','current choice ticked');
  assert.strictEqual(await p.locator('.dd-search').count(),0,'no search box on a short list');await p.waitForTimeout(250);
  await p.screenshot({path:out+'/3g-dropdown.png'});
  await p.click('.dd .dd-opt:has-text("Failed")');await p.waitForSelector('.dd-wrap',{state:'detached'});
  assert.strictEqual(await p.inputValue('#fres'),'fail','menu choice sets the filter');
  assert.ok(await p.locator('.plays > li').count()>0);
  await p.focus('#fres');await p.keyboard.press('ArrowDown');await p.waitForSelector('.dd');
  await p.keyboard.press('ArrowUp');await p.keyboard.press('Enter');await p.waitForTimeout(150);
  assert.strictEqual(await p.inputValue('#fres'),'pass','keyboard choice');
  await p.click('[data-a=clearf]');
  await p.click('.bar [data-a=log]');await p.waitForSelector('.dlg');await p.click('.dlg select[name=sc]');await p.waitForSelector('.dd-search input');
  await p.keyboard.type('sea dev');await p.waitForTimeout(250);await p.screenshot({path:out+'/3h-dropdown-search.png'});
  assert.ok(await p.locator('.dd-opt:visible').count()<=3,'search narrows the list');
  await p.keyboard.press('Enter');await p.waitForTimeout(150);
  assert.strictEqual(await p.inputValue('.dlg select[name=sc]'),'v-the-sea-devils','search and Enter picks it');
  await p.click('.dlg select[name=sc]');await p.waitForSelector('.dd');await p.keyboard.press('Escape');await p.waitForTimeout(200);
  assert.strictEqual(await p.locator('.dlg').count(),1,'Escape closes only the menu');assert.strictEqual(await p.locator('.dd-wrap').count(),0);
  await p.keyboard.press('Escape');await p.waitForSelector('.dlg',{state:'detached'});
  await p.click('[data-t=scenarios]');await p.waitForSelector('#sf-sort');
  // packing lists for Valkyrie scenarios (Dan's valkyrie-tools packlist): needs line, tiles by index, ticks kept
  await p.fill('#sq','Exotic Material');await p.waitForTimeout(150);
  assert.ok(await p.locator('.scs li:has-text("Exotic Material") .needs').count(),'needs line');
  await p.locator('.scs li:has-text("Exotic Material") [data-a=pack]').first().click();await p.waitForSelector('.pk-list');
  assert.ok(await p.locator('.pk-list .pk').count()>=8,'tiles and monsters listed');
  assert.ok(await p.locator('.pk-idx:has-text("9")').count(),'tile index numbers');
  await p.locator('.pk input').first().check();await p.locator('.pk input').nth(1).check();
  assert.ok(/^2 of /.test(await p.textContent('.pk-count')),'ticks counted');
  await p.screenshot({path:out+'/5k-packing-list.png'});
  await p.click('.dlg [data-close]');await p.locator('.scs li:has-text("Exotic Material") [data-a=pack]').first().click();await p.waitForSelector('.pk-list');
  assert.ok(/^2 of /.test(await p.textContent('.pk-count')),'ticks kept on this device');
  await p.click('[data-pk=clear]');assert.ok(/^0 of /.test(await p.textContent('.pk-count')),'clear ticks');await p.click('.dlg [data-close]');
  await p.fill('#sq','');await p.selectOption('#sf-own','own');await p.waitForTimeout(150);
  const ownCount=+(await p.textContent('.count b'));await p.selectOption('#sf-own','any');await p.waitForTimeout(150);
  assert.ok(ownCount>0&&ownCount<=+(await p.textContent('.count b')),'collection filter');
  assert.ok(await p.locator('.scs >> text=The Sea Devils').count());assert.strictEqual(await p.locator('details[data-box=yours]').count(),0,'no Your own box');
  await p.screenshot({path:out+'/5-scenarios.png',fullPage:true});
  // the built-in Valkyrie list: search it and log a play straight from it
  assert.ok(await p.locator('details[data-box=valkyrie]').count(),'valkyrie box shown');
  // collapsible boxes: close Official, its scenarios disappear, Valkyrie stays; remembered after a reload
  await p.click('details[data-box=official] > summary');
  assert.strictEqual(await p.locator('details[data-box=official] .scs li').first().isVisible(),false,'official closed');
  assert.ok(await p.locator('details[data-box=valkyrie] .scs li').first().isVisible(),'valkyrie still open');
  await p.screenshot({path:out+'/5a-official-closed.png'});
  assert.deepStrictEqual(await p.evaluate(()=>{const b=JSON.parse(localStorage.getItem('mom-boxes'));return {official:b.official,valkyrie:b.valkyrie,yours:b.yours};}),{official:false,valkyrie:true,yours:true});
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
  await p.waitForFunction(n=>[...document.querySelectorAll('.scs li b')].some(b=>b.textContent===n),'Exotic Material');
  assert.ok(await p.locator('.scs li',{hasText:'Exotic Material'}).locator('text=by Bruce').count(),'author shown');
  assert.ok(await p.locator('.scs li',{hasText:'Exotic Material'}).locator('.community:has-text("plays on Valkyrie")').count(),'community numbers shown');
  assert.ok(await p.locator('.scs li',{hasText:'Exotic Material'}).locator('.rating').count(),'rating shown');
  await p.screenshot({path:out+'/5b-scenarios-search.png'});
  // descriptions: searchable, and shown with the author's credit
  await p.fill('#sq','meteorite');await p.waitForFunction(()=>[...document.querySelectorAll('.scs li b')].some(b=>b.textContent==='Exotic Material'));
  await p.locator('.scs li',{hasText:'Exotic Material'}).locator('.desc summary').click();
  assert.ok(await p.locator('.scs li',{hasText:'Exotic Material'}).locator('.desc p:has-text("meteorite")').isVisible(),'description shown');
  assert.ok(await p.locator('.desc p.note:has-text("By Bruce")').first().isVisible(),'author credited');
  assert.ok(await p.locator('.credit a[href*="valkyrie-store"]').count(),'catalogue credited');
  // official scenarios get a premise written for the site, with its source linked
  await p.fill('#sq','silverwood');await p.waitForFunction(n=>[...document.querySelectorAll('.scs li b')].some(b=>b.textContent===n),'Gates of Silverwood Manor');
  await p.locator('.scs li',{hasText:'Gates of Silverwood Manor'}).locator('.desc summary').click();
  assert.ok(await p.locator('.scs li',{hasText:'Gates of Silverwood Manor'}).locator('.desc p.note a[href*="fantasyflightgames"]').isVisible(),'premise source linked');
  await p.screenshot({path:out+'/5i-premise.png'});
  await p.screenshot({path:out+'/5h-description.png'});
  await p.fill('#sq','exotic');await p.waitForFunction(n=>[...document.querySelectorAll('.scs li b')].some(b=>b.textContent===n),'Exotic Material');
  await p.locator('.scs li',{hasText:'Exotic Material'}).locator('[data-a=log]').click();
  assert.strictEqual(await p.inputValue('select[name=sc]'),'v-exotic-material');
  await p.check('.seg.big .fail input',{force:true});await p.click('form[data-form=play] button[type=submit]');
  await p.waitForSelector('.pl-name >> text=Exotic Material');
  assert.ok(await p.locator('details[data-box=p-valkyrie] .play',{hasText:'Exotic Material'}).count(),'in the Valkyrie box');
  await p.click('[data-t=scenarios]');await p.fill('#sq','exotic');await p.waitForFunction(n=>[...document.querySelectorAll('.scs li b')].some(b=>b.textContent===n),'Exotic Material');
  assert.ok(await p.locator('.scs li',{hasText:'Exotic Material'}).locator('text=You: 1 play').count(),'your record next to the community');
  await p.screenshot({path:out+'/5e-community.png'});
  // a played, never-passed scenario says Failed, and the star sits before the name
  assert.ok(await p.locator('.scs li',{hasText:'Exotic Material'}).locator('.chip:text-is("Failed")').count(),'Failed chip');
  assert.ok(await p.evaluate(()=>{const li=[...document.querySelectorAll('.scs li.sc')].find(l=>l.textContent.includes('Exotic Material'));return li.firstElementChild.classList.contains('star');}),'star first in the row');
  await p.selectOption('#sf-status','failed');await p.waitForFunction(()=>document.querySelectorAll('.scs li .chip').length>0);
  assert.ok(await p.evaluate(()=>[...document.querySelectorAll('.scs li.sc')].every(l=>l.querySelector('.chip').textContent==='Failed')),'Failed filter');
  await p.selectOption('#sf-status','all');
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
  await p.click('[data-a=sfclear]');await p.fill('#sq','escape from innsmouth');await p.waitForFunction(n=>[...document.querySelectorAll('.scs li b')].some(b=>b.textContent===n),'Escape from Innsmouth');
  await p.locator('.scs li',{hasText:'Escape from Innsmouth'}).locator('.reviews summary').click();assert.ok(await p.locator('.scs li',{hasText:'Escape from Innsmouth'}).locator('.reviews p a').isVisible(),'review link shown');
  await p.screenshot({path:out+'/5f-review.png'});
  await p.fill('#sq','');
  // log a play from the list
  await p.fill('#sq','a time and place');await p.waitForFunction(n=>[...document.querySelectorAll('.scs li b')].some(b=>b.textContent===n),'A Time and Place');
  const pick2='A Time and Place';assert.strictEqual(await p.locator('.scs li',{hasText:'A Time and Place'}).locator('[data-a=again]').count(),0,'unplayed shows Log a play');await p.locator('.scs li',{hasText:'A Time and Place'}).locator('[data-a=log]').click();await p.waitForSelector('form[data-form=play]');
  assert.strictEqual(await p.evaluate(()=>document.querySelector('select[name=sc]').selectedOptions[0].textContent.replace(' • new','')),pick2,'Log a play opens with that scenario');
  // location: saved, shown, suggested next time (not filled in), counted in stats
  await p.fill('input[name=loc]','Gerri\u2019s house');await p.check('.seg.big .pass input',{force:true});await p.click('form[data-form=play] button[type=submit]');
  await p.waitForSelector('.pl-meta:has-text("at Gerri")');
  await p.click('.bar [data-a=log]');assert.strictEqual(await p.inputValue('input[name=loc]'),'','a fresh Log a play starts with no place');
  assert.strictEqual(await p.inputValue('input[name=rules]'),'','no rules filled in (blank saves as Normal rules)');assert.strictEqual(await p.inputValue('input[name=date]'),'','no date');
  assert.strictEqual(await p.locator('.seat [name=pp]').first().inputValue(),'','no player filled in');assert.strictEqual(await p.locator('.seat [name=pi]').first().inputValue(),'','no investigator');
  assert.ok(await p.locator('#dl-loc option[value="Gerri\u2019s house"]').count(),'the place is still suggested');await p.keyboard.press('Escape');
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
  await p.locator('.seat [name=pp]').first().fill('Dan');if(await p.locator('.dd-wrap.combo').count())await p.keyboard.press('Escape');
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
  // star a scenario: it moves to the Starred box at the top; schedule it; it shows as the next game; calendar; log it
  await p.click('[data-t=scenarios]');await p.fill('#sq','shattered bonds');
  await p.waitForFunction(n=>[...document.querySelectorAll('.scs li b')].some(b=>b.textContent===n),'Shattered Bonds');
  await p.locator('.scs li',{hasText:'Shattered Bonds'}).locator('[data-a=star]').first().click();
  await p.fill('#sq','');await p.waitForSelector('details[data-box=starred]');
  assert.strictEqual(await p.evaluate(()=>document.querySelector('details[data-box]').dataset.box),'starred','Starred box comes first');
  assert.ok(await p.locator('details[data-box=starred] .scs li',{hasText:'Shattered Bonds'}).count(),'starred scenario listed');
  assert.strictEqual(await p.locator('details[data-box=official] .scs li',{hasText:'Shattered Bonds'}).locator('.star.on').count(),1,'filled star in its own box too');
  await p.locator('details[data-box=starred] .scs li',{hasText:'Shattered Bonds'}).locator('[data-a=plan]').click();
  const tomorrow=await p.evaluate(()=>{const d=new Date();d.setDate(d.getDate()+1);return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);});
  await p.fill('input[name=pdate]',tomorrow);await p.fill('input[name=ptime]','19:00');await p.fill('input[name=ploc]','Gerri\u2019s house');
  await p.selectOption('select[name=pgrp]',{label:'Thursday group'});await p.fill('input[name=pnote]','bring snacks');
  await p.click('.dlg button[type=submit]');await p.waitForSelector('details[data-box=starred] .plan');
  assert.ok(/7 pm/.test(await p.textContent('details[data-box=starred] .plan')),'plan shows the time');
  await p.screenshot({path:out+'/5j-starred.png'});
  // calendar: Google link and .ics
  await p.locator('details[data-box=starred] [data-a=calmenu]').click();
  const gurl=await p.getAttribute('.calmenu a','href');assert.ok(gurl.includes('calendar.google.com')&&gurl.includes(tomorrow.replace(/-/g,'')+'T190000'),'Google Calendar link');
  const [ics]=await Promise.all([p.waitForEvent('download'),p.click('.calmenu [data-ics]')]);
  const icsTxt=fs.readFileSync(await ics.path(),'utf8');assert.ok(/BEGIN:VEVENT/.test(icsTxt)&&/DTSTART:\d{8}T190000/.test(icsTxt)&&/Shattered Bonds/.test(icsTxt),'ics file');
  // next game on the Plays tab
  await p.click('[data-t=plays]');assert.ok(await p.locator('.nextup:has-text("Shattered Bonds")').count(),'next game card');
  await p.screenshot({path:out+'/3f-next-game.png'});
  // log it: filled in from the plan; afterwards it's off the starred list
  await p.locator('.nextup [data-a=logplan]').click();await p.waitForSelector('form[data-form=play]');
  assert.strictEqual(await p.inputValue('select[name=sc]'),'o-shattered-bonds');
  assert.strictEqual(await p.inputValue('input[name=loc]'),'Gerri\u2019s house');
  assert.strictEqual(await p.locator('.seat').count(),3,'seats from the group');
  await p.check('.seg.big .pass input',{force:true});await p.click('form[data-form=play] button[type=submit]');
  await p.waitForSelector('.nextup',{state:'detached'});
  assert.deepStrictEqual(await p.evaluate(()=>__fake.store['users/u-danexamplecom'].starred),{},'taken off the starred list');
  // that play shouldn't change later counts: remove it
  await p.evaluate(async()=>{const db=firebase.app().firestore();for(const [k,v] of Object.entries(__fake.store))if(k.includes('/plays/')&&v&&v.scenarioName==='Shattered Bonds')await db.doc(k).delete();});
  // profile picture: choose, crop, save; it shows on the account button; then remove it
  const png=Buffer.from((await p.evaluate(()=>{const c=document.createElement('canvas');c.width=640;c.height=420;const g=c.getContext('2d');
    const gr=g.createLinearGradient(0,0,640,420);gr.addColorStop(0,'#1d5c63');gr.addColorStop(1,'#a3322a');g.fillStyle=gr;g.fillRect(0,0,640,420);
    g.fillStyle='#e4e7ea';g.beginPath();g.arc(320,210,120,0,7);g.fill();return c.toDataURL('image/png');})).split(',')[1],'base64');
  // it lives under the account menu's "Your account", like the Arkham site
  await p.click('.acctbtn');assert.ok(await p.isVisible('.acctbtn .acctname'),'name on the account button');
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
  await p.waitForSelector('.acctbtn img.av');
  const photo=await p.evaluate(()=>__fake.store['users/u-danexamplecom'].photo);
  assert.ok(/^data:image\/jpeg;base64,/.test(photo)&&photo.length<=60000,'photo saved as small jpeg ('+photo.length+')');
  await p.waitForSelector('.dlg .picrow .avatar img');
  await p.fill('.dlg [name=aname]','Dan M');await p.click('.dlg [data-ac-form] button');await p.waitForTimeout(150);
  assert.strictEqual(await p.evaluate(()=>__fake.store['users/u-danexamplecom'].name),'Dan M','name saved from Your account');
  await p.screenshot({path:out+'/6c-account.png'});
  await p.click('[data-ac=picrm]');await p.waitForSelector('.acctbtn span.av');
  await Promise.all([p.waitForEvent('filechooser').then(c=>c.setFiles({name:'me.png',mimeType:'image/png',buffer:png})),p.click('[data-ac=pic]')]);
  await p.waitForSelector('.crop canvas');await p.click('[data-use]');await p.waitForSelector('.acctbtn img.av');
  await p.click('.dlg [data-close]');
  await p.click('.acctbtn');await p.waitForSelector('.acctmenu:not([hidden])');await p.screenshot({path:out+'/6d-menu.png'});
  // menu order matches the Arkham site; it stays open while the page redraws behind it; a click outside closes it
  assert.deepStrictEqual(await p.$$eval('.acctmenu [role=menuitem]',xs=>xs.map(x=>x.textContent)),['Your account','Install app','Send feedback','Sign out']);
  await p.evaluate(()=>window.dispatchEvent(new Event('resize')));await p.click('[data-t=stats]',{position:{x:5,y:5}});
  assert.ok(await p.isHidden('.acctmenu'),'click outside closes it');
  await p.click('.acctbtn');await p.keyboard.press('Escape');assert.ok(await p.isHidden('.acctmenu'),'Escape closes it');
  await p.click('[data-t=settings]');assert.strictEqual(await p.locator('h2:text-is("You")').count(),0,'no longer in Settings');
  // one person playing two characters in a game counts once for that game
  const rowVal=async(table,name)=>{await p.click('[data-t=stats]');return p.evaluate(([t,n])=>{const sec=[...document.querySelectorAll('section.sec')].find(s=>s.querySelector('h2')&&s.querySelector('h2').textContent===t);
    if(!sec)return null;const tr=[...sec.querySelectorAll('tbody tr')].find(r=>r.cells[0].textContent===n);return tr?[+tr.cells[1].textContent,+tr.cells[2].textContent]:[0,0];},[table,name]);};
  const danBefore=await rowVal('Who you played with','Dan'),twoBefore=await rowVal('Party size','2 players'),soloBefore=await rowVal('Party size','Solo');
  await p.evaluate(async()=>{const db=firebase.app().firestore(),u=firebase.app().auth().currentUser.uid;
    await db.collection('users/'+u+'/plays').add({scenarioId:'o-dark-reflections',scenarioName:'Dark Reflections',scenarioType:'official',date:'2026-10-01',result:'pass',attempts:1,
      party:[{player:'Dan',investigator:'Carson Sinclair'},{player:' dan ',investigator:'Wendy Adams'},{player:'Pat',investigator:'Rita Young'}],solo:false,rules:'',notes:'two-handed',created:2,updated:2});
    await db.collection('users/'+u+'/plays').add({scenarioId:'o-turn-of-a-page',scenarioName:'Turn of a Page',scenarioType:'official',date:'2026-10-02',result:'fail',attempts:1,
      party:[{player:'Dan',investigator:'Carson Sinclair'},{player:'Dan',investigator:'Wendy Adams'}],solo:false,rules:'',notes:'two-handed solo',created:3,updated:3});});
  const danAfter=await rowVal('Who you played with','Dan');
  assert.deepStrictEqual([danAfter[0]-danBefore[0],danAfter[1]-danBefore[1]],[2,1],'Dan +2 plays (+1 passed), not +4');
  assert.strictEqual(await p.evaluate(()=>[...document.querySelectorAll('tbody td:first-child')].filter(td=>td.textContent.trim().toLowerCase()==='dan').length),1,'"dan" is the same person as "Dan"');
  assert.strictEqual((await rowVal('Party size','2 players'))[0]-(twoBefore||[0])[0],1,'Dan + Pat with three characters is a 2-player game');
  assert.strictEqual((await rowVal('Party size','Solo'))[0]-(soloBefore||[0])[0],1,'Dan alone with two characters is solo');
  await p.screenshot({path:out+'/6e-stats-two-handed.png',fullPage:true});
  // the Players tab counts the game once and knows both characters
  await p.click('[data-t=players]');
  await p.waitForSelector('.scs li');
  const danLine=await p.$$eval('.scs li',ls=>{const l=ls.find(x=>{const b=x.querySelector('.grow > b');return b&&b.textContent.trim()==='Dan';});return l?l.querySelector('.note').textContent:'';});
  assert.ok(new RegExp('^'+danAfter[0]+' plays').test(danLine),'Players tab agrees with Stats ('+danAfter[0]+'): '+danLine);
  assert.ok(/usually (Carson Sinclair|Agatha Crane)/.test(danLine),'usual investigator: '+danLine);
  // the form saves solo by people: one person, two characters
  await p.click('.bar [data-a=log]');await p.selectOption('select[name=sc]','o-rising-tide');
  await p.locator('.seat [name=pp]').first().fill('Dan');if(await p.locator('.dd-wrap.combo').count())await p.keyboard.press('Escape');await p.locator('.seat [name=pi]').first().selectOption('Agatha Crane');
  await p.click('[data-f=addseat]');await p.locator('.seat').nth(1).locator('[name=pp]').fill('Dan');if(await p.locator('.dd-wrap.combo').count())await p.keyboard.press('Escape');await p.locator('.seat').nth(1).locator('[name=pi]').selectOption('Preston Fairmont');
  await p.check('.seg.big .fail input',{force:true});await p.fill('textarea[name=notes]','solo check');await p.click('form[data-form=play] button[type=submit]');await p.waitForTimeout(200);
  assert.strictEqual(await p.evaluate(()=>Object.values(__fake.store).find(v=>v&&v.notes==='solo check').solo),true,'saved as solo');
  // remove these so later counts hold
  await p.evaluate(async()=>{const db=firebase.app().firestore();for(const [k,v] of Object.entries(__fake.store))if(k.includes('/plays/')&&v&&/two-handed|solo check/.test(v.notes||''))await db.doc(k).delete();});
  // CSV export round trip
  await p.click('[data-t=settings]');
  const [dl]=await Promise.all([p.waitForEvent('download'),p.click('[data-a=csv]')]);
  const csv=fs.readFileSync(await dl.path(),'utf8');assert.ok(csv.split('\n').length>=12&&/The Sea Devils/.test(csv),'csv export');
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
  // signed out: the welcome page with the sample casebook, and a casebook kept in this browser without an account
  {const c3=await ctx({viewport:{width:1280,height:900}});const w=await c3.newPage();
   w.on('pageerror',e=>errors.push('pageerror(welcome): '+e.message));
   await w.goto('https://momcasebook.test/');await w.waitForSelector('#demoframe');
   const fr=w.frameLocator('#demoframe');await fr.locator('.plays > li').first().waitFor();
   assert.ok(await fr.locator('.plays > li').count()>=8,'sample casebook has plays');
   assert.ok(await fr.locator('text=nothing you change here is saved').count(),'sample says nothing is saved');
   assert.ok(await fr.locator('text=Next game').count(),'sample has a scheduled game');
   assert.strictEqual(await fr.locator('.top').isVisible(),false,'no header inside the sample frame');
   await w.waitForTimeout(400);await w.screenshot({path:out+'/0-welcome.png',fullPage:true});
   await w.click('[data-a=mode][data-m=signup]');assert.ok(await w.locator('#au-name').count(),'create-account form');
   assert.strictEqual(await w.locator('#demoframe').count(),1,'sample frame kept when switching forms');
   // no account needed
   await w.click('[data-a=trylocal]');await w.waitForSelector('.localban');
   assert.ok(await w.locator('text=Saved in this browser only').count());
   await w.click('.bar [data-a=log]');await w.selectOption('select[name=sc]','o-rising-tide');await w.fill('.seat [name=pp]','Robin');if(await w.locator('.dd-wrap.combo').count())await w.keyboard.press('Escape');
   await w.selectOption('.seat [name=pi]','Agatha Crane');await w.click('.seg.big .pass');await w.click('form[data-form=play] button[type=submit]');
   await w.waitForSelector('.plays > li');await w.reload();await w.waitForSelector('.plays > li');
   assert.strictEqual(await w.locator('.plays > li').count(),1,'browser casebook survives a reload');
   await w.screenshot({path:out+'/0b-local.png'});
   await w.click('.localban a');await w.waitForSelector('text=Save your casebook');await w.screenshot({path:out+'/0c-save.png'});
   await w.fill('#au-em','robin@example.com');await w.fill('#au-pw','secret1');await w.click('form[data-form=auth] button[type=submit]');
   await w.waitForSelector('.acctbtn');await w.waitForFunction(()=>Object.keys(window.__fake.store).some(k=>/^users\/u-robinexamplecom\/plays\//.test(k)));
   await w.waitForTimeout(200);
   assert.strictEqual(await w.evaluate(()=>localStorage.getItem('mom-local-db')),null,'browser copy cleared after moving');
   assert.strictEqual(await w.locator('.localban').count(),0,'no browser-only banner once saved');
   assert.ok(!(await w.evaluate(()=>location.search)).includes('save'),'back to the normal address');
   await c3.close();}
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
  // player boxes on a phone: the phone's own picker with the known players and "Someone new…"
  assert.ok(await q.locator('.seat .pp-pick').first().isVisible(),'phone picker over the player box');
  await q.locator('.seat .pp-pick').first().focus();
  const opts=await q.locator('.seat .pp-pick').first().locator('option').allTextContents();
  assert.ok(opts.includes('Dan')&&opts.includes('Someone new…'),'known players and Someone new in the phone picker: '+opts.join('|'));
  assert.strictEqual(await q.locator('.dd-wrap.combo').count(),0,'no custom list on a phone');
  await q.locator('.seat .pp-pick').first().selectOption('__someone_new__');
  assert.ok(await q.locator('.seat .pp-wrap.typing').count(),'Someone new uncovers the box for typing');
  assert.strictEqual(await q.locator('.seat [name=pp]').first().inputValue(),'','cleared for a new name');
  assert.ok(await q.locator('.seat .pp-pick').first().isVisible(),'the arrow still opens the picker while typing');
  assert.ok((await q.locator('.seat .pp-pick').first().boundingBox()).width<60,'and only the arrow, so the box takes typing');
  await q.locator('.seat .pp-pick').first().selectOption('Dan');
  assert.strictEqual(await q.locator('.seat .pp-wrap.typing').count(),0,'changing your mind back to a known player');
  assert.strictEqual(await q.locator('.seat [name=pp]').first().inputValue(),'Dan');
  await q.locator('.seat .pp-pick').first().selectOption('__someone_new__');
  await q.locator('.seat [name=pp]').first().fill('Robin');await q.locator('.dlg h2').first().click();
  assert.strictEqual(await q.locator('.seat .pp-wrap.typing').count(),0,'covered again once a name is typed');
  await q.locator('.seat .pp-pick').first().focus();
  assert.strictEqual(await q.locator('.seat .pp-pick').first().inputValue(),'Robin','the typed name is listed and chosen');
  await q.locator('.seat .pp-pick').first().selectOption('Dan');
  assert.strictEqual(await q.locator('.seat [name=pp]').first().inputValue(),'Dan','picked on the phone');
  await q.tap('.dlg select[name=sc]');await q.waitForTimeout(300);
  assert.strictEqual(await q.locator('.dd-wrap').count(),0,'a tap on a phone gets the phone\'s own picker, not ours');
  await q.keyboard.press('Escape');await q.waitForTimeout(100);if(await q.locator('.dlg').count())await q.keyboard.press('Escape');await q.click('[data-t=stats]');await q.screenshot({path:out+'/11-phone-stats-dark.png',fullPage:true});
  await browser.close();
  if(errors.length){console.error(errors.join('\n'));process.exit(1);}
  console.log('ui: all checks passed; screenshots in '+out);
})().catch(e=>{console.error(e);process.exit(1);});
