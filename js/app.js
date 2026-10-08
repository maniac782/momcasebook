/* Mansions of Madness Casebook — the main page: sign-in, the play log, scenarios, stats and settings.
   Data (all private to each account, see firestore.rules):
     users/{uid}                 name, email, created, lastSeen, playCount, owned (product ids from js/catalog.js)
     users/{uid}/plays/{id}      scenarioId, scenarioName, scenarioType, date (YYYY-MM-DD or ''), result (pass|fail|abandoned),
                                 attempts, party [{player, investigator}], solo, rules, notes, created, updated, importKey?, seq?
     users/{uid}/scenarios/{id}  their own Valkyrie or homemade scenarios: name, type (valkyrie|custom), author, link
     scenarios/{id}              Valkyrie and other scenarios the admin shares with everyone (same fields) */
(function(){
'use strict';
var MOM=window.MOM,I=window.MOMImport;
var app=document.getElementById('app'),acctEl=document.getElementById('acct');
var fb=null,me=null,authKnown=false,profile=null,plays=[],mine=[],shared=[],people=[],groups=[],isAdmin=false,loaded={plays:false},unsub=[];
var ui={tab:'plays',q:'',result:'',player:'',scen:'',sfilter:'all',authMode:'signin',authErr:'',busy:false,imp:null};
try{var t0=sessionStorage.getItem('mom-tab');if(t0)ui.tab=t0;}catch(e){}
var DAY=86400000;

// ---------- helpers ----------
function fmtDate(d){if(!d)return 'No date';var x=new Date(d+'T12:00:00');return isNaN(x)?d:x.toLocaleDateString([], {year:'numeric',month:'short',day:'numeric'});}
function today(){var d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
function pct(a,b){return b?Math.round(a*100/b)+'%':'—';}
var RES={pass:['Passed','ok'],fail:['Failed','bad'],abandoned:['Abandoned','muted']};
function resChip(r){var x=RES[r];return x?'<span class="chip '+x[1]+'">'+x[0]+'</span>':'<span class="chip muted">No result</span>';}
function typeName(t){return t==='official'?'Official':t==='valkyrie'?'Valkyrie':'Your own';}
function sortPlays(a,b){return (b.date||'').localeCompare(a.date||'')||(b.date?0:(a.seq||0)-(b.seq||0))||(b.created||0)-(a.created||0);}
function partyText(p){
  var seats=(p.party||[]);if(!seats.length)return '';
  return seats.map(function(s){return s.player&&s.investigator?esc(s.player)+' <span class="as">as</span> '+esc(s.investigator):esc(s.player||s.investigator||'Unknown');}).join(', ');
}
// Every scenario this person can pick: official, shared by the admin, and their own. Later entries with the same name are skipped.
function showValk(){return !(profile&&profile.hideValkyrie);}
function allScenarios(all){
  var seen={},out=[];
  MOM.OFFICIAL.concat(all||showValk()?MOM.VALKYRIE:[],shared,mine).forEach(function(s){var k=MOM.key(s.name);if(!seen[k]){seen[k]=1;out.push(s);}});
  return out;
}
function scenById(id){return allScenarios(true).filter(function(s){return s.id===id;})[0];}
function owned(){return profile&&Array.isArray(profile.owned)?profile.owned:MOM.PRODUCTS.map(function(p){return p.id;});}
function myName(){return (profile&&profile.name)||(me&&me.displayName)||'';}
function names(field){
  var c={};plays.forEach(function(p){(p.party||[]).forEach(function(s){var v=(s[field]||'').trim();if(v)c[v]=(c[v]||0)+1;});});
  return Object.keys(c).sort(function(a,b){return c[b]-c[a]||a.localeCompare(b);});
}
// Places used before, most used first.
function places(){var c={};plays.forEach(function(p){if(p.location)c[p.location]=(c[p.location]||0)+1;});return Object.keys(c).sort(function(a,b){return c[b]-c[a]||a.localeCompare(b);});}
function rulesUsed(){var c={'Normal rules':0};plays.forEach(function(p){if(p.rules)c[p.rules]=(c[p.rules]||0)+1;});return Object.keys(c).sort(function(a,b){return c[b]-c[a];});}
function friendly(e){
  var m={'auth/invalid-email':'That email address doesn’t look right.','auth/missing-password':'Enter your password.',
   'auth/invalid-credential':'Wrong email or password.','auth/wrong-password':'Wrong email or password.','auth/user-not-found':'Wrong email or password.',
   'auth/email-already-in-use':'There’s already an account with that email. Sign in instead.','auth/weak-password':'Use at least 6 characters for the password.',
   'auth/too-many-requests':'Too many tries. Wait a minute and try again.','auth/popup-closed-by-user':'','auth/cancelled-popup-request':'',
   'auth/network-request-failed':'Can’t reach the server. Check your connection.','permission-denied':'The database refused that change.'};
  return e&&e.msg?e.msg:e&&m[e.code]!=null?m[e.code]:'Something went wrong. Try again.';
}

// ---------- rendering ----------
function render(){
  if(!authKnown){app.innerHTML='<p class="note pad">Loading…</p>';return;}
  if(!me){acctEl.innerHTML='';app.innerHTML=signInHtml();return;}
  acctEl.innerHTML=accountMenu(me,{admin:isAdmin,photo:profile&&profile.photo,name:myName()});
  var keep=document.activeElement&&/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)&&document.activeElement.id;
  var tabs=[['plays','Plays'],['scenarios','Scenarios'],['players','Players'],['stats','Stats'],['settings','Settings']];
  var h='<div class="bar"><div class="tabs" role="tablist">'+tabs.map(function(t){return '<button class="tab" role="tab" aria-selected="'+(ui.tab===t[0])+'" data-a="tab" data-t="'+t[0]+'">'+t[1]+'</button>';}).join('')+'</div>'+
    '<button class="btn pri" data-a="log">+ Log a play</button></div>';
  h+=ui.tab==='scenarios'?scenariosHtml():ui.tab==='players'?playersHtml():ui.tab==='stats'?statsHtml():ui.tab==='settings'?settingsHtml():playsHtml();
  app.innerHTML=h;
  if(keep){var el=document.getElementById(keep);if(el){el.focus();try{var n=el.value.length;el.setSelectionRange(n,n);}catch(e){}}}
}

function signInHtml(){
  var m=ui.authMode;
  return '<section class="hero"><h2>Every night in the mansion, written down.</h2>'+
    '<p>Keep a log of your Mansions of Madness games, official scenarios and Valkyrie ones alike: who played, which investigators they took, whether you made it out, and what happened. It works on phones and computers, installs like an app and keeps working offline.</p></section>'+
    '<section class="sec auth"><h2>'+(m==='signup'?'Create an account':m==='reset'?'Reset your password':'Sign in')+'</h2>'+
    (m==='reset'?'':'<button class="btn google" data-a="google"><span class="g" aria-hidden="true">G</span> Continue with Google</button><div class="or"><span>or with email</span></div>')+
    '<form class="stack" data-form="auth">'+
    (m==='signup'?'<label class="field"><span class="lbl">Your name</span><input class="f" id="au-name" autocomplete="name" maxlength="40" placeholder="How you appear in your own plays"></label>':'')+
    '<label class="field"><span class="lbl">Email</span><input class="f" id="au-em" type="email" autocomplete="email" required></label>'+
    (m==='reset'?'':'<label class="field"><span class="lbl">Password</span><input class="f" id="au-pw" type="password" autocomplete="'+(m==='signup'?'new-password':'current-password')+'" required minlength="6"></label>')+
    (ui.authErr?'<p class="err" role="alert">'+esc(ui.authErr)+'</p>':'')+
    '<button class="btn pri" type="submit"'+(ui.busy?' disabled':'')+'>'+(m==='signup'?'Create account':m==='reset'?'Send reset link':'Sign in')+'</button></form>'+
    '<p class="note links">'+(m==='signin'?'New here? <a href="#" data-a="mode" data-m="signup">Create an account</a> · <a href="#" data-a="mode" data-m="reset">Forgot password?</a>':'<a href="#" data-a="mode" data-m="signin">Back to sign in</a>')+'</p></section>';
}

function filtered(){
  var q=ui.q.trim().toLowerCase();
  return plays.filter(function(p){
    if(ui.result&&p.result!==ui.result)return false;
    if(ui.scen&&p.scenarioId!==ui.scen)return false;
    if(ui.player&&!(p.party||[]).some(function(s){return s.player===ui.player||s.investigator===ui.player;}))return false;
    if(q){var hay=[p.scenarioName,p.notes,p.rules,p.location].concat((p.party||[]).map(function(s){return s.player+' '+s.investigator;})).join(' ').toLowerCase();if(hay.indexOf(q)<0)return false;}
    return true;
  });
}
function playsHtml(){
  if(!loaded.plays)return '<p class="note pad">Loading your plays…</p>';
  if(!plays.length)return '<section class="sec empty"><h2>No plays yet</h2><p class="note">Log your first game with <b>+ Log a play</b>, or bring in the spreadsheet you’ve been keeping.</p>'+
    '<div class="row"><button class="btn pri" data-a="log">+ Log a play</button><button class="btn" data-a="goimport">Import a spreadsheet</button></div></section>';
  var list=filtered(),people=names('player'),invs=names('investigator'),probs=investigatorProblems();
  var scs={};plays.forEach(function(p){scs[p.scenarioId]=p.scenarioName;});
  var h='<div class="filters"><label class="field grow"><span class="lbl">Search</span><input class="f" id="q" type="search" value="'+esc(ui.q)+'" placeholder="Scenario, person, investigator or notes" autocomplete="off"></label>'+
    sel('fres','Result',ui.result,[['','Any'],['pass','Passed'],['fail','Failed'],['abandoned','Abandoned']])+
    sel('fpl','Player or investigator',ui.player,[['','Anyone']].concat(people.map(function(n){return [n,n];}),invs.length?[['-','────']]:[],invs.map(function(n){return [n,n];})))+
    sel('fsc','Scenario',ui.scen,[['','Any']].concat(Object.keys(scs).sort(function(a,b){return scs[a].localeCompare(scs[b]);}).map(function(k){return [k,scs[k]];})))+'</div>';
  if(probs.length)h='<section class="sec notice" role="status"><div class="grow"><b>Some investigator names aren\u2019t official ones</b><span class="note">'+probs.length+' name'+(probs.length===1?'':'s')+' ('+probs.slice(0,3).map(function(x){return '\u201c'+esc(x.text)+'\u201d';}).join(', ')+(probs.length>3?'\u2026':'')+') need matching to an official investigator.</span></div><button class="btn pri" data-a="fixinv">Fix them</button></section>'+h;
  var any=ui.q||ui.result||ui.player||ui.scen;
  h+='<p class="note count">'+list.length+' of '+plays.length+' play'+(plays.length===1?'':'s')+(any?' · <a href="#" data-a="clearf">Clear filters</a>':'')+'</p>';
  if(!list.length)return h+'<p class="note">Nothing matches.</p>';
  h+='<ul class="plays">'+list.map(function(p){
    var t=p.scenarioType&&p.scenarioType!=='official'?'<span class="chip tag">'+typeName(p.scenarioType)+'</span>':'';
    return '<li><button class="play" data-a="edit" data-id="'+esc(p.id)+'">'+
      '<span class="pl-top"><span class="pl-date num">'+esc(fmtDate(p.date))+'</span>'+(p.location?'<span class="pl-loc">at '+esc(p.location)+'</span>':'')+resChip(p.result)+(p.attempts>1?'<span class="chip muted">'+p.attempts+' tries</span>':'')+t+'</span>'+
      '<span class="pl-name">'+esc(p.scenarioName)+'</span>'+
      (partyText(p)?'<span class="pl-party">'+partyText(p)+'</span>':'<span class="pl-party none">Players not recorded</span>')+
      (p.rules&&p.rules!=='Normal rules'?'<span class="pl-rules">'+esc(p.rules)+'</span>':'')+
      (p.notes?'<span class="pl-notes">'+esc(p.notes)+'</span>':'')+'</button></li>';}).join('')+'</ul>';
  return h;
}
function sel(id,label,val,opts){
  return '<label class="field"><span class="lbl">'+esc(label)+'</span><select class="f" id="'+id+'">'+opts.map(function(o){return '<option value="'+esc(o[0])+'"'+(o[0]==='-'?' disabled':'')+(o[0]===val?' selected':'')+'>'+esc(o[1])+'</option>';}).join('')+'</select></label>';
}

function scenStats(){
  var st={};plays.forEach(function(p){var s=st[p.scenarioId]||(st[p.scenarioId]={n:0,pass:0,last:''});s.n++;if(p.result==='pass')s.pass++;if((p.date||'')>s.last)s.last=p.date;});
  return st;
}
// A replay arrow for "Play again": an open circle turning back on itself with an arrowhead, drawn in the text colour
// so it matches the label in both themes. Original drawing (CC0); decorative, as the button text says what it does.
var ICON_AGAIN='<svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 3.8v5h5"/></svg>';
// ---------- the Scenarios tab: one list to browse, filter and sort ----------
var sf={src:'all',diff:'any',len:'any',rate:'any',lang:'any',sort:'box'};
// which of the Official / Valkyrie / Your own boxes are open; remembered on this device
var boxes={official:true,valkyrie:true,yours:true};
try{var bx0=JSON.parse(localStorage.getItem('mom-boxes')||'null');if(bx0)for(var kb in bx0)boxes[kb]=!!bx0[kb];}catch(e){}
function langsOf(s){return s.langs||(s.lang?[s.lang]:[]);}
try{var sf0=JSON.parse(sessionStorage.getItem('mom-sf')||'null');if(sf0)for(var k0 in sf0)sf[k0]=sf0[k0];}catch(e){}
// How long a scenario usually takes: Valkyrie players' real average when there are enough plays, else the middle of the author's estimate.
function typicalMins(s){return s.avg&&s.plays>=10?s.avg:s.minutes?(s.minutes[0]?(s.minutes[0]+s.minutes[1])/2:s.minutes[1]):0;}
function reviewsOf(s){return (window.MOM_REVIEWS||{})[s.id]||[];}
function scenariosHtml(){
  var st=scenStats(),own=owned(),f=ui.sfilter,sq=(ui.sq||'').trim().toLowerCase();
  // everything this person can play: official (owned), Valkyrie (unless switched off; retired ones only if played), shared and their own
  var seen={},all=[];
  var add=function(s,from){var k=MOM.key(s.name);if(seen[k])return;seen[k]=1;var o={};for(var x in s)o[x]=s[x];o.from=from;all.push(o);};
  MOM.OFFICIAL.forEach(function(s){if(own.indexOf(s.product)>=0||st[s.id])add(s,'official');});
  MOM.VALKYRIE.forEach(function(s){if((showValk()&&!s.retired)||st[s.id])add(s,'valkyrie');});
  shared.concat(mine).forEach(function(s){add(s,s.type==='valkyrie'?'valkyrie':s.type==='official'?'official':'yours');});
  var D={easy:[0,0.35],medium:[0.35,0.6],hard:[0.6,0.8],vhard:[0.8,2]},L={short:[0,120],mid:[120,180],long:[180,240],xlong:[240,1e9]};
  var list=all.filter(function(s){
    var x=st[s.id];
    if(sq&&((s.name||'')+' '+(s.author||'')).toLowerCase().indexOf(sq)<0)return false;
    if(sf.src!=='all'&&s.from!==sf.src)return false;
    if(f==='new'&&x||f==='unbeaten'&&x&&x.pass||f==='beaten'&&!(x&&x.pass))return false;
    if(sf.diff!=='any'){var d=D[sf.diff];if(!s.difficulty||s.difficulty<d[0]||s.difficulty>=d[1])return false;}
    if(sf.len!=='any'){var l=L[sf.len],m=typicalMins(s);if(!m||m<l[0]||m>=l[1])return false;}
    if(sf.rate!=='any'&&!(s.rating&&s.plays>=10&&s.rating>=+sf.rate))return false;
    if(sf.lang!=='any'&&s.from==='valkyrie'&&langsOf(s).indexOf(sf.lang)<0)return false;
    return true;
  });
  var known=function(v){return v==null||v===0?null:v;};
  var by=function(get,dir){return function(a,b){var x=known(get(a)),y=known(get(b));if(x==null&&y==null)return byName(a,b);if(x==null)return 1;if(y==null)return -1;return dir*(x-y)||byName(a,b);};};
  var SORT={name:byName,rating:by(function(s){return s.plays>=10?s.rating:null;},-1),plays:by(function(s){return s.plays;},-1),
    short:by(typicalMins,1),long:by(typicalMins,-1),easy:by(function(s){return s.difficulty;},1),hard:by(function(s){return s.difficulty;},-1),
    win:by(function(s){return s.plays>=10?s.win:null;},-1),
    lang:function(a,b){var x=a.lang||'',y=b.lang||'';if(!x!==!y)return x?-1:1;return x.localeCompare(y)||byName(a,b);},mine:by(function(s){var x=st[s.id];return x?x.last||'0':null;},-1)};
  var sel=function(id,label,val,opts){return '<label class="field"><span class="lbl">'+label+'</span><select class="f" id="'+id+'">'+opts.map(function(o){return '<option value="'+o[0]+'"'+(val===o[0]?' selected':'')+'>'+o[1]+'</option>';}).join('')+'</select></label>';};
  var offIds=MOM.OFFICIAL.filter(function(s){return own.indexOf(s.product)>=0;}),beat=offIds.filter(function(s){return st[s.id]&&st[s.id].pass;}).length;
  var h='<div class="filters"><label class="field grow"><span class="lbl">Search</span><input class="f" id="sq" type="search" value="'+esc(ui.sq||'')+'" placeholder="Scenario or author" autocomplete="off"></label>'+
    sel('sf-src','From',sf.src,[['all','Everything'],['official','Official'],['valkyrie','Valkyrie'],['yours','Your own']])+
    sel('sf-status','Your progress',f,[['all','Any'],['new','Not played'],['unbeaten','Not beaten yet'],['beaten','Beaten']])+
    sel('sf-diff','Difficulty',sf.diff,[['any','Any'],['easy','Easy'],['medium','Medium'],['hard','Hard'],['vhard','Very hard']])+
    sel('sf-len','Length',sf.len,[['any','Any'],['short','Under 2 hours'],['mid','2 to 3 hours'],['long','3 to 4 hours'],['xlong','Over 4 hours']])+
    sel('sf-rate','Rating',sf.rate,[['any','Any'],['7','7 or more'],['8','8 or more'],['8.5','8.5 or more']])+
    sel('sf-lang','Language',sf.lang,[['any','Any']].concat(langChoices()))+
    sel('sf-sort','Sort by',sf.sort,[['box','Box, then name'],['name','Name'],['rating','Highest rated'],['plays','Most played'],['short','Shortest'],['long','Longest'],['easy','Easiest'],['hard','Hardest'],['win','Easiest to pass'],['lang','Language'],['mine','Your most recent']])+
    '<button class="btn" data-a="addsc">Add a scenario</button></div>';
  var narrowed=sf.diff!=='any'||sf.len!=='any'||sf.rate!=='any';
  var anyFilter=narrowed||sf.lang!=='any';
  h+='<p class="note count"><b>'+list.length+'</b> scenario'+(list.length===1?'':'s')+' \u00b7 official beaten: '+beat+' of '+offIds.length+
    (narrowed&&sf.src!=='valkyrie'&&sf.src!=='yours'?' \u00b7 difficulty, length and rating are only known for Valkyrie scenarios, so official ones drop out with those filters':'')+
    (sf.lang!=='any'&&sf.src!=='valkyrie'&&sf.src!=='yours'?' \u00b7 the language filter applies to Valkyrie scenarios; official ones are in the app\u2019s own languages':'')+
    (anyFilter||sf.src!=='all'||f!=='all'||sq?' \u00b7 <a href="#" data-a="sfclear">Clear filters</a>':'')+'</p>';
  if(!list.length)return h+'<p class="note">Nothing matches. Loosen a filter, or use <b>Add a scenario</b> if one is missing.</p>';
  var row=function(s){
    var x=st[s.id],chip=!x?'<span class="chip muted">Not played</span>':x.pass?'<span class="chip ok">Beaten</span>':'<span class="chip bad">Not beaten yet</span>';
    var src=s.from==='official'?esc(MOM.productName(s.product)||'Official'):s.from==='valkyrie'?'':'Your own';  // the box already says Valkyrie
    var facts=[src,s.author?'by '+esc(s.author):'',s.difficulty?diffName(s.difficulty):'',
      s.avg&&s.plays>=10?'usually '+esc(lenText([s.avg,s.avg])):s.minutes?esc(lenText(s.minutes)):'',langText(s)].filter(Boolean).join(' \u00b7 ');
    var comm=s.plays>=10&&s.rating?'<span class="rating" title="Valkyrie players\u2019 average score, 1 to 10">\u2605 '+s.rating.toFixed(1)+'</span> '+
      (s.win!=null?Math.round(s.win*100)+'% pass':'')+' \u00b7 '+s.plays.toLocaleString()+' plays on Valkyrie':'';
    var yours=x?'You: '+x.n+' play'+(x.n===1?'':'s')+', '+x.pass+' passed'+(x.last?', last '+esc(fmtDate(x.last)):''):'';
    var rv=reviewsOf(s);
    return '<li class="sc"><div class="grow"><span class="row tight"><b>'+(x?'<a href="#" data-a="scplays" data-id="'+esc(s.id)+'">'+esc(s.name)+'</a>':esc(s.name))+'</b>'+chip+'</span>'+
      '<span class="note">'+facts+'</span>'+(comm?'<span class="note community">'+comm+'</span>':'')+(yours?'<span class="note">'+yours+'</span>':'')+
      (s.link&&/^https:\/\//.test(s.link)?'<span class="note"><a href="'+esc(s.link)+'" target="_blank" rel="noopener">Details</a></span>':'')+
      (rv.length?'<details class="reviews"><summary>'+rv.length+' review'+(rv.length===1?'':'s')+'</summary>'+rv.map(function(r){return '<p><span>'+esc(r.summary)+'</span> <a href="'+esc(r.url)+'" target="_blank" rel="noopener">'+esc(r.source)+'</a>'+(r.date?' <span class="note">('+esc(r.date)+')</span>':'')+'</p>';}).join('')+'</details>':'')+'</div>'+
      '<div class="row tight">'+(x?'<button class="btn sm again" data-a="again" data-sc="'+esc(s.id)+'" title="Same players, investigators, rules and place as last time">'+ICON_AGAIN+'Play again</button>':'<button class="btn sm" data-a="log" data-sc="'+esc(s.id)+'">Log a play</button>')+
      (s.mine&&!x?'<button class="btn sm ghost" data-a="delsc" data-id="'+esc(s.id)+'" aria-label="Remove '+esc(s.name)+'">Remove</button>':'')+'</div></li>';
  };
  var ul=function(items){return '<ul class="scs">'+items.map(row).join('')+'</ul>';};
  var sub=function(title,items){return items.length?'<h3 class="subhead">'+esc(title)+' <span class="note">'+items.length+'</span></h3>'+ul(items):'';};
  var box=function(key,title,items,body,note){
    if(!items.length)return '';
    return '<details class="sec box" data-box="'+key+'"'+(boxes[key]?' open':'')+'><summary><h2>'+esc(title)+'</h2><span class="note">'+items.length+' scenario'+(items.length===1?'':'s')+(note?' \u00b7 '+note:'')+'</span><span class="chev" aria-hidden="true"></span></summary>'+body+'</details>';
  };
  var sorted=function(items){return items.slice().sort(SORT[sf.sort]||byName);};
  // inside a box: grouped by box (official) or by language, or one sorted list
  var byLang=function(items){var g={};items.forEach(function(s){var k=s.lang||'Not stated';(g[k]=g[k]||[]).push(s);});
    return Object.keys(g).sort(function(a,b){return a==='Not stated'?1:b==='Not stated'?-1:g[b].length-g[a].length||a.localeCompare(b);}).map(function(k){return sub(k,g[k].sort(byName));}).join('');};
  var off=list.filter(function(s){return s.from==='official';}),val=list.filter(function(s){return s.from==='valkyrie';}),yo=list.filter(function(s){return s.from==='yours';});
  var offBody=sf.sort==='box'?MOM.PRODUCTS.map(function(p){return sub(p.name,off.filter(function(s){return s.product===p.id;}).sort(byName));}).join('')+sub('Other',off.filter(function(s){return !s.product;}).sort(byName)):ul(sorted(off));
  var valBody=sf.sort==='lang'?byLang(val):ul(sf.sort==='box'?val.slice().sort(byName):sorted(val));
  h+=box('official','Official',off,offBody,'beaten '+beat+' of '+offIds.length);
  h+=box('valkyrie','Valkyrie',val,valBody,'ratings from Valkyrie players');
  h+=box('yours','Your own',yo,sf.sort==='lang'?byLang(yo):ul(sorted(yo)));
  return h;
}

// Languages in the filter, most scenarios first, with counts.
function langChoices(){var c={};MOM.VALKYRIE.forEach(function(s){if(s.retired)return;langsOf(s).forEach(function(l){c[l]=(c[l]||0)+1;});});
  return Object.keys(c).sort(function(a,b){return c[b]-c[a]||a.localeCompare(b);}).map(function(l){return [l,l+' ('+c[l]+')'];});}
// "Spanish", or "Spanish · also in English, French +2"
function langText(s){if(s.from!=='valkyrie'&&s.type!=='valkyrie'||!s.lang)return '';var o=langsOf(s).filter(function(l){return l!==s.lang;});
  return esc(s.lang)+(o.length?' (also '+esc(o.slice(0,2).join(', '))+(o.length>2?' +'+(o.length-2):'')+')':'');}
// Valkyrie's difficulty slider runs from 0 to 1.
function diffName(d){return d<0.35?'Easy':d<0.6?'Medium':d<0.8?'Hard':'Very hard';}
function lenText(m){var f=function(x){return x<120?x+' min':(Math.round(x/30)/2)+' h';};return m[0]&&m[0]!==m[1]?f(m[0]).replace(/ (min|h)$/,(m[1]<120)===(m[0]<120)?'':' $1')+'\u2013'+f(m[1]):f(m[1]);}
function statsHtml(){
  if(!plays.length)return '<section class="sec empty"><h2>No stats yet</h2><p class="note">They fill in as you log plays.</p></section>';
  var n=plays.length,pass=plays.filter(function(p){return p.result==='pass';}).length,fail=plays.filter(function(p){return p.result==='fail';}).length;
  var st=scenStats(),beaten=Object.keys(st).filter(function(k){return st[k].pass;}).length;
  var tile=function(k,v,s){return '<div class="stat"><span class="lbl">'+k+'</span><b class="num">'+v+'</b>'+(s?'<small>'+s+'</small>':'')+'</div>';};
  var h='<div class="stats">'+tile('Plays',n)+tile('Passed',pass,pct(pass,n))+tile('Failed',fail,pct(fail,n))+tile('Scenarios played',Object.keys(st).length,beaten+' beaten')+'</div>';
  var table=function(title,rows,col){
    if(!rows.length)return '';var max=Math.max.apply(null,rows.map(function(r){return r.n;}));
    return '<section class="sec"><h2>'+esc(title)+'</h2><table class="tbl"><thead><tr><th>'+esc(col)+'</th><th class="r">Plays</th><th class="r">Passed</th><th class="w">Win rate</th></tr></thead><tbody>'+
      rows.map(function(r){return '<tr><td>'+esc(r.k)+'</td><td class="r num">'+r.n+'</td><td class="r num">'+r.pass+'</td><td class="w"><span class="barwrap"><span class="track"><span class="meter" style="width:'+Math.max(4,Math.round(r.n*100/max))+'%"><span class="meterin" style="width:'+(r.n?Math.round(r.pass*100/r.n):0)+'%"></span></span></span><span class="num">'+pct(r.pass,r.n)+'</span></span></td></tr>';}).join('')+'</tbody></table></section>';
  };
  var tally=function(keyFn){var c={};plays.forEach(function(p){keyFn(p).forEach(function(k){if(!k)return;var r=c[k]||(c[k]={k:k,n:0,pass:0});r.n++;if(p.result==='pass')r.pass++;});});
    return Object.keys(c).map(function(k){return c[k];}).sort(function(a,b){return b.n-a.n||b.pass-a.pass||a.k.localeCompare(b.k);});};
  var uniq=function(a){return a.filter(function(x,i){return x&&a.indexOf(x)===i;});};
  var sizes=tally(function(p){var n2=(p.party||[]).length;return n2?[n2===1?'Solo':n2+' investigators']:[];});
  h+=table('Who you played with',tally(function(p){return uniq((p.party||[]).map(function(s){return (s.player||'').trim();}));}),'Player');
  h+=table('Investigators',tally(function(p){return uniq((p.party||[]).map(function(s){return (s.investigator||'').trim();}));}),'Investigator');
  h+=table('Scenarios',tally(function(p){return [p.scenarioName];}),'Scenario');
  h+=table('Party size',sizes,'Party');
  if(plays.some(function(p){return p.location;}))h+=table('Where you played',tally(function(p){return [p.location||'Not recorded'];}),'Where');
  h+=table('Rules',tally(function(p){return [p.rules||'Not recorded'];}),'Rules');
  h+=table('Scenario type',tally(function(p){return [typeName(p.scenarioType||'official')];}),'Type');
  if(!names('player').length)h+='<p class="note">Add who played to your plays to see stats per person.</p>';
  return h;
}

function settingsHtml(){
  var own=owned(),imp=ui.imp;
  var h='';
  h+='<section class="sec"><h2>Products you own</h2><p class="note">The Scenarios tab and the scenario picker list what\u2019s ticked here.</p><div class="checks">'+
    MOM.PRODUCTS.map(function(p){return '<label class="check"><input type="checkbox" data-own="'+p.id+'"'+(own.indexOf(p.id)>=0?' checked':'')+'><span>'+esc(p.name)+' <small class="note">'+p.scenarios.length+'</small></span></label>';}).join('')+
    '<label class="check"><input type="checkbox" id="s-valk"'+(showValk()?' checked':'')+'><span>Valkyrie fan scenarios <small class="note">'+MOM.VALKYRIE.length+'</small></span></label></div></section>';
  h+='<section class="sec" id="import"><h2>Import from a spreadsheet</h2>'+
    '<p class="note">Paste the link to a Google Sheet shared as “Anyone with the link”, or choose a CSV file. The first row needs headings such as <i>Scenario, Played, Characters, Pass/Fail, Notes, Rules</i> (also <i>Date</i> and <i>Players</i> if you have them). Rows marked N under Played are skipped, and rows you’ve already imported are never added twice.</p>'+
    '<form class="row bottom" data-form="sheet"><label class="field grow"><span class="lbl">Google Sheets link</span><input class="f" id="imp-link" type="url" placeholder="https://docs.google.com/spreadsheets/d/…" value="'+esc(ui.impLink||'')+'"></label><button class="btn" type="submit"'+(ui.busy?' disabled':'')+'>Load sheet</button></form>'+
    '<div class="row"><label class="btn file">Choose a CSV file<input type="file" id="imp-file" accept=".csv,text/csv" hidden></label></div>';
  if(imp){
    if(imp.error)h+='<p class="err" role="alert">'+esc(imp.error)+'</p>';
    else{
      var fresh=imp.plays.filter(function(p){return !p.dupe;});
      h+='<div class="preview"><p><b>'+fresh.length+' play'+(fresh.length===1?'':'s')+' to import</b>'+(imp.plays.length-fresh.length?', '+(imp.plays.length-fresh.length)+' already in your log':'')+(imp.skipped?', '+imp.skipped+' not-played row'+(imp.skipped===1?'':'s')+' skipped':'')+(imp.scenarios.length?', '+imp.scenarios.length+' new scenario'+(imp.scenarios.length===1?'':'s')+' added to your list':'')+'.</p>'+
        imp.notes.map(function(n){return '<p class="note">'+esc(n)+'</p>';}).join('')+
        (fresh.length?'<ul class="mini">'+fresh.map(function(p){return '<li>'+resChip(p.result)+' <b>'+esc(p.scenarioName)+'</b>'+(p.attempts>1?' ('+p.attempts+' tries)':'')+(partyText(p)?' · '+partyText(p):'')+'</li>';}).join('')+'</ul>':'')+
        (fresh.length&&imp.cols.players==null&&imp.cols.party==null?'<p class="note">The sheet doesn’t say who played, so players are left blank. Tap a play afterwards to add them.</p>':'')+
        '<div class="row">'+(fresh.length||imp.scenarios.length?'<button class="btn pri" data-a="doimport"'+(ui.busy?' disabled':'')+'>Import '+fresh.length+' play'+(fresh.length===1?'':'s')+'</button>':'')+'<button class="btn" data-a="cancelimport">Cancel</button></div></div>';
    }
  }
  h+='</section>';
  h+='<section class="sec"><h2>Export</h2><p class="note">A copy of all your plays. The CSV opens in any spreadsheet and can be imported back here.</p><div class="row"><button class="btn" data-a="csv">Download CSV</button><button class="btn" data-a="json">Download backup (JSON)</button></div></section>';
  h+='<section class="sec danger"><h2>Delete</h2><div class="row"><button class="btn" data-a="wipe"'+(plays.length?'':' disabled')+'>Delete all plays…</button><button class="btn dng" data-a="delacct">Delete my account…</button></div></section>';
  return h;
}

// ---------- players and groups ----------
// Regular players are just names (they don't need accounts): users/{uid}/people {name, notes}. Groups are named sets of
// them, users/{uid}/groups {name, members:[person ids]}, picked when logging a play to fill in the seats.
function lc(x){return String(x||'').trim().toLowerCase();}
function byName(a,b){return a.name.localeCompare(b.name,undefined,{sensitivity:'base',ignorePunctuation:true,numeric:true});}
function personByName(n){n=lc(n);return people.filter(function(p){return lc(p.name)===n;})[0];}
function groupMembers(g){return (g.members||[]).map(function(id){return people.filter(function(p){return p.id===id;})[0];}).filter(Boolean);}
function personStats(name){
  var n=0,pass=0,last='',inv={},k=lc(name);
  plays.forEach(function(p){var seat=(p.party||[]).filter(function(s){return lc(s.player)===k;})[0];if(!seat)return;
    n++;if(p.result==='pass')pass++;if((p.date||'')>last)last=p.date;if(seat.investigator)inv[seat.investigator]=(inv[seat.investigator]||0)+1;});
  var fav=Object.keys(inv).sort(function(a,b){return inv[b]-inv[a];})[0];
  return {n:n,pass:pass,last:last,fav:fav,favN:fav?inv[fav]:0};
}
function playsWith(name){var k=lc(name);return plays.filter(function(p){return (p.party||[]).some(function(s){return lc(s.player)===k;});});}
function playersHtml(){
  var h='<div class="filters"><button class="btn pri" data-a="newperson">Add a player</button><button class="btn" data-a="newgroup"'+(people.length?'':' disabled title="Add players first"')+'>New group</button></div>';
  // groups
  var gl=groups.slice().sort(byName);
  h+='<section class="sec"><div class="sec-head"><h2>Groups</h2><span class="note">Pick a group when logging a play to fill in the seats.</span></div>'+
    (gl.length?'<ul class="scs">'+gl.map(function(g){var m=groupMembers(g);return '<li><div class="grow"><b>'+esc(g.name)+'</b><span class="row tight chips">'+
      (m.length?m.map(function(x){return '<span class="chip tag">'+esc(x.name)+'</span>';}).join(''):'<span class="note">No players</span>')+'</span></div>'+
      '<div class="row tight"><button class="btn sm" data-a="editgroup" data-id="'+esc(g.id)+'">Edit</button><button class="btn sm ghost" data-a="delgroup" data-id="'+esc(g.id)+'">Delete</button></div></li>';}).join('')+'</ul>'
      :'<p class="note">No groups yet. Make one for the people you usually play with together, such as \u201cThursday group\u201d. Someone can be in more than one.</p>')+'</section>';
  // players
  var pl=people.slice().sort(byName);
  h+='<section class="sec"><div class="sec-head"><h2>Players</h2><span class="note">'+pl.length+' saved</span></div>'+
    (pl.length?'<ul class="scs">'+pl.map(function(x){var st=personStats(x.name),ing=groups.filter(function(g){return (g.members||[]).indexOf(x.id)>=0;}).sort(byName);
      var line=st.n?st.n+' play'+(st.n===1?'':'s')+' \u00b7 '+pct(st.pass,st.n)+' passed'+(st.last?' \u00b7 last '+esc(fmtDate(st.last)):'')+(st.fav?' \u00b7 usually '+esc(st.fav):''):'No plays yet';
      return '<li>'+avatarHtml(x.name,'','')+'<div class="grow"><b>'+(st.n?'<a href="#" data-a="playerplays" data-n="'+esc(x.name)+'">'+esc(x.name)+'</a>':esc(x.name))+'</b>'+
        '<span class="note">'+line+'</span>'+(x.notes?'<span class="note pnote">'+esc(x.notes)+'</span>':'')+
        (ing.length?'<span class="row tight chips">'+ing.map(function(g){return '<span class="chip muted">'+esc(g.name)+'</span>';}).join('')+'</span>':'')+'</div>'+
        '<div class="row tight"><button class="btn sm" data-a="editperson" data-id="'+esc(x.id)+'">Edit</button><button class="btn sm ghost" data-a="delperson" data-id="'+esc(x.id)+'">Delete</button></div></li>';}).join('')+'</ul>'
      :'<p class="note">Add the people you play with. They don\u2019t need accounts; it\u2019s just their names, for picking quickly when you log a play and for stats per person.</p>')+'</section>';
  // names typed into plays but not saved
  var loose=names('player').filter(function(n){return !personByName(n);});
  if(loose.length)h+='<section class="sec"><div class="sec-head"><h2>In your plays, not saved yet</h2><button class="btn sm" data-a="addloose">Add all '+loose.length+'</button></div><ul class="scs">'+
    loose.map(function(n){var st=personStats(n);return '<li>'+avatarHtml(n,'','')+'<div class="grow"><b>'+esc(n)+'</b><span class="note">'+st.n+' play'+(st.n===1?'':'s')+'</span></div><button class="btn sm" data-a="addname" data-n="'+esc(n)+'">Add</button></li>';}).join('')+'</ul></section>';
  return h;
}
function newId(){return fb.db.collection('users/'+me.uid+'/people').doc().id;}
function savePerson(name,notes){var id=newId();return fb.db.doc('users/'+me.uid+'/people/'+id).set({name:name,notes:notes||'',created:Date.now()}).then(function(){return id;});}
function personDialog(x){
  var editing=!!x;x=x||{};var used=editing?playsWith(x.name).length:0;
  var d=openDialog('<form class="stack"><div class="dlg-head"><h2>'+(editing?'Edit player':'Add a player')+'</h2><button class="x" type="button" data-close aria-label="Close">\u00d7</button></div>'+
    '<label class="field"><span class="lbl">Name</span><input class="f" name="pname" maxlength="40" required value="'+esc(x.name||'')+'" autocomplete="off"></label>'+
    '<label class="field"><span class="lbl">Notes (optional)</span><textarea class="f" name="pnotes" rows="3" maxlength="500" placeholder="Favourite investigators, house rules they like\u2026">'+esc(x.notes||'')+'</textarea></label>'+
    (used?'<label class="check renm" hidden><input type="checkbox" name="renplays" checked><span>Also rename them in '+used+' past play'+(used===1?'':'s')+'</span></label>':'')+
    (editing?'':'<div class="field"><span class="lbl">Groups (optional)</span><div class="checks">'+(groups.length?groups.slice().sort(byName).map(function(g){return '<label class="check"><input type="checkbox" name="pg" value="'+esc(g.id)+'"><span>'+esc(g.name)+'</span></label>';}).join(''):'<span class="note">No groups yet.</span>')+'</div></div>')+
    '<p class="err" role="alert" hidden></p><div class="row end"><button class="btn" type="button" data-close>Cancel</button><button class="btn pri" type="submit">'+(editing?'Save':'Add')+'</button></div></form>',editing?'Edit player':'Add a player');
  var f=d.querySelector('form'),err=f.querySelector('.err'),ren=f.querySelector('.renm');
  if(ren)f.pname.addEventListener('input',function(){ren.hidden=lc(f.pname.value)===lc(x.name)&&f.pname.value.trim()===x.name;});
  f.addEventListener('submit',async function(e){
    e.preventDefault();var name=f.pname.value.trim().replace(/\s+/g,' '),notes=f.pnotes.value.trim();
    var clash=personByName(name);if(clash&&clash.id!==x.id){err.textContent='You already have a player called \u201c'+clash.name+'\u201d.';err.hidden=false;return;}
    var btn=f.querySelector('[type=submit]');btn.disabled=true;
    try{
      if(editing){
        await fb.db.doc('users/'+me.uid+'/people/'+x.id).set({name:name,notes:notes,updated:Date.now()},{merge:true});
        if(ren&&!ren.hidden&&f.renplays.checked&&name!==x.name){
          var k=lc(x.name),list=playsWith(x.name);
          for(var i=0;i<list.length;i+=400){var b=fb.db.batch();list.slice(i,i+400).forEach(function(p){
            b.update(fb.db.doc('users/'+me.uid+'/plays/'+p.id),{party:p.party.map(function(s){return lc(s.player)===k?{player:name,investigator:s.investigator||''}:s;}),updated:Date.now()});});await b.commit();}
        }
      }else{
        var id=await savePerson(name,notes);
        var pick=[].slice.call(f.querySelectorAll('input[name=pg]:checked')).map(function(c){return c.value;});
        for(var j=0;j<pick.length;j++){var g=groups.filter(function(y){return y.id===pick[j];})[0];if(g)await fb.db.doc('users/'+me.uid+'/groups/'+g.id).set({members:(g.members||[]).concat([id]),updated:Date.now()},{merge:true});}
      }
      d.close();toast(editing?'Saved.':'Added '+name+'.');
    }catch(e2){btn.disabled=false;err.textContent=friendly(e2);err.hidden=false;}
  });
}
function groupDialog(g){
  var editing=!!g;g=g||{members:[]};
  var d=openDialog('<form class="stack"><div class="dlg-head"><h2>'+(editing?'Edit group':'New group')+'</h2><button class="x" type="button" data-close aria-label="Close">\u00d7</button></div>'+
    '<label class="field"><span class="lbl">Group name</span><input class="f" name="gname" maxlength="40" required value="'+esc(g.name||'')+'" placeholder="e.g. Thursday group" autocomplete="off"></label>'+
    '<div class="field"><span class="lbl">Who\u2019s in it</span><div class="checks">'+people.slice().sort(byName).map(function(x){return '<label class="check"><input type="checkbox" name="gm" value="'+esc(x.id)+'"'+((g.members||[]).indexOf(x.id)>=0?' checked':'')+'><span>'+esc(x.name)+'</span></label>';}).join('')+'</div></div>'+
    '<label class="field"><span class="lbl">Add someone new (optional)</span><input class="f" name="gnew" maxlength="200" placeholder="Names, separated by commas" autocomplete="off"></label>'+
    '<p class="err" role="alert" hidden></p><div class="row end"><button class="btn" type="button" data-close>Cancel</button><button class="btn pri" type="submit">'+(editing?'Save':'Make group')+'</button></div></form>',editing?'Edit group':'New group');
  var f=d.querySelector('form'),err=f.querySelector('.err');
  f.addEventListener('submit',async function(e){
    e.preventDefault();var name=f.gname.value.trim().replace(/\s+/g,' ');
    if(groups.some(function(y){return y.id!==g.id&&lc(y.name)===lc(name);})){err.textContent='You already have a group with that name.';err.hidden=false;return;}
    var ids=[].slice.call(f.querySelectorAll('input[name=gm]:checked')).map(function(c){return c.value;});
    var extra=f.gnew.value.split(',').map(function(n){return n.trim().replace(/\s+/g,' ').slice(0,40);}).filter(Boolean);
    if(!ids.length&&!extra.length){err.textContent='Tick at least one player, or add someone new.';err.hidden=false;return;}
    var btn=f.querySelector('[type=submit]');btn.disabled=true;
    try{
      for(var i=0;i<extra.length;i++){var ex=personByName(extra[i]);var id=ex?ex.id:await savePerson(extra[i],'');if(ids.indexOf(id)<0)ids.push(id);}
      var ref=editing?fb.db.doc('users/'+me.uid+'/groups/'+g.id):fb.db.collection('users/'+me.uid+'/groups').doc();
      await ref.set(editing?{name:name,members:ids.slice(0,30),updated:Date.now()}:{name:name,members:ids.slice(0,30),created:Date.now()},{merge:true});
      d.close();toast(editing?'Saved.':'Group made.');
    }catch(e2){btn.disabled=false;err.textContent=friendly(e2);err.hidden=false;}
  });
}

// ---------- Your account (from the account menu, like the Arkham site) ----------
function accountBody(){
  var hasPic=profile&&picOk(profile.photo),g=googlePic(me);
  return '<div class="dlg-head"><h2>Your account</h2><button class="x" type="button" data-close aria-label="Close">\u00d7</button></div>'+
    '<div class="row picrow">'+avatarHtml(myName()||me.email,profile&&profile.photo,g,'xl')+'<div class="stack tight"><span class="lbl">Profile picture</span><div class="row">'+
    '<button class="btn" type="button" data-ac="pic">'+(hasPic||g?'Change picture':'Choose a picture')+'</button>'+(hasPic?'<button class="btn ghost" type="button" data-ac="picrm">Remove</button>':'')+'</div>'+
    '<span class="note">'+(hasPic?'Shown on your account button.':g?'Using your Google photo until you choose one.':'Until you choose one, your initial is shown.')+'</span></div></div>'+
    '<form class="row bottom" data-ac-form><label class="field grow"><span class="lbl">Your name</span><input class="f" name="aname" maxlength="40" value="'+esc(myName())+'"></label><button class="btn" type="submit">Save</button></form>'+
    '<p class="note">Your name is filled in as the first player when you log a play. Signed in as '+esc(me.email||me.displayName||'')+'.</p>'+
    '<div class="row end"><button class="btn" type="button" data-close>Done</button></div>';
}
function openAccount(){
  if(!me)return;
  var d=openDialog(accountBody(),'Your account'),box=d.querySelector('.dlg');
  var redraw=function(){if(document.body.contains(d))box.innerHTML=accountBody();};
  box.addEventListener('click',function(e){
    var b=e.target.closest('[data-ac]');if(!b)return;
    if(b.dataset.ac==='pic')choosePicture().then(function(data){if(!data)return;return fb.db.doc('users/'+me.uid).set({photo:data},{merge:true}).then(function(){profile.photo=data;redraw();toast('Picture saved.');});}).catch(function(err){toast(friendly(err));});
    else if(b.dataset.ac==='picrm')fb.db.doc('users/'+me.uid).set({photo:''},{merge:true}).then(function(){profile.photo='';redraw();toast('Picture removed.');}).catch(function(err){toast(friendly(err));});
  });
  box.addEventListener('submit',function(e){
    e.preventDefault();var n=box.querySelector('[name=aname]').value.trim().replace(/\s+/g,' ').slice(0,40);
    fb.db.doc('users/'+me.uid).set({name:n},{merge:true}).then(function(){toast('Saved.');}).catch(function(err){toast(friendly(err));});
  });
}
window.addEventListener('acct-account',openAccount);

// ---------- investigators: official names only ----------
// The dropdown on each seat: the 40 official investigators grouped by box, or Unknown.
function invSelect(val){
  var odd=val&&!MOM.isInvestigator(val);
  return '<select class="f" name="pi" aria-label="Investigator"><option value="">Investigator\u2026</option>'+
    MOM.INVESTIGATOR_GROUPS.map(function(g){return '<optgroup label="'+esc(g.name)+'">'+g.list.map(function(n){return '<option'+(n===val?' selected':'')+'>'+esc(n)+'</option>';}).join('')+'</optgroup>';}).join('')+
    (odd?'<option value="" selected disabled>'+esc(val)+' (not official)</option>':'')+'</select>';
}
// Names in saved plays that aren't official investigators: in the investigator slot, or an investigator's full name typed
// in the player slot. Grouped by the text, with the official name it most likely means.
function investigatorProblems(){
  var by={};
  plays.forEach(function(p){(p.party||[]).forEach(function(s){
    var inv=s.investigator||'',pl=(s.player||'').trim();
    if(inv&&!MOM.isInvestigator(inv)){var k='i|'+inv;(by[k]=by[k]||{kind:'inv',text:inv,ids:{},guess:MOM.matchInvestigator(inv)}).ids[p.id]=1;}
    else if(!inv&&pl){var m=MOM.INVESTIGATORS.filter(function(n){return lc(n.replace(/"/g,''))===lc(pl.replace(/"/g,''));})[0];
      if(m){var k2='p|'+pl;(by[k2]=by[k2]||{kind:'player',text:pl,ids:{},guess:m}).ids[p.id]=1;}}
  });});
  return Object.keys(by).map(function(k){var x=by[k];x.n=Object.keys(x.ids).length;return x;}).sort(function(a,b){return a.text.localeCompare(b.text);});
}
function fixInvestigators(){
  var probs=investigatorProblems();if(!probs.length){toast('Every investigator is already an official one.');return;}
  var nPlays=Object.keys(probs.reduce(function(o,x){Object.keys(x.ids).forEach(function(id){o[id]=1;});return o;},{})).length;
  var opts=function(sel){return MOM.INVESTIGATOR_GROUPS.map(function(g){return '<optgroup label="'+esc(g.name)+'">'+g.list.map(function(n){return '<option'+(n===sel?' selected':'')+'>'+esc(n)+'</option>';}).join('')+'</optgroup>';}).join('');};
  var d=openDialog('<form class="stack"><div class="dlg-head"><h2>Fix investigator names</h2><button class="x" type="button" data-close aria-label="Close">\u00d7</button></div>'+
    '<p class="note">Only official investigators can be saved. Each name below is matched to the one it most likely means; change any that are wrong.</p>'+
    '<ul class="fixes">'+probs.map(function(x,i){return '<li><div><b>'+esc(x.text)+'</b><span class="note"> '+(x.kind==='player'?'typed as a player':'as investigator')+' in '+x.n+' play'+(x.n===1?'':'s')+'</span></div>'+
      '<select class="f" name="fix'+i+'">'+(x.kind==='player'?'<option value="__keep">It\u2019s a person; leave it</option>':'<option value="">Unknown (leave blank)</option>')+opts(x.guess)+'</select></li>';}).join('')+'</ul>'+
    '<p class="err" role="alert" hidden></p><div class="row end"><button class="btn" type="button" data-close>Cancel</button><button class="btn pri" type="submit">Fix '+nPlays+' play'+(nPlays===1?'':'s')+'</button></div></form>','Fix investigator names');
  var f=d.querySelector('form');
  f.addEventListener('submit',async function(e){
    e.preventDefault();var btn=f.querySelector('[type=submit]');btn.disabled=true;
    var invMap={},plMap={};
    probs.forEach(function(x,i){var v=f['fix'+i].value;if(x.kind==='inv')invMap[x.text]=v;else if(v!=='__keep')plMap[x.text]=v;});
    var todo=plays.filter(function(p){return (p.party||[]).some(function(s){return (s.investigator&&invMap[s.investigator]!=null)||(!s.investigator&&plMap[(s.player||'').trim()]);});});
    try{
      for(var i=0;i<todo.length;i+=400){var b=fb.db.batch();todo.slice(i,i+400).forEach(function(p){
        var party=p.party.map(function(s){
          if(s.investigator&&invMap[s.investigator]!=null)return {player:s.player||'',investigator:invMap[s.investigator]};
          var pl=(s.player||'').trim();if(!s.investigator&&plMap[pl])return {player:'',investigator:plMap[pl]};
          return {player:s.player||'',investigator:s.investigator||''};});
        b.update(fb.db.doc('users/'+me.uid+'/plays/'+p.id),{party:party,updated:Date.now()});});await b.commit();}
      d.close();toast('Fixed '+todo.length+' play'+(todo.length===1?'':'s')+'.');
    }catch(err){btn.disabled=false;var el=f.querySelector('.err');el.textContent=friendly(err);el.hidden=false;}
  });
}

// ---------- the play form ----------
function playForm(p,preset){
  var editing=!!(p&&p.id);p=p||{};
  var last=plays.slice().sort(function(a,b){return (b.created||0)-(a.created||0);})[0];
  var scId=p.scenarioId||preset||'';
  var party=(p.party&&p.party.length?p.party:[{player:myName(),investigator:''}]);
  var opts='<option value="">Choose a scenario…</option>';
  var own=owned(),st=scenStats();
  MOM.PRODUCTS.forEach(function(pr){var l=MOM.OFFICIAL.filter(function(s){return s.product===pr.id&&(own.indexOf(pr.id)>=0||s.id===scId);});
    if(l.length)opts+='<optgroup label="'+esc(pr.name)+'">'+l.map(function(s){return '<option value="'+esc(s.id)+'"'+(s.id===scId?' selected':'')+'>'+esc(s.name)+(st[s.id]?'':' • new')+'</option>';}).join('')+'</optgroup>';});
  var offK={};MOM.OFFICIAL.forEach(function(s){offK[MOM.key(s.name)]=1;});
  var ex=allScenarios().filter(function(s){return s.type!=='official'&&!offK[MOM.key(s.name)];});
  [['valkyrie','Valkyrie'],['custom','Other']].forEach(function(g){var l=ex.filter(function(s){return (s.type==='valkyrie')===(g[0]==='valkyrie');});
    if(l.length)opts+='<optgroup label="'+g[1]+'">'+l.map(function(s){return '<option value="'+esc(s.id)+'"'+(s.id===scId?' selected':'')+'>'+esc(s.name)+'</option>';}).join('')+'</optgroup>';});
  if(scId&&!scenById(scId)&&p.scenarioName)opts+='<option value="'+esc(scId)+'" selected>'+esc(p.scenarioName)+'</option>';
  opts+='<option value="__new">+ Add a scenario not listed…</option>';
  var seat=function(s){return '<div class="seat"><input class="f" name="pp" list="dl-pl" placeholder="Player" maxlength="40" value="'+esc(s.player||'')+'" aria-label="Player">'+
    invSelect(s.investigator||'')+
    '<button class="x" type="button" data-f="rmseat" aria-label="Remove this seat">×</button></div>';};
  var ppl=people.map(function(x){return x.name;}).sort();names('player').forEach(function(n){if(!personByName(n)&&ppl.indexOf(n)<0)ppl.push(n);});if(myName()&&!ppl.some(function(n){return lc(n)===lc(myName());}))ppl.unshift(myName());
  var res=p.result||'';
  return '<form class="stack" data-form="play"'+(editing?' data-id="'+esc(p.id)+'"':'')+'>'+
    '<div class="dlg-head"><h2>'+(editing?'Edit play':p._again?'Play again':'Log a play')+'</h2><button class="x" type="button" data-close aria-label="Close">×</button></div>'+
    '<label class="field"><span class="lbl">Scenario</span><select class="f" name="sc" required>'+opts+'</select></label>'+
    '<div class="newsc" hidden><div class="grid2"><label class="field"><span class="lbl">Scenario name</span><input class="f" name="nsname" maxlength="80"></label>'+
    '<label class="field"><span class="lbl">Kind</span><select class="f" name="nstype"><option value="valkyrie">Valkyrie</option><option value="custom">Other / homemade</option></select></label></div></div>'+
    '<div class="grid2"><label class="field"><span class="lbl">Date</span><input class="f" type="date" name="date" value="'+esc(editing?p.date||'':today())+'" max="'+today()+'"></label>'+
    '<label class="field"><span class="lbl">Attempt</span><input class="f num" type="number" name="att" min="1" max="99" value="'+(p.attempts||1)+'" aria-describedby="att-h"><small class="note" id="att-h">Which try this was</small></label></div>'+
    '<fieldset class="field"><legend class="lbl">Result</legend><div class="seg big" role="radiogroup">'+[['pass','Passed'],['fail','Failed'],['abandoned','Abandoned']].map(function(r){return '<label class="'+r[0]+'"><input type="radio" name="res" value="'+r[0]+'"'+(res===r[0]?' checked':'')+' required><span>'+r[1]+'</span></label>';}).join('')+'</div></fieldset>'+
    '<fieldset class="field"><legend class="lbl">Who played</legend>'+
    (groups.length?'<select class="f grp" name="grp" aria-label="Fill in from a group"><option value="">Fill in from a group\u2026</option>'+groups.slice().sort(byName).map(function(g){return '<option value="'+esc(g.id)+'">'+esc(g.name)+' ('+groupMembers(g).length+')</option>';}).join('')+'</select>':'')+
    '<div class="seats">'+party.map(seat).join('')+'</div><div class="row"><button class="btn sm" type="button" data-f="addseat">+ Add a player</button></div></fieldset>'+
    '<label class="field"><span class="lbl">Where (optional)</span><input class="f" name="loc" list="dl-loc" maxlength="60" placeholder="e.g. Gerri\u2019s house" value="'+esc(editing||p.location!=null?p.location||'':(last&&last.location)||'')+'" autocomplete="off"></label>'+
    '<datalist id="dl-loc">'+places().map(function(n){return '<option value="'+esc(n)+'">';}).join('')+'</datalist>'+
    '<label class="field"><span class="lbl">Rules</span><input class="f" name="rules" list="dl-rules" maxlength="80" value="'+esc(editing||p.rules!=null?p.rules||'':(last&&last.rules)||'Normal rules')+'"></label>'+
    '<label class="field"><span class="lbl">Notes</span><textarea class="f" name="notes" rows="4" maxlength="4000" placeholder="What happened? Anything to remember next time?">'+esc(p.notes||'')+'</textarea></label>'+
    '<datalist id="dl-pl">'+ppl.map(function(n){return '<option value="'+esc(n)+'">';}).join('')+'</datalist>'+
    '<datalist id="dl-rules">'+rulesUsed().map(function(n){return '<option value="'+esc(n)+'">';}).join('')+'</datalist>'+
    '<p class="err" role="alert" hidden></p>'+
    '<div class="row end">'+(editing?'<button class="btn dng ghost" type="button" data-f="del" style="margin-right:auto">Delete</button>':'')+'<button class="btn" type="button" data-close>Cancel</button><button class="btn pri" type="submit">'+(editing?'Save':'Log play')+'</button></div></form>';
}
// A new play of a scenario you've played before, filled in from the last time: same seats, rules and place.
// After a pass it's attempt 1 again; after a fail or abandon it's the next attempt.
function playAgain(scId){
  var prev=plays.filter(function(p){return p.scenarioId===scId;}).sort(function(a,b){return (b.date||'').localeCompare(a.date||'')||(b.created||0)-(a.created||0);})[0];
  if(!prev){openPlay(null,scId);return;}
  openPlay({_again:true,scenarioId:prev.scenarioId,scenarioName:prev.scenarioName,scenarioType:prev.scenarioType,
    party:(prev.party||[]).map(function(x){return {player:x.player||'',investigator:x.investigator||''};}),
    rules:prev.rules||'',location:prev.location||'',attempts:prev.result==='pass'?1:Math.min(99,(prev.attempts||1)+1)});
}
function openPlay(p,preset){
  var d=openDialog(playForm(p,preset),p&&p.id?'Edit play':'Log a play'),f=d.querySelector('form'),err=f.querySelector('.err');
  var seatHtml=f.querySelector('.seat').outerHTML;
  var syncNew=function(){var on=f.sc.value==='__new';f.querySelector('.newsc').hidden=!on;f.nsname.required=on;if(on)f.nsname.focus();};
  f.sc.addEventListener('change',syncNew);
  // picking a group fills the seats with its members, keeping any investigator already chosen for someone
  if(f.grp)f.grp.addEventListener('change',function(){
    var g=groups.filter(function(y){return y.id===f.grp.value;})[0];if(!g)return;
    var had={};f.querySelectorAll('.seat').forEach(function(s){var n=lc(s.querySelector('[name=pp]').value);if(n)had[n]=s.querySelector('[name=pi]').value;});
    var box=f.querySelector('.seats');box.innerHTML='';
    groupMembers(g).slice(0,8).forEach(function(x){box.insertAdjacentHTML('beforeend',seatHtml);var s=box.lastElementChild;s.querySelector('[name=pp]').value=x.name;s.querySelector('[name=pi]').value=had[lc(x.name)]||'';});
    if(!box.children.length){box.insertAdjacentHTML('beforeend',seatHtml);box.querySelectorAll('input').forEach(function(i){i.value='';});}
    f.grp.value='';var first=box.querySelector('[name=pi]');if(first)first.focus();
  });
  f.addEventListener('click',function(e){
    var b=e.target.closest('[data-f]');if(!b)return;var k=b.getAttribute('data-f');
    if(k==='addseat'){var box=f.querySelector('.seats');if(box.children.length>=8)return;box.insertAdjacentHTML('beforeend',seatHtml);var s=box.lastElementChild;s.querySelectorAll('input').forEach(function(i){i.value='';});s.querySelector('input').focus();}
    else if(k==='rmseat'){var all=f.querySelectorAll('.seat');if(all.length>1)b.closest('.seat').remove();else b.closest('.seat').querySelectorAll('input').forEach(function(i){i.value='';});}
    else if(k==='del'){
      if(b.dataset.sure){b.disabled=true;fb.db.doc('users/'+me.uid+'/plays/'+f.dataset.id).delete().then(function(){d.close();toast('Play deleted.');}).catch(function(e2){b.disabled=false;showErr(friendly(e2));});}
      else{b.dataset.sure='1';b.textContent='Delete this play?';b.classList.remove('ghost');}
    }
  });
  var showErr=function(m){err.textContent=m;err.hidden=!m;};
  f.addEventListener('submit',function(e){
    e.preventDefault();showErr('');
    var btn=f.querySelector('[type=submit]');btn.disabled=true;
    savePlay(f).then(function(){d.close();toast(f.dataset.id?'Saved.':'Play logged.');if(!f.dataset.id&&ui.tab!=='plays'){ui.tab='plays';render();window.scrollTo(0,0);}}).catch(function(e2){btn.disabled=false;showErr(friendly(e2));});
  });
}
async function savePlay(f){
  var scId=f.sc.value,sc;
  if(scId==='__new'){
    var nm=f.nsname.value.trim().replace(/\s+/g,' ');if(!nm)throw {msg:'Give the new scenario a name.'};
    sc=allScenarios().filter(function(s){return MOM.key(s.name)===MOM.key(nm);})[0];
    if(!sc){var type=f.nstype.value==='valkyrie'?'valkyrie':'custom';sc={id:(type==='valkyrie'?'v-':'c-')+MOM.slug(nm),name:nm,type:type};
      await fb.db.doc('users/'+me.uid+'/scenarios/'+sc.id).set({name:nm,type:type,author:'',link:'',created:Date.now()});}
  }else sc=scenById(scId);
  if(!sc){var old=plays.filter(function(p){return p.id===f.dataset.id;})[0];if(old&&old.scenarioId===scId)sc={id:scId,name:old.scenarioName,type:old.scenarioType};}
  if(!sc)throw {msg:'Choose a scenario.'};
  var res=(f.querySelector('input[name=res]:checked')||{}).value;if(!res)throw {msg:'Choose Passed, Failed or Abandoned.'};
  var party=[];f.querySelectorAll('.seat').forEach(function(s){var a=s.querySelector('[name=pp]').value.trim(),b=s.querySelector('[name=pi]').value;if(b&&!MOM.isInvestigator(b))b='';if(a||b)party.push({player:a.slice(0,40),investigator:b});});
  var att=Math.max(1,Math.min(99,parseInt(f.att.value,10)||1));
  var doc={scenarioId:sc.id,scenarioName:sc.name,scenarioType:sc.type||'official',date:f.date.value||'',result:res,attempts:att,
    party:party,solo:party.length===1,rules:f.rules.value.trim().slice(0,80),location:f.loc.value.trim().replace(/\s+/g,' ').slice(0,60),notes:f.notes.value.trim().slice(0,4000),updated:Date.now()};
  if(f.dataset.id)await fb.db.doc('users/'+me.uid+'/plays/'+f.dataset.id).update(doc);
  else{doc.created=Date.now();await fb.db.collection('users/'+me.uid+'/plays').add(doc);}
}

function addScenarioDialog(){
  var d=openDialog('<form class="stack" data-form="addsc"><div class="dlg-head"><h2>Add a scenario</h2><button class="x" type="button" data-close aria-label="Close">×</button></div>'+
    '<p class="note">For Valkyrie and homemade scenarios. Only you see the ones you add here.</p>'+
    '<label class="field"><span class="lbl">Name</span><input class="f" name="scname" maxlength="80" required></label>'+
    '<div class="grid2"><label class="field"><span class="lbl">Kind</span><select class="f" name="type"><option value="valkyrie">Valkyrie</option><option value="custom">Other / homemade</option></select></label>'+
    '<label class="field"><span class="lbl">Author (optional)</span><input class="f" name="author" maxlength="60"></label></div>'+
    '<label class="field"><span class="lbl">Link (optional)</span><input class="f" name="link" type="url" maxlength="300" placeholder="https://"></label>'+
    '<p class="err" role="alert" hidden></p><div class="row end"><button class="btn" type="button" data-close>Cancel</button><button class="btn pri" type="submit">Add</button></div></form>','Add a scenario');
  var f=d.querySelector('form');
  f.addEventListener('submit',function(e){
    e.preventDefault();var nm=f.scname.value.trim().replace(/\s+/g,' '),err=f.querySelector('.err');
    if(allScenarios().some(function(s){return MOM.key(s.name)===MOM.key(nm);})){err.textContent='“'+nm+'” is already on the list.';err.hidden=false;return;}
    var type=f.type.value==='valkyrie'?'valkyrie':'custom',id=(type==='valkyrie'?'v-':'c-')+MOM.slug(nm),link=f.link.value.trim();
    fb.db.doc('users/'+me.uid+'/scenarios/'+id).set({name:nm,type:type,author:f.author.value.trim().slice(0,60),link:/^https:\/\//.test(link)?link:'',created:Date.now()})
      .then(function(){d.close();toast('Added.');}).catch(function(e2){err.textContent=friendly(e2);err.hidden=false;});
  });
}

// ---------- import ----------
function prepareImport(rows){
  var r=I.buildPlays(rows,allScenarios(true));
  var have={};plays.forEach(function(p){if(p.importKey)have[p.importKey]=1;});
  r.plays.forEach(function(p){p.dupe=!!have[p.importKey];});
  ui.imp=r;
}
async function runImport(){
  var imp=ui.imp;if(!imp)return;ui.busy=true;render();
  try{
    var writes=[],now=Date.now(),base=fb.db.collection('users/'+me.uid+'/plays');
    imp.scenarios.forEach(function(s){writes.push([fb.db.doc('users/'+me.uid+'/scenarios/'+s.id),{name:s.name,type:s.type,author:'',link:'',created:now}]);});
    var fresh=imp.plays.filter(function(p){return !p.dupe;});
    fresh.forEach(function(p,i){var d={};Object.keys(p).forEach(function(k){if(k!=='dupe')d[k]=p[k];});d.created=now+i;d.updated=now+i;writes.push([base.doc(),d]);});
    for(var i=0;i<writes.length;i+=400){var b=fb.db.batch();writes.slice(i,i+400).forEach(function(w){b.set(w[0],w[1]);});await b.commit();}
    ui.imp=null;ui.tab='plays';toast('Imported '+fresh.length+' play'+(fresh.length===1?'':'s')+'.');
  }catch(e){ui.imp={error:friendly(e)};}
  ui.busy=false;render();
}
function download(name,text,type){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},500);}
async function deleteAll(col){var q=await fb.db.collection('users/'+me.uid+'/'+col).get();for(var i=0;i<q.docs.length;i+=400){var b=fb.db.batch();q.docs.slice(i,i+400).forEach(function(d){b.delete(d.ref);});await b.commit();}}
function confirmDialog(title,body,yes,run){
  var d=openDialog('<div class="dlg-head"><h2>'+esc(title)+'</h2><button class="x" type="button" data-close aria-label="Close">×</button></div><p>'+body+'</p><p class="err" role="alert" hidden></p>'+
    '<div class="row end"><button class="btn" type="button" data-close>Cancel</button><button class="btn dng" type="button" data-yes>'+esc(yes)+'</button></div>',title);
  d.querySelector('[data-yes]').addEventListener('click',function(e){var b=e.currentTarget;b.disabled=true;Promise.resolve(run()).then(function(){d.close();}).catch(function(err){b.disabled=false;var el=d.querySelector('.err');el.textContent=friendly(err);el.hidden=false;});});
}

// ---------- events ----------
app.addEventListener('click',function(e){
  var a=e.target.closest('[data-a]');if(!a)return;var k=a.getAttribute('data-a');
  if(a.tagName==='A')e.preventDefault();
  if(k==='tab'){ui.tab=a.dataset.t;try{sessionStorage.setItem('mom-tab',ui.tab);}catch(x){}render();window.scrollTo(0,0);}
  else if(k==='log')openPlay(null,a.dataset.sc);
  else if(k==='again')playAgain(a.dataset.sc);
  else if(k==='edit'){var p=plays.filter(function(x){return x.id===a.dataset.id;})[0];if(p)openPlay(p);}
  else if(k==='clearf'){ui.q=ui.result=ui.player=ui.scen='';render();}
  else if(k==='scplays'){ui.q=ui.result=ui.player='';ui.scen=a.dataset.id;ui.tab='plays';render();window.scrollTo(0,0);}
  else if(k==='addsc')addScenarioDialog();
  else if(k==='fixinv')fixInvestigators();
  else if(k==='sfclear'){sf.src=sf.diff=sf.len=sf.rate=sf.lang='any';sf.src='all';ui.sfilter='all';ui.sq='';try{sessionStorage.setItem('mom-sf',JSON.stringify(sf));}catch(x){}render();}
  else if(k==='newperson')personDialog();
  else if(k==='newgroup')groupDialog();
  else if(k==='editperson'){var ps=people.filter(function(x){return x.id===a.dataset.id;})[0];if(ps)personDialog(ps);}
  else if(k==='editgroup'){var gr=groups.filter(function(x){return x.id===a.dataset.id;})[0];if(gr)groupDialog(gr);}
  else if(k==='delperson'){var pd=people.filter(function(x){return x.id===a.dataset.id;})[0];if(pd)confirmDialog('Delete player','Delete <b>'+esc(pd.name)+'</b>? They\u2019re taken out of your groups. Past plays keep their name.','Delete',async function(){
    var b=fb.db.batch();groups.forEach(function(g){if((g.members||[]).indexOf(pd.id)>=0)b.update(fb.db.doc('users/'+me.uid+'/groups/'+g.id),{members:g.members.filter(function(m){return m!==pd.id;}),updated:Date.now()});});
    b.delete(fb.db.doc('users/'+me.uid+'/people/'+pd.id));await b.commit();});}
  else if(k==='delgroup'){var gd=groups.filter(function(x){return x.id===a.dataset.id;})[0];if(gd)confirmDialog('Delete group','Delete the group <b>'+esc(gd.name)+'</b>? The players in it stay.','Delete',function(){return fb.db.doc('users/'+me.uid+'/groups/'+gd.id).delete();});}
  else if(k==='addname'){savePerson(a.dataset.n,'').then(function(){toast('Added '+a.dataset.n+'.');}).catch(function(err){toast(friendly(err));});}
  else if(k==='addloose'){var ln=names('player').filter(function(n){return !personByName(n);});Promise.all(ln.map(function(n){return savePerson(n,'');})).then(function(){toast('Added '+ln.length+' players.');}).catch(function(err){toast(friendly(err));});}
  else if(k==='playerplays'){ui.q=ui.result=ui.scen='';ui.player=a.dataset.n;ui.tab='plays';render();window.scrollTo(0,0);}
  else if(k==='delsc'){var s=mine.filter(function(x){return x.id===a.dataset.id;})[0];if(s)confirmDialog('Remove scenario','Remove <b>'+esc(s.name)+'</b> from your list?','Remove',function(){return fb.db.doc('users/'+me.uid+'/scenarios/'+s.id).delete();});}
  else if(k==='goimport'){ui.tab='settings';render();var el=document.getElementById('import');if(el)el.scrollIntoView();}
  else if(k==='doimport')runImport();
  else if(k==='cancelimport'){ui.imp=null;render();}
  else if(k==='csv')download('mansions-plays.csv',I.toCSV(plays.slice().sort(sortPlays)),'text/csv');
  else if(k==='json')download('mansions-backup.json',JSON.stringify({exported:new Date().toISOString(),version:self.APP_VERSION,plays:plays,scenarios:mine},null,1),'application/json');
  else if(k==='wipe')confirmDialog('Delete all plays','All '+plays.length+' plays go for good. Download a copy first if you might want them.','Delete all plays',function(){return deleteAll('plays').then(function(){toast('All plays deleted.');});});
  else if(k==='delacct')confirmDialog('Delete my account','Your plays, your scenarios and your sign-in all go for good. This can’t be undone.','Delete my account',async function(){
    await deleteAll('plays');await deleteAll('scenarios');await deleteAll('people');await deleteAll('groups');await fb.db.doc('users/'+me.uid).delete();
    try{await me.delete();}catch(err){if(err.code==='auth/requires-recent-login'){await fb.auth.signOut();throw {msg:'Your plays are deleted. To remove the sign-in too, sign in again and choose Delete my account once more.'};}throw err;}
    location.href='./';
  });
  else if(k==='google')googleSignIn();
  else if(k==='mode'){ui.authMode=a.dataset.m;ui.authErr='';render();}
});
// Remember which boxes are open. Recorded on the click itself, because the browser's toggle event comes a moment later
// and is lost if the list redraws in between (say, a filter changed straight after); toggle still covers the keyboard.
function saveBox(key,open){boxes[key]=open;try{localStorage.setItem('mom-boxes',JSON.stringify(boxes));}catch(x){}}
app.addEventListener('click',function(e){var sm=e.target.closest('details[data-box]>summary');if(sm)saveBox(sm.parentNode.dataset.box,!sm.parentNode.open);},true);
app.addEventListener('toggle',function(e){var d=e.target;if(d.matches&&d.matches('details[data-box]'))saveBox(d.dataset.box,d.open);},true);
app.addEventListener('input',function(e){if(e.target.id==='q'){ui.q=e.target.value;render();}else if(e.target.id==='sq'){ui.sq=e.target.value;render();}else if(e.target.id==='imp-link')ui.impLink=e.target.value;});
app.addEventListener('change',function(e){
  var t=e.target;
  if(t.id==='fres'){ui.result=t.value;render();}else if(t.id==='fpl'){ui.player=t.value;render();}else if(t.id==='fsc'){ui.scen=t.value;render();}
  else if(t.id==='sf-status'){ui.sfilter=t.value;render();}
  else if(/^sf-/.test(t.id)&&t.id!=='sf-status'){sf[t.id.slice(3)]=t.value;try{sessionStorage.setItem('mom-sf',JSON.stringify(sf));}catch(x){}render();}
  else if(t.id==='s-valk')fb.db.doc('users/'+me.uid).set({hideValkyrie:!t.checked},{merge:true}).catch(function(err){toast(friendly(err));});
  else if(t.dataset.own){var o=owned().slice(),i=o.indexOf(t.dataset.own);if(t.checked&&i<0)o.push(t.dataset.own);if(!t.checked&&i>=0)o.splice(i,1);
    fb.db.doc('users/'+me.uid).set({owned:o},{merge:true}).catch(function(err){toast(friendly(err));});}
  else if(t.id==='imp-file'&&t.files[0]){var r=new FileReader();r.onload=function(){prepareImport(I.parseCSV(r.result));render();};r.readAsText(t.files[0]);t.value='';}
});
app.addEventListener('submit',function(e){
  var f=e.target.closest('[data-form]');if(!f)return;e.preventDefault();var k=f.getAttribute('data-form');
  if(k==='auth')emailAuth();
  else if(k==='sheet'){var link=document.getElementById('imp-link').value.trim();ui.impLink=link;ui.busy=true;ui.imp=null;render();
    I.fetchSheet(link).then(function(rows){prepareImport(rows);}).catch(function(err){ui.imp={error:err.message};}).then(function(){ui.busy=false;render();});}
});

// ---------- sign-in ----------
async function googleSignIn(){
  var p=new firebase.auth.GoogleAuthProvider();p.setCustomParameters({prompt:'select_account'});
  try{await fb.auth.signInWithPopup(p);}catch(e){
    if(e&&(e.code==='auth/popup-blocked'||e.code==='auth/operation-not-supported-in-this-environment'))await fb.auth.signInWithRedirect(p);
    else{ui.authErr=friendly(e);render();}
  }
}
async function emailAuth(){
  var em=document.getElementById('au-em').value.trim(),pwEl=document.getElementById('au-pw'),pw=pwEl?pwEl.value:'';
  ui.busy=true;ui.authErr='';render();
  try{
    if(ui.authMode==='reset'){await fb.auth.sendPasswordResetEmail(em);ui.authMode='signin';toast('If that email has an account, a reset link is on its way.');}
    else if(ui.authMode==='signup'){var nm=(document.getElementById('au-name')||{}).value||'';ui.pendingName=nm.trim();var c=await fb.auth.createUserWithEmailAndPassword(em,pw);if(ui.pendingName)await c.user.updateProfile({displayName:ui.pendingName}).catch(function(){});}
    else await fb.auth.signInWithEmailAndPassword(em,pw);
  }catch(e){ui.authErr=friendly(e);}
  ui.busy=false;render();
}

// ---------- data ----------
function listen(user){
  unsub.forEach(function(u){u();});unsub=[];plays=[];mine=[];shared=[];people=[];groups=[];profile=null;loaded.plays=false;
  var uref=fb.db.doc('users/'+user.uid);
  // Create or refresh the profile (the admin page lists accounts from these).
  uref.get().then(function(s){
    var d={email:user.email||'',lastSeen:Date.now()};
    if(!s.exists){d.created=Date.now();d.name=ui.pendingName||user.displayName||(user.email||'').split('@')[0]||'';d.playCount=0;}
    return uref.set(d,{merge:true});
  }).catch(function(){});
  unsub.push(uref.onSnapshot(function(s){profile=s.data()||{};render();},function(){}));
  unsub.push(fb.db.collection('users/'+user.uid+'/plays').onSnapshot(function(q){
    plays=q.docs.map(function(d){var x=d.data();x.id=d.id;return x;}).sort(sortPlays);loaded.plays=true;
    if(!q.metadata.fromCache&&profile&&profile.playCount!==plays.length)uref.set({playCount:plays.length},{merge:true}).catch(function(){});
    render();
  },function(e){console.warn(e);loaded.plays=true;render();}));
  unsub.push(fb.db.collection('users/'+user.uid+'/people').onSnapshot(function(q){people=q.docs.map(function(d){var x=d.data();x.id=d.id;return x;});render();},function(){}));
  unsub.push(fb.db.collection('users/'+user.uid+'/groups').onSnapshot(function(q){groups=q.docs.map(function(d){var x=d.data();x.id=d.id;return x;});render();},function(){}));
  unsub.push(fb.db.collection('users/'+user.uid+'/scenarios').onSnapshot(function(q){mine=q.docs.map(function(d){var x=d.data();x.id=d.id;x.mine=true;return x;});render();},function(){}));
  unsub.push(fb.db.collection('scenarios').onSnapshot(function(q){shared=q.docs.map(function(d){var x=d.data();x.id=d.id;return x;});render();},function(){}));
  fb.db.doc('admins/'+user.uid).get().then(function(s){isAdmin=s.exists;render();}).catch(function(){});
}

momFirebase().then(function(x){
  fb=x;
  fb.auth.getRedirectResult().catch(function(e){ui.authErr=friendly(e);});
  var wantAccount=/[?&]account=1/.test(location.search);
  fb.auth.onAuthStateChanged(function(u){
    authKnown=true;me=u;
    if(u){listen(u);if(wantAccount){wantAccount=false;history.replaceState(null,'',location.pathname);setTimeout(openAccount,400);}}else{unsub.forEach(function(f){f();});unsub=[];plays=[];isAdmin=false;}
    render();
  });
}).catch(function(e){
  console.warn(e);authKnown=true;
  app.innerHTML='<section class="sec"><h2>Can’t start</h2><p class="note">The site couldn’t load its settings. If you’re offline, connect once and reload; after that it works offline.</p><div class="row"><button class="btn" onclick="location.reload()">Reload</button></div></section>';
});
render();
})();
