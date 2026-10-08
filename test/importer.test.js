// Run: node test/importer.test.js
const assert=require('assert'),fs=require('fs'),path=require('path');
require('../js/valkyrie.js');require('../js/catalog.js');require('../js/importer.js');
const {MOM,MOMImport:I}=globalThis;
const rows=I.parseCSV(fs.readFileSync(path.join(__dirname,'fixture-sheet.csv'),'utf8'));
const r=I.buildPlays(rows,MOM.OFFICIAL);
const byName=n=>r.plays.find(p=>p.scenarioName===n);
assert.strictEqual(r.plays.length,10,'10 played rows');
assert.strictEqual(r.skipped,10,'10 unplayed rows skipped');
assert.strictEqual(r.scenarios.length,0,'every scenario is in the official catalog');
assert.strictEqual(r.plays.filter(p=>p.result==='pass').length,5);
assert.strictEqual(r.plays.filter(p=>p.result==='fail').length,5);
const vi=byName('Vengeful Impulses');assert.strictEqual(vi.attempts,3);assert.strictEqual(vi.result,'pass');
assert.deepStrictEqual(vi.party.map(x=>x.investigator),['Agatha Crane','Preston Fairmont','']);
assert.ok(/“\?”/.test(vi.notes),'unknown investigator noted');
const ei=byName('Escape from Innsmouth');assert.ok(ei.solo);assert.deepStrictEqual(ei.party,[{player:'Dan',investigator:''}]);
assert.deepStrictEqual(byName('10:50 to Arkham').party.map(x=>x.investigator),['Tommy Muldoon','Preston Fairmont','Amanda Sharpe']);
assert.deepStrictEqual(byName('Altered Fates').party.map(x=>x.investigator),['Agatha Crane','Preston Fairmont','Rita Young','Lily Chen']);
assert.strictEqual(byName('Gangs of Arkham').rules,'Normal rules');
assert.strictEqual(byName('What Lies Within').rules,'Modified rules (2 moves, 1 action)');
assert.strictEqual(new Set(r.plays.map(p=>p.importKey)).size,10,'import keys unique');
// round trip through this site's own export
const again=I.buildPlays(I.parseCSV(I.toCSV(r.plays)),MOM.OFFICIAL);
assert.strictEqual(again.plays.length,10);
assert.deepStrictEqual(again.plays.map(p=>[p.scenarioId,p.result,p.attempts,p.rules,JSON.stringify(p.party)]),r.plays.map(p=>[p.scenarioId,p.result,p.attempts,p.rules,JSON.stringify(p.party)]));
// gviz shape
const g=I.gvizRows({cols:[{label:'Scenario'},{label:'Played'}],rows:[{c:[{v:'Rising Tide'},{v:'Y'}]}]});
assert.deepStrictEqual(g,[['Scenario','Played'],['Rising Tide','Y']]);
assert.strictEqual(I.sheetId('https://docs.google.com/spreadsheets/d/1qOKghDouy9aFbaexfI-Gt7JSxcLmRkDMsIfRJfvD5Ug/edit?usp=sharing'),'1qOKghDouy9aFbaexfI-Gt7JSxcLmRkDMsIfRJfvD5Ug');
assert.strictEqual(I.normDate('3/14/2025'),'2025-03-14');assert.strictEqual(I.normDate('Date(2025,2,14)'),'2025-03-14');
assert.strictEqual(MOM.OFFICIAL.length,23);
// Valkyrie: the built-in list is there, and a sheet row naming one matches it
assert.ok(MOM.VALKYRIE.length>100,'valkyrie list loaded');
assert.ok(MOM.VALKYRIE.every(s=>/^v-[a-z0-9-]+$/.test(s.id)&&s.type==='valkyrie'&&s.name),'valkyrie entries well formed');
assert.strictEqual(new Set(MOM.VALKYRIE.map(s=>MOM.key(s.name))).size,MOM.VALKYRIE.length,'no duplicate valkyrie names');
assert.ok(!MOM.VALKYRIE.some(v=>MOM.OFFICIAL.some(o=>MOM.key(o.name)===MOM.key(v.name))),'no valkyrie name clashes with an official one');
const vr=I.buildPlays([['Scenario','Played','Pass/Fail'],['exotic material','Y','Pass']],MOM.OFFICIAL.concat(MOM.VALKYRIE));
assert.strictEqual(vr.plays[0].scenarioId,'v-exotic-material');assert.strictEqual(vr.plays[0].scenarioType,'valkyrie');assert.strictEqual(vr.scenarios.length,0);
// only official investigators come out of an import; anything else becomes an unknown seat, with a note
assert.deepStrictEqual(byName('The Jungle Awakens').party.map(x=>x.investigator),['Ursula Downs','"Ashcan" Pete','Lily Chen']);
const odd=I.buildPlays([['Scenario','Played','Characters','Pass/Fail'],['Rising Tide','Y','Daisy Walker, Wendy, Bob the Builder','Pass']],MOM.OFFICIAL);
assert.deepStrictEqual(odd.plays[0].party.map(x=>x.investigator),['','Wendy Adams','']);
assert.ok(/Daisy Walker, Bob the Builder/.test(odd.plays[0].notes),'unknown names kept in the notes');
assert.ok(r.plays.every(p=>p.party.every(s=>s.investigator===''||MOM.isInvestigator(s.investigator))),'every imported investigator is official');
const lr=I.buildPlays([['Scenario','Played','Pass/Fail','Where'],['Rising Tide','Y','Pass',"Gerri's"]],MOM.OFFICIAL);
assert.strictEqual(lr.plays[0].location,"Gerri's");
assert.strictEqual(I.buildPlays(I.parseCSV(I.toCSV(lr.plays)),MOM.OFFICIAL).plays[0].location,"Gerri's",'location survives export and import');
console.log('importer: all checks passed');
r.plays.forEach(p=>console.log(p.result.padEnd(5),String(p.attempts),p.scenarioName.padEnd(34),p.party.map(x=>(x.player?x.player+':':'')+x.investigator).join(', ')));
