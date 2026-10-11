// Every language in js/lang/ has every string the site uses (scripts/i18n-keys.js), with the same {placeholders} and
// HTML tags as the English, the plural forms its language needs, and every premise and review summary.
// Run: node test/i18n.test.js
const assert=require('assert'),fs=require('fs'),path=require('path');
const {keys,table,LANGS}=require('../scripts/i18n-keys.js');
global.globalThis.MOM=undefined;
require('../js/official-info.js');require('../js/reviews.js');
const K=keys(),PREM=globalThis.MOM_OFFICIAL_INFO,REV=globalThis.MOM_REVIEWS;
const holes=s=>(String(s).match(/\{\w+\}/g)||[]).sort().join(' ');
const tags=s=>(String(s).match(/<\/?[a-z][^>]*>/g)||[]).map(x=>x.replace(/\s+/g,' ')).sort().join(' ');
let problems=[];
for(const code of LANGS){
  const f=path.join(__dirname,'..','js','lang',code+'.js');
  if(!fs.existsSync(f)){problems.push(code+': no js/lang/'+code+'.js');continue;}
  const T=table(code),cats=new Intl.PluralRules(code).resolvedOptions().pluralCategories;
  for(const k of Object.keys(K)){
    const v=T.strings[k];
    if(v==null){problems.push(code+': missing '+JSON.stringify(k));continue;}
    const eng=k.replace(/\|[^|]*$/,'');
    if(K[k]==='plural'){
      if(typeof v!=='object'){problems.push(code+': '+JSON.stringify(k)+' needs plural forms');continue;}
      // every form the language uses for whole numbers ("many" falls back to "other" where it only covers millions)
      for(const c of cats)if(c!=='many'&&c!=='other'&&!v[c]||c==='other'&&!v.other)problems.push(code+': '+JSON.stringify(k)+' lacks "'+c+'"');
      if(code==='pl'&&!v.many)problems.push(code+': '+JSON.stringify(k)+' lacks "many"');
      for(const c in v){if(holes(v[c]).replace('{n}','').trim()!==holes(eng).replace('{n}','').trim())problems.push(code+': '+JSON.stringify(k)+' ['+c+'] placeholders differ');
        if(tags(v[c])!==tags(eng))problems.push(code+': '+JSON.stringify(k)+' ['+c+'] HTML differs');}
    }else{
      if(typeof v!=='string'||!v.trim()){problems.push(code+': '+JSON.stringify(k)+' is empty');continue;}
      if(holes(v)!==holes(eng))problems.push(code+': '+JSON.stringify(k)+' placeholders differ: '+holes(v));
      if(tags(v)!==tags(eng))problems.push(code+': '+JSON.stringify(k)+' HTML differs');
    }
  }
  for(const k of Object.keys(T.strings))if(!(k in K))problems.push(code+': unused '+JSON.stringify(k));
  for(const id in PREM)if(!T.premises[id])problems.push(code+': no premise for '+id);
  for(const id in REV)REV[id].forEach((r,i)=>{if(!(T.reviews[id]||[])[i])problems.push(code+': no review '+id+' #'+i);});
}
if(problems.length){console.error(problems.slice(0,60).join('\n')+(problems.length>60?'\n… and '+(problems.length-60)+' more':''));process.exit(1);}
console.log('i18n: '+LANGS.length+' languages, '+Object.keys(K).length+' strings each, all present');
