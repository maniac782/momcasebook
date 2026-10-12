/* Mansions of Madness Casebook — the site in other languages.
   Every piece of the site's own text is written in English in the code and passed through t() (or tn() when it depends
   on a number); js/lang/<code>.js holds each language's table, keyed by the English. Anything missing shows in English.
   Not translated: what people type (plays, notes, names, places), scenario, product, investigator and tile names, and the
   Valkyrie authors' own descriptions.
   The language is the one picked in Settings or the footer (kept on this device, and in the account so it follows you),
   else the browser's own when we have it, else English. Only that language's table is loaded, before the page's scripts.
   scripts/i18n-keys.js lists every string; test/i18n.test.js checks each table has them all. */
(function(){
'use strict';
var LANGS=[['en','English'],['es','Español'],['ca','Català'],['fr','Français'],['pl','Polski'],['pt','Português']];
// for dates, times and numbers; English keeps the browser's own way of writing them
var LOCALE={en:undefined,es:'es-ES',ca:'ca-ES',fr:'fr-FR',pl:'pl-PL',pt:'pt-BR'};
var known=function(l){return LANGS.some(function(x){return x[0]===l;});};
var stored=null;try{stored=localStorage.getItem('mom-lang');}catch(e){}
var fromUrl=/[?&]lang=([a-z]{2})\b/.exec(location.search);
function fromBrowser(){var l=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||'en'];
  for(var i=0;i<l.length;i++){var c=String(l[i]||'').slice(0,2).toLowerCase();if(known(c))return c;}return 'en';}
var lang=fromUrl&&known(fromUrl[1])?fromUrl[1]:stored&&known(stored)?stored:fromBrowser();
var T={},P={},R={},S={},plural=null;
try{plural=new Intl.PluralRules(lang);}catch(e){}
function fill(s,v){return v?String(s).replace(/\{(\w+)\}/g,function(m,k){return v[k]!=null?v[k]:m;}):String(s);}

var I=window.I18N={
  lang:lang,langs:LANGS,locale:LOCALE[lang],
  chosen:!!(stored&&known(stored)),   // picked by the person on this device, not just the browser's default
  // called by js/lang/<code>.js with [English, translation] pairs (a plural's translation is {one, few, many, other})
  add:function(code,pairs,extra){if(code!==lang)return;T={};(pairs||[]).forEach(function(p){T[p[0]]=p[1];});P=(extra&&extra.premises)||{};R=(extra&&extra.reviews)||{};S=(extra&&extra.scenarios)||{};},
  // an official scenario's name as the companion app shows it in this language (or null for the English)
  scenario:function(id){return S[id]||null;},
  // our premise for an official scenario, and a review's summary, in this language (or null for the English)
  premise:function(id){return P[id]||null;},
  review:function(id,i){return (R[id]||[])[i]||null;},
  name:function(code){var x=LANGS.filter(function(y){return y[0]===code;})[0];return x?x[1]:code;},
  // switch: remember it here, let the page save it to the account (window.momSaveLang), then reload in that language
  set:function(code){if(!known(code))return;try{localStorage.setItem('mom-lang',code);}catch(e){}
    var go=function(){var u=location.href.replace(/([?&])lang=[a-z]{2}&?/,'$1').replace(/[?&]$/,'');location.replace(u);};
    var save=window.momSaveLang?window.momSaveLang(code):null;
    if(save&&save.then){var t0=setTimeout(go,1500);save.then(function(){clearTimeout(t0);go();},function(){clearTimeout(t0);go();});}else go();},
  // a language picker (the footer's, and Settings')
  picker:function(id,cls){return '<select id="'+id+'" data-dd class="'+(cls||'')+'" aria-label="'+t('Language')+'">'+LANGS.map(function(x){return '<option value="'+x[0]+'"'+(x[0]===lang?' selected':'')+'>'+x[1]+'</option>';}).join('')+'</select>';},
  // translate the page's own HTML: elements marked data-t (their contents), and data-t-title / -placeholder / -aria-label
  apply:function(root){
    root=root||document;
    root.querySelectorAll('[data-t]').forEach(function(el){var k=el.getAttribute('data-t')||el.innerHTML.trim();el.setAttribute('data-t',k);if(T[k])el.innerHTML=T[k];});
    ['title','placeholder','aria-label'].forEach(function(a){root.querySelectorAll('[data-t-'+a+']').forEach(function(el){var k=el.getAttribute('data-t-'+a)||el.getAttribute(a)||'';el.setAttribute('data-t-'+a,k);el.setAttribute(a,t(k));});});
  }
};
// t("Plays"), t("{n} or more", {n:7}): the text in this language, with {names} filled in. A key may end in "|context"
// when one English word needs different words elsewhere ("Won|total" heads a count); English drops the "|…".
var plain=function(s){return String(s).replace(/\|[^|]*$/,'');};
var t=window.t=function(s,v){var r=T[s];return fill(typeof r==='string'?r:plain(s),v);};
// tn('{n} play', '{n} plays', count, {...}): the right form for the count (Polish has three). The table keeps the
// plural (other) English as the key, with {one, few, many, other} as needed by the language.
window.tn=function(one,other,n,v){v=v||{};if(v.n==null)v.n=n;var r=T[other],s;
  if(r&&typeof r==='object'){var c=plural?plural.select(n):'other';s=r[c]||r.other;}
  else s=typeof r==='string'?r:plain(n===1?one:other);
  // the count and its word stay on one line ("3 plays", not "3" at the end of one line and "plays" on the next)
  return fill(String(s).replace(/\{n\} /g,'{n} '),v);};
// numbers and dates the local way (English: the browser's own)
window.fmtNum=function(n,o){try{return Number(n).toLocaleString(LOCALE[lang],o);}catch(e){return String(n);}};

document.documentElement.lang=lang==='pt'?'pt-BR':lang;
if(lang!=='en')document.write('<script src="js/lang/'+lang+'.js?v='+encodeURIComponent(self.APP_VERSION||'')+'"><\/script>');
document.addEventListener('DOMContentLoaded',function(){
  I.apply(document);
  // the footer's language picker, on every page
  var foot=document.querySelector('.foot');
  if(foot&&!document.getElementById('langpick')){var s=document.createElement('label');s.className='langpick';
    s.innerHTML='<span class="sr">'+t('Language')+'</span>'+I.picker('langpick','');foot.insertBefore(s,document.getElementById('ver'));
    s.querySelector('select').addEventListener('change',function(e){I.set(e.target.value);});}
});
})();
