// Every piece of the site's own text that js/lang/<code>.js needs to translate: the English passed to t() and tn() in
// the scripts, the HTML marked data-t, and the few chosen at run time (listed in DYNAMIC below).
// Run: node scripts/i18n-keys.js            prints them as JSON, {key: "plural" or "text"}
//      node scripts/i18n-keys.js <code>     lists what js/lang/<code>.js is missing
// test/i18n.test.js uses keys() to check every language has them all.
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const SCRIPTS=['js/app.js','js/shared.js','js/importer.js','js/catalog.js','js/i18n.js','js/demo.js'];
const PAGES=['index.html','admin.html','privacy.html'];
// keys made at run time: result labels, the profile colors and "Normal rules" (Valkyrie's language names come from
// the browser's own list, see langName in js/app.js)
const DYNAMIC=['Won','Lost','Abandoned','Normal rules','Not stated',
  // the first-edition and core set names (packing-list tags' tooltips, SETS in js/app.js)
  'Second Edition Core','First Edition Core','Call of the Wild','Forbidden Alchemy',
  'slate','crimson','rust','forest','teal','navy','violet','rose'];
function unescape(s){return s.replace(/\\u([0-9a-fA-F]{4})/g,(m,h)=>String.fromCharCode(parseInt(h,16))).replace(/\\n/g,'\n').replace(/\\(.)/g,'$1');}
function keys(){
  const out={};
  const str="'((?:[^'\\\\]|\\\\.)*)'";
  for(const f of SCRIPTS){
    const src=fs.readFileSync(path.join(root,f),'utf8');
    for(const m of src.matchAll(new RegExp('\\btn\\(\\s*'+str+'\\s*,\\s*'+str,'g')))out[unescape(m[2])]='plural';
    for(const m of src.matchAll(new RegExp('(?:\\bt|\\btr|\\bT)\\(\\s*'+str,'g'))){const k=unescape(m[1]);if(!out[k])out[k]='text';}
  }
  for(const f of PAGES){
    const src=fs.readFileSync(path.join(root,f),'utf8');
    for(const m of src.matchAll(/<(\w+)\b[^>]*\sdata-t(?:="([^"]*)")?[^>]*>([\s\S]*?)<\/\1>/g))out[(m[2]||m[3]).trim()]='text';
  }
  for(const k of DYNAMIC)out[k]=out[k]||'text';
  delete out[''];
  return out;
}
// js/lang/<code>.js's table, and the premises and reviews that go with it
function table(code){
  const I={};global.I18N={add:(c,pairs,e)=>{I.c=c;I.s={};(pairs||[]).forEach(p=>{I.s[p[0]]=p[1];});I.e=e||{};}};
  new Function('I18N',fs.readFileSync(path.join(root,'js/lang',code+'.js'),'utf8'))(global.I18N);
  return {strings:I.s||{},premises:(I.e&&I.e.premises)||{},reviews:(I.e&&I.e.reviews)||{}};
}
module.exports={keys,table,LANGS:['es','ca','fr','pl','pt']};
if(require.main===module){
  const k=keys(),code=process.argv[2];
  if(!code){console.log(JSON.stringify(k,null,1));console.error(Object.keys(k).length+' keys');}
  else{const t=table(code).strings;const miss=Object.keys(k).filter(x=>!(x in t));console.log(miss.length?miss.join('\n'):'nothing missing');}
}
