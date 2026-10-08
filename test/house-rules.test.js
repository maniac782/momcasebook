// Run: node test/house-rules.test.js   (CI sets BEFORE to the previous commit of the push)
// 1. No yellow, amber or gold in the UI: every colour in the CSS, HTML, JS and manifest is checked.
// 2. The visible version number goes up whenever a published file changes.
const fs=require('fs'),path=require('path'),{execSync}=require('child_process');
const root=path.join(__dirname,'..');let bad=[];
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);
  if(e.name.startsWith('.')||['node_modules','test','scripts'].includes(e.name))return [];return e.isDirectory()?files(p):[p];});}
function hsl(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,d=mx-mn;if(!d)return [0,0,l];
  const s=d/(1-Math.abs(2*l-1));let h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;if(h<0)h+=360;return [h,s,l];}
// "Yellow" = hue 38–68° with real saturation and not near-black/near-white. Covers yellow, gold, amber, mustard, brass.
const yellowish=(r,g,b)=>{const [h,s,l]=hsl(r,g,b);return h>=38&&h<=68&&s>=0.3&&l>=0.15&&l<=0.92;};
for(const f of files(root).filter(f=>/\.(css|html|js|webmanifest)$/.test(f))){
  const t=fs.readFileSync(f,'utf8'),rel=path.relative(root,f);
  for(const m of t.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)){let x=m[1];if(x.length===3)x=x.split('').map(c=>c+c).join('');
    const [r,g,b]=[0,2,4].map(i=>parseInt(x.slice(i,i+2),16));if(yellowish(r,g,b))bad.push(rel+': #'+m[1]);}
  for(const m of t.matchAll(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/gi))if(yellowish(+m[1],+m[2],+m[3]))bad.push(rel+': '+m[0]);
  // named colours used as a value, e.g. "color: gold" or fill="yellow" (comments are ignored)
  const code=t.replace(/\/\*[\s\S]*?\*\//g,'').replace(/<!--[\s\S]*?-->/g,'');
  for(const m of code.matchAll(/(?:[:=]\s*["']?|\s)(yellow|gold|goldenrod|khaki|lightyellow|lemonchiffon)(?![\w-])/gi)){
    const ctx=code.slice(Math.max(0,m.index-50),m.index+m[0].length);
    if(/(color|background|fill|stroke|border|outline|shadow)[\w-]*\s*[:=][^;{}]*$/i.test(ctx))bad.push(rel+': '+m[1]);}
}
if(bad.length){console.error('Yellow found in the UI (not allowed):\n  '+bad.join('\n  '));process.exit(1);}
console.log('no yellow: ok');

// 3. Only official investigators: the list in firestore.rules must match js/catalog.js exactly.
global.window=globalThis;require('../js/valkyrie.js');require('../js/catalog.js');
const rulesInv=[...(fs.readFileSync(path.join(root,'firestore.rules'),'utf8').match(/function investigators\(\) \{\s*return \[([^\]]*)\]/)||[,''])[1].matchAll(/'([^']*)'/g)].map(m=>m[1]);
const catInv=globalThis.MOM.INVESTIGATORS;
if(JSON.stringify(rulesInv)!==JSON.stringify(catInv)){console.error('firestore.rules investigators() differs from js/catalog.js:\n  rules: '+rulesInv.length+'\n  catalog: '+catInv.length);process.exit(1);}
console.log('investigators: '+catInv.length+' official, rules match');

const before=process.env.BEFORE;
if(before&&!/^0+$/.test(before)){
  let changed;try{changed=execSync('git diff --name-only '+before+' HEAD',{cwd:root}).toString().trim().split('\n').filter(Boolean);}
  catch(e){console.log('version: previous commit not available, skipped');process.exit(0);}
  const published=changed.filter(f=>!/^(README\.md|CLAUDE\.md|test\/|scripts\/|\.github\/|\.gitignore|\.firebaserc)/.test(f));
  if(published.length){
    const v=s=>+((s.match(/APP_VERSION\s*=\s*'v(\d+)'/)||[])[1]||0);
    let old='';try{old=execSync('git show '+before+':js/version.js',{cwd:root}).toString();}catch(e){}
    const now=fs.readFileSync(path.join(root,'js/version.js'),'utf8');
    if(old&&!(v(now)>v(old))){console.error('Published files changed ('+published.join(', ')+') but js/version.js is still v'+v(now)+'. Bump APP_VERSION.');process.exit(1);}
    console.log('version: v'+v(old)+' -> v'+v(now)+' ok');
  }else console.log('version: no published files changed');
}
