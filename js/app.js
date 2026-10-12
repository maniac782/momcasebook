/* Mansions of Madness Casebook — the main page: sign-in, the play log, scenarios, stats and settings.
   Data (all private to each account, see firestore.rules):
     users/{uid}                 name, email, created, lastSeen, playCount, owned (product ids from js/catalog.js)
     users/{uid}/plays/{id}      scenarioId, scenarioName, scenarioType, date (YYYY-MM-DD or ''), result (pass|fail|abandoned),
                                 attempts, party [{player, investigator}], solo, rules, notes, created, updated, importKey?, seq?
     users/{uid}/scenarios/{id}  older versions' personal scenarios; no longer created, removed once no play needs them
     scenarios/{id}              official or Valkyrie scenarios the admin shares with everyone (name, type, author, link) */
(function(){
'use strict';
var MOM=window.MOM,I=window.MOMImport;
var app=document.getElementById('app'),acctEl=document.getElementById('acct');
var fb=null,me=null,authKnown=false,profile=null,plays=[],mine=[],shared=[],people=[],groups=[],isAdmin=false,loaded={plays:false},unsub=[];
var ui={tab:'plays',q:'',result:'',player:'',scen:'',sfilter:'all',authMode:'signin',authErr:'',busy:false,imp:null};
try{var t0=sessionStorage.getItem('mom-tab');if(t0)ui.tab=t0;}catch(e){}
var DAY=86400000;

// ---------- helpers ----------
function fmtDate(d){if(!d)return t('No date');var x=new Date(d+'T12:00:00');return isNaN(x)?d:x.toLocaleDateString(I18N.locale, {year:'numeric',month:'short',day:'numeric'});}
function today(){var d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
function pct(a,b){return b?Math.round(a*100/b)+'%':'—';}
var RES={pass:['Won','ok'],fail:['Lost','bad'],abandoned:['Abandoned','muted']};
function resChip(r){var x=RES[r];return x?'<span class="chip '+x[1]+'">'+t(x[0])+'</span>':'<span class="chip muted">'+t('No result')+'</span>';}
function typeName(k){return k==='official'?t('Official'):k==='valkyrie'?t('Valkyrie'):t('Not matched');}
// "Normal rules" is saved in English (it's the default); shown in the reader's language
var NORMAL='Normal rules';
function rulesName(r){return r===NORMAL?t(NORMAL):r;}
function sortPlays(a,b){return (b.date||'').localeCompare(a.date||'')||(b.date?0:(a.seq||0)-(b.seq||0))||(b.created||0)-(a.created||0);}
function partyText(p){
  var seats=(p.party||[]);if(!seats.length)return '';
  return seats.map(function(s){return s.player&&s.investigator?esc(s.player)+' <span class="as">'+t('as')+'</span> '+esc(s.investigator):esc(s.player||s.investigator||t('Unknown'));}).join(', ');
}
// Every scenario this person can pick: official, shared by the admin, and their own. Later entries with the same name are skipped.
function showValk(){return !(profile&&profile.hideValkyrie);}
function allScenarios(all){
  var seen={},out=[];
  MOM.OFFICIAL.concat(all||showValk()?MOM.VALKYRIE:[],sharedOk()).forEach(function(s){var k=MOM.key(s.name);if(!seen[k]){seen[k]=1;out.push(s);}});
  return out;
}
// Shared scenarios from the admin page count only if they're official or Valkyrie ones.
function sharedOk(){return shared.filter(function(s){return s.type==='official'||s.type==='valkyrie';});}
// Every scenario a play may name: official, Valkyrie (retired ones too) and shared.
function validScenarios(){return MOM.OFFICIAL.concat(MOM.VALKYRIE,sharedOk());}
// Plays naming something that isn't an official or Valkyrie scenario (older "your own" ones).
function scenarioProblems(){var ok={};validScenarios().forEach(function(s){ok[s.id]=1;});
  return plays.filter(function(p){return !(ok[p.scenarioId]&&(p.scenarioType==='official'||p.scenarioType==='valkyrie'));});}
function scenById(id){return allScenarios(true).filter(function(s){return s.id===id;})[0];}
function owned(){return profile&&Array.isArray(profile.owned)?profile.owned:MOM.PRODUCTS.map(function(p){return p.id;});}
function myName(){return (profile&&profile.name)||(me&&me.displayName)||'';}
// The distinct people at a play. Someone playing two characters is one person, matched ignoring case and spaces;
// seats with no player name each count as someone (we can't tell who). Returns {names (first spelling), unnamed}.
function peopleAt(p){var seen={},names=[],unnamed=0;
  (p.party||[]).forEach(function(s){var n=String(s.player||'').trim().replace(/\s+/g,' ');if(!n){unnamed++;return;}var k=n.toLowerCase();if(!seen[k]){seen[k]=1;names.push(n);}});
  return {names:names,unnamed:unnamed,count:names.length+unnamed};}
function names(field){
  // how many plays each name appears in (once per play, however many seats)
  var c={};plays.forEach(function(p){var once={};(p.party||[]).forEach(function(s){var v=(s[field]||'').trim();if(v&&!once[v.toLowerCase()]){once[v.toLowerCase()]=1;c[v]=(c[v]||0)+1;}});});
  return Object.keys(c).sort(function(a,b){return c[b]-c[a]||a.localeCompare(b);});
}
// Places used before, most used first.
function places(){var c={};plays.forEach(function(p){if(p.location)c[p.location]=(c[p.location]||0)+1;});return Object.keys(c).sort(function(a,b){return c[b]-c[a]||a.localeCompare(b);});}
function rulesUsed(){var c={};c[NORMAL]=0;plays.forEach(function(p){if(p.rules)c[p.rules]=(c[p.rules]||0)+1;});return Object.keys(c).sort(function(a,b){return c[b]-c[a];});}
function friendly(e){
  var m={'auth/invalid-email':t('That email address doesn’t look right.'),'auth/missing-password':t('Enter your password.'),
   'auth/invalid-credential':t('Wrong email or password.'),'auth/wrong-password':t('Wrong email or password.'),'auth/user-not-found':t('Wrong email or password.'),
   'auth/email-already-in-use':t('There’s already an account with that email. Sign in instead.'),'auth/weak-password':t('Use at least 6 characters for the password.'),
   'auth/too-many-requests':t('Too many tries. Wait a minute and try again.'),'auth/popup-closed-by-user':'','auth/cancelled-popup-request':'',
   'auth/network-request-failed':t('Can’t reach the server. Check your connection.'),'permission-denied':t('The database refused that change.')};
  return e&&e.msg?e.msg:e&&m[e.code]!=null?m[e.code]:t('Something went wrong. Try again.');
}

// ---------- rendering ----------
function render(){
  if(!authKnown){app.innerHTML='<p class="note pad">'+t('Loading…')+'</p>';return;}
  if(!me){acctEl.innerHTML='';welcomeView();return;}
  var LM=window.LocalMoM||{};
  acctEl.innerHTML=LM.embed?'':accountMenu(me,{admin:isAdmin,photo:profile&&profile.photo,color:profile&&profile.color,name:myName()||(LM.mode?t('You'):''),local:!!LM.mode});
  var keep=document.activeElement&&/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)&&document.activeElement.id;
  var tabs=[['plays',t('Plays')],['scenarios',t('Scenarios')],['players',t('Players')],['stats',t('Stats')],['settings',t('Settings')]];
  var h='<div class="bar"><div class="tabs" role="tablist">'+tabs.map(function(x){return '<button class="tab" role="tab" aria-selected="'+(ui.tab===x[0])+'" data-a="tab" data-t="'+x[0]+'">'+x[1]+'</button>';}).join('')+'</div>'+
    '<button class="btn pri" data-a="log">'+t('+ Log a play')+'</button></div>';
  if(LM.mode==='demo')h+='<p class="sec localban demoban">'+t('This is a sample casebook with invented players, so nothing you change here is saved.')+'</p>';
  else if(LM.mode==='local')h+='<section class="sec localban"><div class="grow"><b>'+t('Saved in this browser only.')+'</b><span class="note">'+t('Make a free account to keep your casebook safe and use it on your other devices. Everything moves over with you.')+'</span></div><a class="btn pri" href="./?save=1">'+t('Save to an account')+'</a></section>';
  h+=ui.tab==='scenarios'?scenariosHtml():ui.tab==='players'?playersHtml():ui.tab==='stats'?statsHtml():ui.tab==='settings'?settingsHtml():playsHtml();
  app.innerHTML=h;
  fitTabs();
  if(keep){var el=document.getElementById(keep);if(el){el.focus();try{var n=el.value.length;el.setSelectionRange(n,n);}catch(e){}}}
}

// The five tabs share the bar; in a language with longer words they get snugger, then smaller, rather than run off a
// phone's edge (they still scroll sideways if even that isn't enough).
function fitTabs(){var b=app.querySelector('.bar .tabs');if(!b)return;b.classList.remove('snug','snugger');
  if(b.scrollWidth>b.clientWidth+1){b.classList.add('snug');if(b.scrollWidth>b.clientWidth+1)b.classList.add('snugger');}}
window.addEventListener('resize',function(){fitTabs();});
// Signed out: an intro beside the sign-in card, then the sample casebook to look around (js/demo.js), as on the
// Arkham Horror RPG Ledger. The sample's frame is made once, so switching sign-in modes doesn't reload it.
function welcomeView(){
  var LM=window.LocalMoM||{};
  // Came from "Save to an account": just the sign-in card.
  if(LM.save){app.innerHTML='<div class="savewrap"><a class="btn sm" href="./">‹ '+t('Back to your casebook')+'</a>'+authHtml()+'</div>';return;}
  var fr=document.getElementById('demoframe');
  if(fr&&app.contains(fr)){document.getElementById('authbox').innerHTML=authHtml();return;}
  app.innerHTML='<div class="welcome"><div id="introbox">'+introHtml()+'</div><div id="authbox">'+authHtml()+'</div>'+
    '<section class="demo" aria-label="'+t('Sample casebook')+'"><div class="demohead"><h2>'+t('Have a look around')+'</h2><span class="note">'+t('A sample casebook with invented players. Open a play, filter the scenarios, star one or try the stats. Nothing here is saved.')+'</span></div>'+
    '<iframe id="demoframe" src="./?demo=1&amp;embed=1" title="'+t('Sample casebook')+'" loading="lazy"></iframe></section></div>';
}
function introHtml(){
  return '<section class="intro"><h2>'+t('Every night in the mansion, written down.')+'</h2>'+
    '<p>'+t('Keep a log of your Mansions of Madness games, official scenarios and Valkyrie ones alike: who played, which investigators they took, whether you made it out, and what happened. Find your next scenario by difficulty, length and rating, star the ones you want to play and schedule the night. It works on phones and computers, installs like an app and keeps working offline.')+'</p>'+
    '<div class="row cta"><button class="btn pri" data-a="trylocal">'+t('Start a casebook, no account needed')+'</button><a class="btn narrow-only" href="#signin">'+t('Sign in')+'</a></div>'+
    '<p class="note">'+t('It’s saved in this browser until you make an account, then it moves over with you.')+'</p>'+
    '<p class="note">'+t('Free, no ads. An unofficial fan project, not affiliated with Fantasy Flight Games. You’ll need Mansions of Madness Second Edition and its free companion app to play.')+'</p></section>';
}
function authHtml(){
  var m=ui.authMode,LM=window.LocalMoM||{};
  return '<section class="sec auth" id="signin"><h2>'+(m==='reset'?t('Reset your password'):LM.save?t('Save your casebook'):m==='signup'?t('Create an account'):t('Sign in'))+'</h2>'+
    (LM.save&&m!=='reset'?'<p class="note savenote">'+t('Create a free account, or sign in to one you have, and the casebook in this browser moves over to it. Nothing is lost.')+'</p>':'')+
    (m==='reset'?'':'<button class="btn google" data-a="google"><span class="g" aria-hidden="true">G</span> '+t('Continue with Google')+'</button><div class="or"><span>'+t('or with email')+'</span></div>')+
    '<form class="stack" data-form="auth">'+
    (m==='signup'?'<label class="field"><span class="lbl">'+t('Your name')+'</span><input class="f" id="au-name" autocomplete="name" maxlength="40" placeholder="'+t('How you appear in your own plays')+'"></label>':'')+
    '<label class="field"><span class="lbl">'+t('Email')+'</span><input class="f" id="au-em" type="email" autocomplete="email" required></label>'+
    (m==='reset'?'':'<label class="field"><span class="lbl">'+t('Password')+'</span><input class="f" id="au-pw" type="password" autocomplete="'+(m==='signup'?'new-password':'current-password')+'" required minlength="6"></label>')+
    (ui.authErr?'<p class="err" role="alert">'+esc(ui.authErr)+'</p>':'')+
    '<button class="btn pri" type="submit"'+(ui.busy?' disabled':'')+'>'+(m==='signup'?t('Create account'):m==='reset'?t('Send reset link'):t('Sign in'))+'</button></form>'+
    '<div class="row authlinks">'+(m==='signin'?'<button class="btn sm" type="button" data-a="mode" data-m="reset">'+t('Forgot password?')+'</button><button class="btn sm" type="button" data-a="mode" data-m="signup">'+t('Create an account')+'</button>':
      m==='signup'?'<span class="note">'+t('Already have an account?')+'</span><button class="btn sm" type="button" data-a="mode" data-m="signin">'+t('Sign in')+'</button>':'<button class="btn sm" type="button" data-a="mode" data-m="signin">'+t('Back to sign in')+'</button>')+'</div>'+
    '<p class="note fine">'+t('See our <a href="privacy.html">privacy policy</a>.')+'</p></section>';
}

function filtered(){
  var q=ui.q.trim().toLowerCase();
  return plays.filter(function(p){
    if(ui.result&&p.result!==ui.result)return false;
    if(ui.scen&&p.scenarioId!==ui.scen)return false;
    if(ui.player&&!(p.party||[]).some(function(s){return s.player===ui.player||s.investigator===ui.player;}))return false;
    if(q){var hay=[p.scenarioName,scName(p.scenarioId,p.scenarioName),p.notes,p.rules,p.location].concat((p.party||[]).map(function(s){return s.player+' '+s.investigator;})).join(' ').toLowerCase();if(hay.indexOf(q)<0)return false;}
    return true;
  });
}
function playsHtml(){
  if(!loaded.plays)return '<p class="note pad">'+t('Loading your plays…')+'</p>';
  if(!plays.length)return '<section class="sec empty"><h2>'+t('No plays yet')+'</h2><p class="note">'+t('Log your first game with <b>+ Log a play</b>, or bring in the spreadsheet you’ve been keeping.')+'</p>'+
    '<div class="row"><button class="btn pri" data-a="log">'+t('+ Log a play')+'</button><button class="btn" data-a="goimport">'+t('Import a spreadsheet')+'</button></div></section>';
  var list=filtered(),people=names('player'),invs=names('investigator'),probs=investigatorProblems(),sprobs=scenarioProblems();
  var scs={};plays.forEach(function(p){scs[p.scenarioId]=scName(p.scenarioId,p.scenarioName);});
  var h='<div class="filters"><label class="field grow"><span class="lbl">'+t('Search')+'</span><input class="f" id="q" type="search" value="'+esc(ui.q)+'" placeholder="'+t('Scenario, person, investigator or notes')+'" autocomplete="off"></label>'+
    sel('fres',t('Result'),ui.result,[['',t('Any')],['pass',t('Won')],['fail',t('Lost')],['abandoned',t('Abandoned')]])+
    sel('fpl',t('Player or investigator'),ui.player,[['',t('Anyone')]].concat(people.map(function(n){return [n,n];}),invs.length?[['-','────']]:[],invs.map(function(n){return [n,n];})))+
    sel('fsc',t('Scenario'),ui.scen,[['',t('Any')]].concat(Object.keys(scs).sort(function(a,b){return scs[a].localeCompare(scs[b]);}).map(function(k){return [k,scs[k]];})))+'</div>';
  // the next scheduled game, if any
  var np=nextPlan();
  if(np)h='<section class="sec nextup"><div class="grow"><span class="lbl">'+t('Next game')+'</span><b>'+esc(scName(np.sc.id,np.sc.name))+'</b><span class="note">'+esc(planText(np.plan))+'</span></div>'+
    '<div class="row tight"><span class="placewrap"><button class="btn sm" data-a="calmenu" data-sc="'+esc(np.id)+'">'+t('Add to calendar')+'</button></span>'+(packOf(np.sc)?'<button class="btn sm" data-a="pack" data-sc="'+esc(np.id)+'">'+ICON_BOX+t('Packing list')+'</button>':'')+'<button class="btn sm pri" data-a="logplan" data-sc="'+esc(np.id)+'">'+t('Log this game')+'</button></div></section>'+h;
  if(probs.length)h='<section class="sec notice" role="status"><div class="grow"><b>'+t('Some investigator names aren’t official ones')+'</b><span class="note">'+tn('{n} name ({names}) needs matching to an official investigator.','{n} names ({names}) need matching to an official investigator.',probs.length,{names:probs.slice(0,3).map(function(x){return '“'+esc(x.text)+'”';}).join(', ')+(probs.length>3?'…':'')})+'</span></div><button class="btn pri" data-a="fixinv">'+t('Fix them')+'</button></section>'+h;
  if(sprobs.length)h='<section class="sec notice" role="status"><div class="grow"><b>'+tn('{n} play isn’t matched to an official or Valkyrie scenario','{n} plays aren’t matched to an official or Valkyrie scenario',sprobs.length)+'</b><span class="note">'+t('Every play needs a real scenario. Pick the right one for each name; good guesses are filled in.')+'</span></div><button class="btn pri" data-a="fixsc">'+t('Match them')+'</button></section>'+h;
  var any=ui.q||ui.result||ui.player||ui.scen;
  h+='<p class="note count">'+tn('{n} of {total} play','{n} of {total} plays',plays.length,{n:list.length,total:plays.length})+(any?' · <a href="#" data-a="clearf">'+t('Clear filters')+'</a>':'')+'</p>';
  if(!list.length)return h+'<p class="note">'+t('Nothing matches.')+'</p>';
  // one collapsible box each for Official and Valkyrie scenarios (plus any still needing a scenario), like the Scenarios tab
  // date and place on one quiet line; left out entirely when the play has neither
  var plMeta=function(p){var bits=[p.date?esc(fmtDate(p.date)):'',p.location?(p.date?t('at {place}',{place:esc(p.location)}):t('At {place}',{place:esc(p.location)})):''].filter(Boolean);
    return bits.length?'<span class="pl-meta">'+bits.join(' · ')+'</span>':'';};
  var prow=function(p){
    // the result sits at the right, centred on the card, so results line up down the list
    return '<li><button class="play" data-a="edit" data-id="'+esc(p.id)+'"><span class="pl-main">'+
      plMeta(p)+
      '<span class="pl-name">'+esc(scName(p.scenarioId,p.scenarioName))+'</span>'+
      (partyText(p)?'<span class="pl-party">'+partyText(p)+'</span>':'<span class="pl-party none">'+t('Players not recorded')+'</span>')+
      (p.rules&&p.rules!==NORMAL?'<span class="pl-rules">'+esc(p.rules)+'</span>':'')+
      (p.notes?'<span class="pl-notes">'+esc(p.notes)+'</span>':'')+'</span>'+
      '<span class="pl-res">'+resChip(p.result)+(p.attempts>1?'<span class="pl-tries">'+tn('{n} try','{n} tries',p.attempts)+'</span>':'')+'</span></button></li>';};
  var bad={};sprobs.forEach(function(p){bad[p.id]=1;});
  var kind=function(p){return bad[p.id]?'fix':p.scenarioType==='valkyrie'?'valkyrie':'official';};
  [['fix',t('Needs a scenario')],['official',t('Official')],['valkyrie',t('Valkyrie')]].forEach(function(b){
    var items=list.filter(function(p){return kind(p)===b[0];});if(!items.length)return;
    var won=items.filter(function(p){return p.result==='pass';}).length,key='p-'+b[0];
    h+='<details class="sec box pbox" data-box="'+key+'"'+(boxes[key]!==false?' open':'')+'><summary><h2>'+b[1]+'</h2><span class="note">'+tn('{n} play','{n} plays',items.length)+' · '+tn('{n} won','{n} won',won)+'</span><span class="chev" aria-hidden="true"></span></summary>'+
      '<ul class="plays">'+items.map(prow).join('')+'</ul></details>';
  });
  return h;
}
function sel(id,label,val,opts){
  return '<label class="field"><span class="lbl">'+esc(label)+'</span><select class="f" id="'+id+'">'+opts.map(function(o){return '<option value="'+esc(o[0])+'"'+(o[0]==='-'?' disabled':'')+(o[0]===val?' selected':'')+'>'+esc(o[1])+'</option>';}).join('')+'</select></label>';
}

function scenStats(){
  var st={};plays.forEach(function(p){var s=st[p.scenarioId]||(st[p.scenarioId]={n:0,pass:0,last:''});s.n++;if(p.result==='pass')s.pass++;if((p.date||'')>s.last)s.last=p.date;});
  return st;
}
// "Play again" icon: an arrow circling back (counter-clockwise, arrowhead top left) around a play triangle, drawn in the
// text colour so it suits both themes. Original drawing (CC0); decorative, as the button text says what it does.
var ICON_AGAIN='<svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 12a8 8 0 1 0 2.34-5.66"/><path d="M4 4.4v4.1h4.1"/><path d="M10.1 8.4v7.2l5.7-3.6z" fill="currentColor" stroke-width="1.3"/></svg>';
// ---------- the Scenarios tab: one list to browse, filter and sort ----------
var sf={src:'all',diff:'any',len:'any',rate:'any',lang:'any',own:'any',sort:'box'};
// which of the Official / Valkyrie boxes are open; remembered on this device
var boxes={starred:true,official:true,valkyrie:true,yours:true};
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
  sharedOk().forEach(function(s){add(s,s.type);});
  var D={easy:[0,0.35],medium:[0.35,0.6],hard:[0.6,0.8],vhard:[0.8,2]},L={short:[0,120],mid:[120,180],long:[180,240],xlong:[240,1e9]};
  var list=all.filter(function(s){
    var x=st[s.id];
    if(sq&&((s.name||'')+' '+scName(s.id,'')+' '+(s.author||'')+' '+(s.desc||'')+' '+((officialInfo(s)||{}).text||'')+' '+(premiseText(s)||'')).toLowerCase().indexOf(sq)<0)return false;
    if(sf.src!=='all'&&s.from!==sf.src)return false;
    if(f==='new'&&x||f==='unbeaten'&&x&&x.pass||f==='failed'&&!(x&&!x.pass)||f==='beaten'&&!(x&&x.pass))return false;
    if(sf.diff!=='any'){var d=D[sf.diff];if(!s.difficulty||s.difficulty<d[0]||s.difficulty>=d[1])return false;}
    if(sf.len!=='any'){var l=L[sf.len],m=typicalMins(s);if(!m||m<l[0]||m>=l[1])return false;}
    if(sf.rate!=='any'&&!(s.rating&&s.plays>=10&&s.rating>=+sf.rate))return false;
    if(sf.lang!=='any'&&s.from==='valkyrie'&&langsOf(s).indexOf(sf.lang)<0)return false;
    if(sf.own==='own'&&s.from==='valkyrie'&&!canPlay(s))return false;
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
  var h='<div class="filters"><label class="field grow"><span class="lbl">'+t('Search')+'</span><input class="f" id="sq" type="search" value="'+esc(ui.sq||'')+'" placeholder="'+t('Name, author or words in the description')+'" autocomplete="off"></label>'+
    sel('sf-src',t('From'),sf.src,[['all',t('Everything')],['official',t('Official')],['valkyrie',t('Valkyrie')]])+
    sel('sf-status',t('Your progress'),f,[['all',t('Any')],['new',t('Not played')],['failed',t('Lost')],['unbeaten',t('Not played or lost')],['beaten',t('Won')]])+
    sel('sf-diff',t('Difficulty'),sf.diff,[['any',t('Any')],['easy',t('Easy')],['medium',t('Medium')],['hard',t('Hard')],['vhard',t('Very hard')]])+
    sel('sf-len',t('Length'),sf.len,[['any',t('Any')],['short',t('Under 2 hours')],['mid',t('2 to 3 hours')],['long',t('3 to 4 hours')],['xlong',t('Over 4 hours')]])+
    sel('sf-rate',t('Rating'),sf.rate,[['any',t('Any')],['7',t('{n} or more',{n:fmtNum(7)})],['8',t('{n} or more',{n:fmtNum(8)})],['8.5',t('{n} or more',{n:fmtNum(8.5)})]])+
    sel('sf-lang',t('Language'),sf.lang,[['any',t('Any')]].concat(langChoices()))+
    sel('sf-own',t('Your collection'),sf.own||'any',[['any',t('Anything')],['own',t('Playable with what I own')]])+
    sel('sf-sort',t('Sort by'),sf.sort,[['box',t('Expansion')],['name',t('Name (A–Z)')],['rating',t('Highest rated')],['plays',t('Most played')],['short',t('Shortest')],['long',t('Longest')],['easy',t('Easiest')],['hard',t('Hardest')],['win',t('Easiest to win')],['lang',t('Language')],['mine',t('Your most recent')]])+
    '</div>';
  var narrowed=sf.diff!=='any'||sf.len!=='any'||sf.rate!=='any';
  var anyFilter=narrowed||sf.lang!=='any'||(sf.own||'any')!=='any';
  h+='<p class="note count">'+tn('<b>{n}</b> scenario','<b>{n}</b> scenarios',list.length)+' · '+t('won {n} of {total} official',{n:beat,total:offIds.length})+
    (narrowed&&sf.src!=='valkyrie'?' · '+t('difficulty, length and rating are only known for Valkyrie scenarios, so official ones drop out with those filters'):'')+
    (sf.lang!=='any'&&sf.src!=='valkyrie'?' · '+t('the language filter applies to Valkyrie scenarios; official ones are in the app’s own languages'):'')+
    (anyFilter||sf.src!=='all'||f!=='all'||sq?' · <a href="#" data-a="sfclear">'+t('Clear filters')+'</a>':'')+'</p>';
  if(!list.length)return h+'<p class="note">'+t('Nothing matches. Loosen a filter. (A brand-new Valkyrie scenario appears here after the Monday refresh.)')+'</p>';
  var row=function(s){
    var star=starredMap()[s.id],plan=star&&star.plan;
    var x=st[s.id],chip=!x?'<span class="chip muted">'+t('Not played')+'</span>':x.pass?'<span class="chip ok">'+t('Won')+'</span>':'<span class="chip bad">'+t('Lost')+'</span>';
    var src=s.from==='official'?esc(MOM.productName(s.product)||t('Official')):'';  // the box already says Valkyrie
    var facts=[src,s.author?t('by {name}',{name:esc(s.author)}):'',s.difficulty?diffName(s.difficulty):'',
      s.avg&&s.plays>=10?t('usually {time}',{time:esc(lenText([s.avg,s.avg]))}):s.minutes?esc(lenText(s.minutes)):'',langText(s)].filter(Boolean).join(' · ');
    var comm=s.plays>=10&&s.rating?'<span class="rating" title="'+t('Valkyrie players’ average score, 1 to 10')+'">★ '+fmtNum(s.rating,{minimumFractionDigits:1,maximumFractionDigits:1})+'</span> '+
      (s.win!=null?t('{n}% win rate',{n:Math.round(s.win*100)}):'')+' · '+tn('{n} play on Valkyrie','{n} plays on Valkyrie',s.plays,{n:fmtNum(s.plays)}):'';
    var yours=x?(x.last?tn('You: {n} play, {won} won, last {date}','You: {n} plays, {won} won, last {date}',x.n,{won:x.pass,date:esc(fmtDate(x.last))}):tn('You: {n} play, {won} won','You: {n} plays, {won} won',x.n,{won:x.pass})):'';
    var rv=reviewsOf(s);
    return '<li class="sc">'+starBtn(s.id,!!star)+'<div class="grow"><span class="row tight"><b>'+(x?'<a href="#" data-a="scplays" data-id="'+esc(s.id)+'">'+esc(scName(s.id,s.name))+'</a>':esc(scName(s.id,s.name)))+'</b>'+chip+'</span>'+(scName(s.id,s.name)!==s.name?'<span class="note orig" lang="en">'+esc(s.name)+'</span>':'')+
      '<span class="note">'+facts+'</span>'+needsHtml(s)+(plan?'<span class="plan">'+ICON_CAL+'<span>'+esc(planText(plan))+'</span></span>':'')+(comm?'<span class="note community">'+comm+'</span>':'')+(yours?'<span class="note">'+yours+'</span>':'')+
      (s.link&&/^https:\/\//.test(s.link)?'<span class="note"><a href="'+esc(s.link)+'" target="_blank" rel="noopener">'+t('Details')+'</a></span>':'')+
      (officialInfo(s)?'<details class="desc"><summary>'+t('Premise')+'</summary><p>'+esc(premiseText(s))+'</p><p class="note">'+t('Written for this site from {source}; no spoilers.',{source:'<a href="'+esc(officialInfo(s).url)+'" target="_blank" rel="noopener">'+esc(officialInfo(s).source)+'</a>'})+'</p></details>':'')+
      (s.desc?'<details class="desc"><summary>'+t('Description')+(s.descLang?' <span class="note">('+t('in {language}',{language:esc(langName(s.descLang))})+')</span>':'')+'</summary><p>'+esc(s.desc).replace(/\n/g,'<br>')+'</p><p class="note">'+(s.author?t('By {name}, from the Valkyrie scenario catalogue.',{name:esc(s.author)}):t('By the author, from the Valkyrie scenario catalogue.'))+'</p></details>':'')+
      (rv.length?'<details class="reviews"><summary>'+tn('{n} review','{n} reviews',rv.length)+'</summary>'+rv.map(function(r,i){return '<p><span>'+esc(I18N.review(s.id,i)||r.summary)+'</span> <a href="'+esc(r.url)+'" target="_blank" rel="noopener">'+esc(r.source)+'</a>'+(r.date?' <span class="note">('+esc(r.date)+')</span>':'')+'</p>';}).join('')+'</details>':'')+'</div>'+
      '<div class="row tight acts">'+
      (star?'<button class="btn sm" data-a="plan" data-sc="'+esc(s.id)+'">'+(plan?t('Edit plan'):t('Schedule'))+'</button>':'')+
      (plan?'<span class="placewrap"><button class="btn sm" data-a="calmenu" data-sc="'+esc(s.id)+'" aria-haspopup="true">'+t('Add to calendar')+'</button></span><button class="btn sm pri" data-a="logplan" data-sc="'+esc(s.id)+'">'+t('Log this game')+'</button>':'')+
      (packOf(s)?'<button class="btn sm" data-a="pack" data-sc="'+esc(s.id)+'">'+ICON_BOX+t('Packing list')+'</button>':'')+
      (plan?'':x?'<button class="btn sm again" data-a="again" data-sc="'+esc(s.id)+'" title="'+t('Same players, investigators, rules and place as last time')+'">'+ICON_AGAIN+t('Play again')+'</button>':'<button class="btn sm" data-a="log" data-sc="'+esc(s.id)+'">'+t('Log a play')+'</button>')+
'</div></li>';
  };
  var ul=function(items){return '<ul class="scs">'+items.map(row).join('')+'</ul>';};
  var sub=function(title,items){return items.length?'<h3 class="subhead">'+esc(title)+' <span class="note">'+items.length+'</span></h3>'+ul(items):'';};
  var box=function(key,title,items,body,note){
    if(!items.length)return '';
    return '<details class="sec box" data-box="'+key+'"'+(boxes[key]?' open':'')+'><summary><h2>'+esc(title)+'</h2><span class="note">'+tn('{n} scenario','{n} scenarios',items.length)+(note?' · '+note:'')+'</span><span class="chev" aria-hidden="true"></span></summary>'+body+'</details>';
  };
  var sorted=function(items){return items.slice().sort(SORT[sf.sort]||byName);};
  // inside a box: grouped by box (official) or by language, or one sorted list
  var byLang=function(items){var g={};items.forEach(function(s){var k=s.lang||'Not stated';(g[k]=g[k]||[]).push(s);});
    return Object.keys(g).sort(function(a,b){return a==='Not stated'?1:b==='Not stated'?-1:g[b].length-g[a].length||a.localeCompare(b);}).map(function(k){return sub(cap(k==='Not stated'?t(k):langName(k)),g[k].sort(byName));}).join('');};
  var off=list.filter(function(s){return s.from==='official';}),val=list.filter(function(s){return s.from==='valkyrie';});
  var offBody=sf.sort==='box'?MOM.PRODUCTS.map(function(p){return sub(p.name,off.filter(function(s){return s.product===p.id;}).sort(byName));}).join('')+sub(t('Other'),off.filter(function(s){return !s.product;}).sort(byName)):ul(sorted(off));
  var valBody=sf.sort==='lang'?byLang(val):ul(sf.sort==='box'?val.slice().sort(byName):sorted(val));
  // Starred: always on top, whatever the filters; planned games first by date, then the rest newest-starred first
  var stars=starredMap(),starredList=Object.keys(stars).map(function(id){var sc=scenById(id);if(!sc)return null;var o={};for(var k in sc)o[k]=sc[k];o.from=sc.type;return o;}).filter(Boolean)
    .sort(function(a,b){var pa=stars[a.id].plan,pb=stars[b.id].plan;if(pa&&pb)return (pa.date+(pa.time||'')).localeCompare(pb.date+(pb.time||''));if(pa||pb)return pa?-1:1;return (stars[b.id].at||0)-(stars[a.id].at||0);});
  var nPlanned=starredList.filter(function(x){return stars[x.id].plan;}).length;
  h+=box('starred',t('Starred'),starredList,ul(starredList),nPlanned?tn('{n} scheduled','{n} scheduled',nPlanned):t('tap Schedule to set a date'));
  h+=box('official',t('Official'),off,offBody,t('won {n} of {total}',{n:beat,total:offIds.length}));
  h+=box('valkyrie',t('Valkyrie'),val,valBody,t('ratings from Valkyrie players'));
  if(val.length)h+='<p class="note credit">'+t('Valkyrie scenario details, ratings and descriptions come from the <a href="https://github.com/NPBruce/valkyrie-store" target="_blank" rel="noopener">Valkyrie scenario catalogue</a> (Apache License 2.0); descriptions are by each scenario’s author.')+'</p>';
  return h;
}

// ---------- starred scenarios and plans ----------
// users/{uid}.starred = {scenarioId: {at, plan?: {date 'YYYY-MM-DD', time 'HH:MM' or '', location, groupId, note}}}
var ICON_STAR_OFF='<svg class="ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/></svg>';
var ICON_STAR_ON=ICON_STAR_OFF.replace('fill="none"','fill="currentColor"');
var ICON_CAL='<svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
function starredMap(){return (profile&&profile.starred&&typeof profile.starred==='object')?profile.starred:{};}
function starBtn(id,on){return '<button class="star'+(on?' on':'')+'" data-a="star" data-sc="'+esc(id)+'" aria-pressed="'+on+'" title="'+(on?t('Starred: you want to play this soon. Tap to unstar.'):t('Star it to plan playing it soon'))+'">'+(on?ICON_STAR_ON:ICON_STAR_OFF)+'<span class="sr">'+(on?t('Unstar'):t('Star'))+'</span></button>';}
function saveStarred(m){profile=profile||{};profile.starred=m;render();return fb.db.doc('users/'+me.uid).update({starred:m}).catch(function(e){toast(friendly(e));});}
function toggleStar(id){var m={},cur=starredMap();for(var k in cur)m[k]=cur[k];if(m[id])delete m[id];else m[id]={at:Date.now()};saveStarred(m);}
// "7 pm" in English; other languages write the time their own way (19:00)
function fmtTime(hm){if(!hm)return '';var h=+hm.slice(0,2),mi=hm.slice(3,5);
  if(I18N.lang!=='en'){var d=new Date(2000,0,1,h,+mi);try{return d.toLocaleTimeString(I18N.locale,{hour:'2-digit',minute:'2-digit'});}catch(e){return hm;}}
  return ((h%12)||12)+(mi!=='00'?':'+mi:'')+(h<12?' am':' pm');}
function planText(pl){
  var d=new Date(pl.date+'T12:00:00'),g=groups.filter(function(x){return x.id===pl.groupId;})[0];
  return [isNaN(d)?pl.date:d.toLocaleDateString(I18N.locale, {weekday:'short',month:'short',day:'numeric'}),fmtTime(pl.time),pl.location?t('at {place}',{place:pl.location}):'',g?g.name:''].filter(Boolean).join(' · ');
}
// The next scheduled game today or later, for the Plays tab.
function nextPlan(){var td=today(),m=starredMap(),best=null;
  Object.keys(m).forEach(function(id){var pl=m[id].plan,sc=scenById(id);if(!pl||!sc||pl.date<td)return;if(!best||(pl.date+(pl.time||''))<(best.plan.date+(best.plan.time||'')))best={id:id,sc:sc,plan:pl};});return best;}
function planDialog(id){
  var sc=scenById(id),cur=(starredMap()[id]||{}).plan||{};if(!sc)return;
  var d=openDialog('<form class="stack"><div class="dlg-head"><h2>'+t('Schedule: {name}',{name:esc(scName(sc.id,sc.name))})+'</h2><button class="x" type="button" data-close aria-label="'+t('Close')+'">×</button></div>'+
    '<div class="grid2"><label class="field"><span class="lbl">'+t('Date')+'</span><input class="f" type="date" name="pdate" required min="'+today()+'" value="'+esc(cur.date||'')+'"></label>'+
    '<label class="field"><span class="lbl">'+t('Time (optional)')+'</span><input class="f" type="time" name="ptime" value="'+esc(cur.time||'')+'"></label></div>'+
    '<label class="field"><span class="lbl">'+t('Where (optional)')+'</span><input class="f" name="ploc" list="dl-ploc" maxlength="60" value="'+esc(cur.location||'')+'" autocomplete="off"></label>'+
    '<datalist id="dl-ploc">'+places().map(function(n){return '<option value="'+esc(n)+'">';}).join('')+'</datalist>'+
    (groups.length?'<label class="field"><span class="lbl">'+t('Group (optional)')+'</span><select class="f" name="pgrp"><option value="">'+t('No group')+'</option>'+groups.slice().sort(byName).map(function(g){return '<option value="'+esc(g.id)+'"'+(g.id===cur.groupId?' selected':'')+'>'+esc(g.name)+'</option>';}).join('')+'</select></label>':'')+
    '<label class="field"><span class="lbl">'+t('Note (optional)')+'</span><input class="f" name="pnote" maxlength="200" value="'+esc(cur.note||'')+'" placeholder="'+t('e.g. bring snacks, use modified rules')+'"></label>'+
    '<div class="row end">'+(cur.date?'<button class="btn ghost dng" type="button" data-unplan style="margin-right:auto">'+t('Remove date')+'</button>':'')+'<button class="btn" type="button" data-close>'+t('Cancel')+'</button><button class="btn pri" type="submit">'+t('Save')+'</button></div></form>',t('Schedule'));
  var f=d.querySelector('form');
  var put=function(plan){var m={},c=starredMap();for(var k in c)m[k]=c[k];m[id]={at:(m[id]&&m[id].at)||Date.now()};if(plan)m[id].plan=plan;d.close();saveStarred(m);};
  f.addEventListener('submit',function(e){e.preventDefault();
    put({date:f.pdate.value,time:f.ptime.value||'',location:f.ploc.value.trim().slice(0,60),groupId:f.pgrp?f.pgrp.value:'',note:f.pnote.value.trim().slice(0,200)});toast(t('Scheduled.'));});
  var un=f.querySelector('[data-unplan]');if(un)un.addEventListener('click',function(){put(null);toast(t('Date removed; still starred.'));});
}
// Calendar: a Google Calendar link, or an .ics file for Apple Calendar and Outlook. Length from how long the scenario usually takes.
function calEvent(id){
  var sc=scenById(id),pl=(starredMap()[id]||{}).plan;if(!sc||!pl)return null;
  var mins=Math.round((typicalMins(sc)||180)/30)*30||180,g=groups.filter(function(x){return x.id===pl.groupId;})[0];
  var who=g?groupMembers(g).map(function(x){return x.name;}).join(', '):'';
  var details=['Mansions of Madness: '+sc.name+(sc.type==='valkyrie'?' (Valkyrie)':''),who?t('Players: {names}',{names:who}):'',pl.note||'',t('Logged with Mansions of Madness Casebook')].filter(Boolean).join('\n');
  var p2=function(n){return ('0'+n).slice(-2);},stamp=function(dt){return dt.getFullYear()+p2(dt.getMonth()+1)+p2(dt.getDate())+'T'+p2(dt.getHours())+p2(dt.getMinutes())+'00';};
  var start,end,allDay=!pl.time;
  if(allDay){start=pl.date.replace(/-/g,'');var e=new Date(pl.date+'T12:00:00');e.setDate(e.getDate()+1);end=e.getFullYear()+p2(e.getMonth()+1)+p2(e.getDate());}
  else{var s0=new Date(pl.date+'T'+pl.time+':00');start=stamp(s0);end=stamp(new Date(s0.getTime()+mins*60000));}
  return {title:'Mansions of Madness: '+scName(sc.id,sc.name),details:details,location:pl.location||'',start:start,end:end,allDay:allDay,uid:id+'-'+pl.date+'@momcasebook'};
}
function googleCal(ev){var tz='';try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone;}catch(e){}
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text='+encodeURIComponent(ev.title)+'&dates='+ev.start+'/'+ev.end+'&details='+encodeURIComponent(ev.details)+(ev.location?'&location='+encodeURIComponent(ev.location):'')+(tz&&!ev.allDay?'&ctz='+encodeURIComponent(tz):'');}
function icsText(ev){var x=function(t){return String(t).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');};
  var now=new Date(),z=function(n){return ('0'+n).slice(-2);},ds=now.getUTCFullYear()+z(now.getUTCMonth()+1)+z(now.getUTCDate())+'T'+z(now.getUTCHours())+z(now.getUTCMinutes())+z(now.getUTCSeconds())+'Z';
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Mansions of Madness Casebook//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:'+ev.uid,'DTSTAMP:'+ds,
    (ev.allDay?'DTSTART;VALUE=DATE:':'DTSTART:')+ev.start,(ev.allDay?'DTEND;VALUE=DATE:':'DTEND:')+ev.end,'SUMMARY:'+x(ev.title),ev.location?'LOCATION:'+x(ev.location):'','DESCRIPTION:'+x(ev.details),'END:VEVENT','END:VCALENDAR'].filter(Boolean).join('\r\n')+'\r\n';}
function calMenu(btn){
  var ev=calEvent(btn.dataset.sc);if(!ev)return;var old=document.querySelector('.calmenu');if(old){old.remove();if(old.dataset.for===btn.dataset.sc)return;}
  var m=document.createElement('span');m.className='calmenu';m.dataset.for=btn.dataset.sc;m.setAttribute('role','menu');
  m.innerHTML='<a role="menuitem" href="'+esc(googleCal(ev))+'" target="_blank" rel="noopener">Google Calendar</a><button role="menuitem" type="button" data-ics>'+t('Apple Calendar or Outlook (.ics)')+'</button>';
  btn.parentNode.appendChild(m);
  m.querySelector('[data-ics]').addEventListener('click',function(){download(MOM.slug(ev.title)+'.ics',icsText(ev),'text/calendar');m.remove();});
  setTimeout(function(){document.addEventListener('click',function off(e){if(!m.contains(e.target)&&e.target!==btn){m.remove();document.removeEventListener('click',off);}});},0);
}
// Log a planned game: the form opens with the scenario, the group's players, the place and the date; saving it takes the scenario off the starred list.
function logFromPlan(id){
  var pl=(starredMap()[id]||{}).plan||{},sc=scenById(id);if(!sc)return;
  var g=groups.filter(function(x){return x.id===pl.groupId;})[0];
  openPlay({_again:false,_fromPlan:id,scenarioId:sc.id,scenarioName:sc.name,scenarioType:sc.type,date:pl.date&&pl.date<=today()?pl.date:today(),
    party:g?groupMembers(g).map(function(x){return {player:x.name,investigator:''};}):null,location:pl.location||'',notes:pl.note||'',attempts:1});
}
// Our own short premise for an official scenario (js/official-info.js), if there is one.
// ---------- packing lists (Valkyrie scenarios; js/packlists.js, built by scripts/fetch-packlists.py) ----------
// Which tiles and monster figures to take out of the box, with the community Tiles Index numbers, from Dan's
// valkyrie-tools packlist. Ticks are kept on this device only, per scenario, so you can pack at the table.
var ICON_BOX='<svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/></svg>';
function packOf(s){var ty=s&&(s.type||s.from);return ty==='valkyrie'&&s.vkey&&(window.MOM_PACKLISTS||{})[s.vkey]||null;}
// the set whose symbol is printed on a tile or figure, as a short colour-coded tag (Fantasy Flight's symbols themselves
// can't be used here); first-edition content keeps its first-edition symbol in the boxes that reprint it
var SETS={'2e':['Core','Second Edition Core'],'1e':['1E','First Edition Core'],'cotw':['CotW','Call of the Wild'],'fa':['FA','Forbidden Alchemy'],
  btt:['BtT','Beyond the Threshold'],soa:['SoA','Streets of Arkham'],sot:['SoT','Sanctum of Twilight'],hj:['HJ','Horrific Journeys'],pots:['PotS','Path of the Serpent']};
// the full name (in the reader's language) is the tag's tooltip; the short tag stays the same everywhere
function setTag(e){var st=SETS[e];return st?'<span class="set s-'+e+'" title="'+esc(t(st[1]))+'">'+esc(st[0])+'</span>':'<span class="set s-fan" title="'+t('Not from a Fantasy Flight box')+'">'+t('Fan')+'</span>';}
function boxName(id){return id?(MOM.productName(id)||id):t('fan-made tile');}
function canPlay(s){var p=packOf(s);if(!p||p.other)return false;var o=owned();return p.need.every(function(b){return o.indexOf(b)>=0;});}
function needsHtml(s){var p=packOf(s);if(!p||!p.need.length)return '';var o=owned();
  var parts=p.need.map(function(b){var have=o.indexOf(b)>=0;return have?esc(boxName(b)):'<span class="missing" title="'+t('Not ticked in Settings, Your collection')+'">'+esc(boxName(b))+'</span>';});
  if(p.other)parts.push('<span class="missing">'+t('fan-made pack {name}',{name:esc(p.other.join(', '))})+'</span>');
  return '<span class="note needs">'+t('Needs {boxes}',{boxes:parts.join(' + ')})+'</span>';}
function packDialog(id){
  var s=scenById(id),p=packOf(s);if(!p)return;var KEY='mom-pack-'+s.vkey,done={};
  var loadDone=function(){done={};try{(JSON.parse(localStorage.getItem(KEY)||'[]')||[]).forEach(function(k){done[k]=1;});}catch(e){}};loadDone();
  // tiles come in the order they first come into play in the scenario; By tile number sorts them as the Tiles Index
  // does (small, medium, large), for finding them in the box. The choice is kept on this device.
  var mode='play';try{if(localStorage.getItem('mom-pack-order')==='num')mode='num';}catch(e){}
  var idx=function(i){var m=/^(\d+)([SML])$/.exec(i||'');return m?m[1]+' '+m[2]:'';};
  // pictures in list order, for the large view (tap a picture to open it; tap the rest of the row to tick it)
  var zooms=[];
  var item=function(k,name,sub,badge,pic,wide){return '<li><label class="pk'+(done[k]?' on':'')+'"><input type="checkbox" data-k="'+k+'"'+(done[k]?' checked':'')+'>'+
    (badge?'<span class="pk-idx num">'+badge+'</span>':'')+(pic?(wide?'<span class="pk-picbox">':'')+'<button type="button" class="pk-zoom'+(wide?' pk-tile':'')+'" data-zoom="'+(zooms.push({src:pic.replace(/\/([^/]+)$/,'/full/$1'),name:name})-1)+'" aria-label="'+t('Show {name} larger',{name:esc(name)})+'">'+
      '<img class="pk-pic'+(wide?' pk-tile':'')+'" src="'+pic+'" alt="" loading="lazy" onerror="this.parentNode.remove()"'+(wide?'':' width="48" height="48"')+'></button>'+(wide?'</span>':''):'')+'<span class="pk-txt"><b>'+esc(name)+'</b><span class="note">'+sub+'</span></span></label></li>';};
  // where it is: the set's tag, the box when that differs (first-edition sets are in Recurring Nightmares or Suppressed Memories), the back
  var where=function(o){var st=SETS[o.e],box=o.x&&st&&['1e','fa','cotw'].indexOf(o.e)>=0?' · '+t('in {box}',{box:esc(boxName(o.x))}):'';return setTag(o.e)+(st?'':' '+t('fan-made tile'))+box;};
  // the tile's art (img/tiles/<set>-<name>.webp); fan-made tiles have none
  var tilePic=function(x){return x.e?'img/tiles/'+x.e+'-'+String(x.n||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'.webp':'';};
  var tile=function(x,i){return item('t'+i,x.n,where(x)+(x.b?' · '+t('other side: {name}',{name:esc(x.b)}):'')+(x.alt&&x.alt.length?' · '+t('or {tiles}',{tiles:x.alt.map(function(a){return idx(a.i)+' '+setTag(a.e);}).join(', ')}):''),idx(x.i)||'—',tilePic(x),1);};
  var numKey=function(x){var m=/^(\d+)([SML])$/.exec(x.i||'');return m?'SML'.indexOf(m[2])*1000+(+m[1]):9999;};
  var tileLists=function(){var normal=[],six=[];
    p.tiles.map(function(x,i){return {x:x,i:i};}).sort(function(a,b){return mode==='num'?numKey(a.x)-numKey(b.x)||a.i-b.i:a.i-b.i;})
      .forEach(function(o){(o.x.six?six:normal).push(tile(o.x,o.i));});
    return (normal.length?'<h3 class="pk-h">'+t('Tiles')+' <span class="note">'+normal.length+'</span></h3><ul class="pk-list">'+normal.join('')+'</ul>':'')+
      (six.length?'<h3 class="pk-h">'+t('Tiles for 6 players only')+' <span class="note">'+six.length+'</span></h3><ul class="pk-list">'+six.join('')+'</ul>':'');};
  var numbered=p.tiles.some(function(x){return numKey(x)<9999;});
  // the figure's token art (img/monsters/, named after Valkyrie's English monster name, e.g. hound-of-tindalos.webp)
  var monPic=function(n){return 'img/monsters/'+String(n||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'.webp';};
  var mons=p.monsters.map(function(m,i){return item('m'+i,m.n,where(m)+(m.as?' · '+t('plays {names}',{names:esc(m.as.join(', '))}):''),'',monPic(m.n));});
  var o=owned(),miss=p.need.filter(function(b){return o.indexOf(b)<0;});
  var d=openDialog('<div class="dlg-head"><h2>'+t('Packing list: {name}',{name:esc(scName(s.id,s.name))})+'</h2><button class="x" type="button" data-close aria-label="'+t('Close')+'">×</button></div>'+
    '<p class="note">'+t('Needs {boxes}.',{boxes:p.need.map(function(b){return esc(boxName(b));}).join(' + ')+(p.other?' + '+t('fan-made pack {name}',{name:esc(p.other.join(', '))}):'')})+
    (miss.length?' <span class="missing">'+t('Not ticked in your collection: {boxes}.',{boxes:esc(miss.map(boxName).join(', '))})+'</span>':'')+'</p>'+
    '<div class="row pk-bar"><span class="note pk-count"></span>'+
      (numbered?'<label class="pk-order"><span class="note">'+t('Tile order')+'</span><select class="f" data-pk="order"><option value="play"'+(mode==='play'?' selected':'')+'>'+t('As they come into play')+'</option><option value="num"'+(mode==='num'?' selected':'')+'>'+t('By tile number')+'</option></select></label>':'')+
      '<button class="btn sm ghost" type="button" data-pk="clear">'+t('Clear ticks')+'</button></div>'+
    '<div class="pk-tiles">'+tileLists()+'</div>'+
    (mons.length?'<h3 class="pk-h">'+t('Monster figures')+' <span class="note">'+mons.length+'</span></h3><ul class="pk-list">'+mons.join('')+'</ul>':'')+
    '<p class="note fine">'+t('Tile and monster art © Fantasy Flight Games.')+'</p>'+
    '<p class="note fine">'+t('Tile numbers follow the community <a href="https://boardgamegeek.com/filepage/147448/mansions-of-madness-tiles-index" target="_blank" rel="noopener">Mansions of Madness Tiles Index v5.2</a> (S, M, L for small, medium, large); the colored tag is the set whose symbol is printed on the tile or figure. A — means a fan-made tile that isn’t in any box. From the scenario file in the Valkyrie catalogue.')+'</p>'+
    '<div class="row end"><button class="btn" type="button" data-close>'+t('Done')+'</button></div>',t('Packing list'));
  var count=function(){var all=d.querySelectorAll('.pk input'),n=0;all.forEach(function(c){if(c.checked)n++;});d.querySelector('.pk-count').textContent=t('{n} of {total} packed',{n:n,total:all.length});};
  var save=function(){var l=[];d.querySelectorAll('.pk input:checked').forEach(function(c){l.push(c.dataset.k);});try{if(l.length)localStorage.setItem(KEY,JSON.stringify(l));else localStorage.removeItem(KEY);}catch(e){}};
  // the large view goes through the pictures in the order they're shown
  d.addEventListener('click',function(e){var z=e.target.closest('[data-zoom]');if(!z)return;e.preventDefault();e.stopPropagation();
    var all=[].slice.call(d.querySelectorAll('[data-zoom]'));zoomView(all.map(function(b){return zooms[+b.dataset.zoom];}),all.indexOf(z),z);});
  d.addEventListener('change',function(e){var c=e.target;
    if(c.dataset.pk==='order'){mode=c.value;try{localStorage.setItem('mom-pack-order',mode);}catch(x){}loadDone();d.querySelector('.pk-tiles').innerHTML=tileLists();count();return;}
    if(!c.dataset.k)return;c.closest('.pk').classList.toggle('on',c.checked);count();save();});
  d.querySelector('[data-pk=clear]').addEventListener('click',function(){d.querySelectorAll('.pk input').forEach(function(c){c.checked=false;c.closest('.pk').classList.remove('on');});count();save();});
  count();
}
// A picture full-size over everything: arrows, swipe or the buttons go through the list; Escape, × or a tap outside
// the picture closes it (and only it: the packing list underneath stays open).
function zoomView(list,i,from){
  var bg=document.createElement('div');bg.className='lb';bg.setAttribute('role','dialog');bg.setAttribute('aria-modal','true');
  var many=list.length>1;
  bg.innerHTML='<button class="lb-x" type="button" aria-label="'+t('Close')+'">×</button>'+
    (many?'<button class="lb-nav lb-prev" type="button" aria-label="'+t('Previous picture')+'">‹</button><button class="lb-nav lb-next" type="button" aria-label="'+t('Next picture')+'">›</button>':'')+
    '<img class="lb-img" alt=""><p class="lb-cap"></p>';
  var img=bg.querySelector('.lb-img'),cap=bg.querySelector('.lb-cap');
  var show=function(n){i=(n+list.length)%list.length;var z=list[i];img.src=z.src;img.alt=z.name;bg.setAttribute('aria-label',z.name);
    cap.innerHTML='<b>'+esc(z.name)+'</b>'+(many?' <span>'+t('Picture {n} of {total}',{n:i+1,total:list.length})+'</span>':'');};
  var close=function(){bg.remove();window.removeEventListener('keydown',key,true);if(from&&from.focus)try{from.focus();}catch(e){}};
  var key=function(e){if(e.key==='Escape'){e.stopPropagation();e.preventDefault();close();}
    else if(many&&e.key==='ArrowLeft'){e.stopPropagation();show(i-1);}else if(many&&e.key==='ArrowRight'){e.stopPropagation();show(i+1);}};
  window.addEventListener('keydown',key,true);
  bg.addEventListener('click',function(e){e.stopPropagation();
    if(e.target.closest('.lb-prev'))show(i-1);else if(e.target.closest('.lb-next'))show(i+1);else if(e.target!==img)close();});
  var x0=null;bg.addEventListener('touchstart',function(e){x0=e.touches.length===1?e.touches[0].clientX:null;},{passive:true});
  bg.addEventListener('touchend',function(e){if(x0==null||!many)return;var dx=e.changedTouches[0].clientX-x0;x0=null;if(Math.abs(dx)>50)show(dx<0?i+1:i-1);});
  document.body.appendChild(bg);show(i);bg.querySelector('.lb-x').focus();
}
function officialInfo(s){return s.type==='official'&&(window.MOM_OFFICIAL_INFO||{})[s.id]||null;}
// an official scenario's name in the reader's language (as in the companion app; js/lang/<code>.js), else its own name
function scName(id,name){return (id&&I18N.scenario(id))||name||'';}
// our premise in the reader's language (js/lang/<code>.js), else the English
function premiseText(s){var o=officialInfo(s);return o?(I18N.premise(s.id)||o.text):'';}
// Languages in the filter, most scenarios first, with counts.
function langChoices(){var c={};MOM.VALKYRIE.forEach(function(s){if(s.retired)return;langsOf(s).forEach(function(l){c[l]=(c[l]||0)+1;});});
  return Object.keys(c).sort(function(a,b){return c[b]-c[a]||a.localeCompare(b);}).map(function(l){return [l,cap(langName(l))+' ('+c[l]+')'];});}
// "Spanish", or "Spanish · also in English, French +2"
function langText(s){if(s.from!=='valkyrie'&&s.type!=='valkyrie'||!s.lang)return '';var o=langsOf(s).filter(function(l){return l!==s.lang;});
  return esc(cap(langName(s.lang)))+(o.length?' ('+t('also {languages}',{languages:esc(o.slice(0,2).map(langName).join(', '))+(o.length>2?' +'+(o.length-2):'')})+')':'');}
// Valkyrie's language names ("Spanish") in the reader's language, from the browser's own list of language names, so a
// language new to the catalogue needs nothing added here. Lowercase mid-sentence in most languages ("también chino");
// cap() gives a list item or heading its capital.
var LANG_CODES={English:'en',Spanish:'es',Portuguese:'pt',Italian:'it',French:'fr',Polish:'pl',Korean:'ko',Russian:'ru',Chinese:'zh',German:'de',Czech:'cs',
  Japanese:'ja',Dutch:'nl',Hungarian:'hu',Ukrainian:'uk',Turkish:'tr',Swedish:'sv',Norwegian:'no',Danish:'da',Finnish:'fi',Greek:'el',Catalan:'ca',Romanian:'ro'};
var langNames=null;try{langNames=new Intl.DisplayNames([I18N.locale||'en'],{type:'language'});}catch(e){}
function langName(l){if(I18N.lang==='en')return l;var c=LANG_CODES[l];try{if(c&&langNames)return langNames.of(c);}catch(e){}return l;}
function cap(s){s=String(s);return s.charAt(0).toLocaleUpperCase(I18N.locale)+s.slice(1);}
// Valkyrie's difficulty slider runs from 0 to 1.
function diffName(d){return d<0.35?t('Easy'):d<0.6?t('Medium'):d<0.8?t('Hard'):t('Very hard');}
// "90 min", "2.5 h", "60–90 min", "2–3 h", "90 min–2 h"
function lenText(m){
  var mins=function(x){return x<120;},num=function(x){return mins(x)?fmtNum(x):fmtNum(Math.round(x/30)/2);};
  var unit=function(x,n){return mins(x)?t('{n} min',{n:n}):t('{n} h',{n:n});};
  if(m[0]&&m[0]!==m[1])return mins(m[0])===mins(m[1])?unit(m[1],num(m[0])+'–'+num(m[1])):unit(m[0],num(m[0]))+'–'+unit(m[1],num(m[1]));
  return unit(m[1],num(m[1]));}
// ---------- Combinations (Stats tab): any two things against each other, a cross table ----------
// Rows and columns are picked from the dimensions below; each cell counts the plays that have both. "Include" adds
// things not played yet, so the empty cells show combinations still to try: the official scenarios and investigators
// from the boxes you own (and your saved players and boxes), optionally your starred Valkyrie scenarios, or every
// Valkyrie scenario. The choice is remembered on this device.
var xt={r:'scenario',c:'investigator',v:'plays',inc:'official'};
try{var xt0=JSON.parse(localStorage.getItem('mom-xtab')||'null');if(xt0)for(var kx in xt0)xt[kx]=xt0[kx];}catch(e){}
if(xt.all!=null){if(!xt.inc)xt.inc=xt.all?'official':'played';delete xt.all;}   // from the first version's checkbox
function saveXt(){try{localStorage.setItem('mom-xtab',JSON.stringify(xt));}catch(e){}}
var XDIMS=['scenario','investigator','player','expansion','party','where','rules','result','type'];
function xdimName(d){return {scenario:t('Scenario'),investigator:t('Investigator'),player:t('Player'),expansion:t('Expansion'),party:t('Party size'),where:t('Where'),rules:t('Rules'),result:t('Result'),type:t('Scenario type')}[d];}
// the values a play has for a dimension (several for investigators and players), as [key, label]
function xvals(d,p){
  var sc=scenById(p.scenarioId);
  if(d==='scenario')return [[p.scenarioId,scName(p.scenarioId,p.scenarioName)]];
  if(d==='investigator'){var seen={};return (p.party||[]).map(function(s){return (s.investigator||'').trim();}).filter(function(v){if(!v||seen[v])return false;seen[v]=1;return true;}).map(function(v){return [v,v];});}
  if(d==='player')return peopleAt(p).names.map(function(n){return [n.toLowerCase(),n];});
  if(d==='expansion'){if(p.scenarioType==='valkyrie')return [['valkyrie',t('Valkyrie')]];var pr=sc&&sc.product;return pr?[[pr,MOM.productName(pr)]]:[];}
  if(d==='party'){var n=peopleAt(p).count;return n?[[String(n),n===1?t('Solo'):tn('{n} player','{n} players',n)]]:[];}
  if(d==='where')return [[p.location||'',p.location||t('Not recorded')]];
  if(d==='rules')return [[p.rules||'',p.rules?rulesName(p.rules):t('Not recorded')]];
  if(d==='result')return RES[p.result]?[[p.result,t(RES[p.result][0])]]:[];
  if(d==='type')return [[p.scenarioType||'official',typeName(p.scenarioType||'official')]];
  return [];
}
// everything a dimension could have, in a sensible order, for "Include ones not played yet"
function xallVals(d){
  var own=owned();
  if(d==='scenario'){var out=[];MOM.PRODUCTS.forEach(function(pr){if(own.indexOf(pr.id)<0)return;MOM.OFFICIAL.filter(function(s){return s.product===pr.id;}).forEach(function(s){out.push([s.id,scName(s.id,s.name)]);});});
    // then Valkyrie ones, A to Z: the starred ones, or all of them (as in the Scenarios tab: none if switched off, retired ones only once played)
    var stars=starredMap(),valk=xt.inc==='all'&&showValk()?MOM.VALKYRIE.filter(function(s){return !s.retired;}):xt.inc==='starred'?MOM.VALKYRIE.filter(function(s){return stars[s.id];}):[];
    valk.slice().sort(byName).forEach(function(s){out.push([s.id,s.name]);});
    return out;}
  if(d==='investigator'){var o2=[];MOM.INVESTIGATOR_GROUPS.forEach(function(g){if(own.indexOf(g.product)>=0)g.list.forEach(function(n){o2.push([n,n]);});});return o2;}
  if(d==='player')return people.slice().sort(byName).map(function(x){return [x.name.toLowerCase(),x.name];});
  if(d==='expansion')return MOM.PRODUCTS.filter(function(pr){return own.indexOf(pr.id)>=0;}).map(function(pr){return [pr.id,pr.name];}).concat(showValk()?[['valkyrie',t('Valkyrie')]]:[]);
  if(d==='result')return Object.keys(RES).map(function(k){return [k,t(RES[k][0])];});
  return [];
}
function xtabHtml(){
  if(xt.r===xt.c)xt.c=xt.r==='investigator'?'scenario':'investigator';
  var rows={},cols={},rOrder=[],cOrder=[],cell={},rTot={},cTot={};
  var addKey=function(map,order,kv){if(!map[kv[0]]){map[kv[0]]=kv[1];order.push(kv[0]);}};
  if(xt.inc!=='played'){xallVals(xt.r).forEach(function(kv){addKey(rows,rOrder,kv);});xallVals(xt.c).forEach(function(kv){addKey(cols,cOrder,kv);});}
  var bump=function(o,k,won){var x=o[k]||(o[k]={n:0,w:0});x.n++;if(won)x.w++;};
  plays.forEach(function(p){var won=p.result==='pass',R=xvals(xt.r,p),C=xvals(xt.c,p);
    R.forEach(function(r){addKey(rows,rOrder,r);bump(rTot,r[0],won);});C.forEach(function(c){addKey(cols,cOrder,c);bump(cTot,c[0],won);});
    R.forEach(function(r){C.forEach(function(c){bump(cell,r[0]+'\u0001'+c[0],won);});});});
  // without "not played yet", most played first; with it, the catalogue's own order (then anything else, most played first)
  var byCount=function(tot){return function(a,b){return ((tot[b]||{}).n||0)-((tot[a]||{}).n||0);};};
  if(xt.inc==='played'){rOrder.sort(byCount(rTot));cOrder.sort(byCount(cTot));}
  var sel=function(id,val,opts){return '<select class="f" id="'+id+'">'+opts.map(function(o){return '<option value="'+o[0]+'"'+(o[0]===val?' selected':'')+'>'+esc(o[1])+'</option>';}).join('')+'</select>';};
  var dims=XDIMS.map(function(d){return [d,xdimName(d)];});
  var h='<section class="sec xtab"><div class="sec-head"><h2>'+t('Combinations')+'</h2></div>'+
    '<p class="note">'+t('Pick what goes in the rows and the columns. An empty cell is a combination you haven’t played yet.')+'</p>'+
    '<div class="filters xt-pick"><label class="field"><span class="lbl">'+t('Rows')+'</span>'+sel('xt-r',xt.r,dims)+'</label>'+
    '<button class="btn sm xt-swap" type="button" data-a="xtswap" title="'+t('Swap rows and columns')+'" aria-label="'+t('Swap rows and columns')+'">⇄</button>'+
    '<label class="field"><span class="lbl">'+t('Columns')+'</span>'+sel('xt-c',xt.c,dims.filter(function(d){return d[0]!==xt.r;}))+'</label>'+
    '<label class="field"><span class="lbl">'+t('Show')+'</span>'+sel('xt-v',xt.v,[['plays',t('Plays')],['won',t('Won|total')],['rate',t('Win rate')]])+'</label>'+
    '<label class="field"><span class="lbl">'+t('Include')+'</span>'+sel('xt-inc',xt.inc,[['played',t('Played only')],['official',t('Your boxes')],['starred',t('Boxes + starred')],['all',t('Everything|xt')]])+'</label></div>';
  if(!rOrder.length||!cOrder.length)return h+'<p class="note">'+t('Nothing to show yet for these two.')+'</p></section>';
  var max=0;Object.keys(cell).forEach(function(k){if(cell[k].n>max)max=cell[k].n;});
  var shade=function(x){if(!x)return '';var a=xt.v==='rate'?Math.round(15+60*x.w/x.n):Math.round(12+58*(xt.v==='won'?x.w:x.n)/Math.max(1,max));
    return ' style="background:color-mix(in srgb,var('+(xt.v==='rate'?'--ok':'--accent')+') '+a+'%,transparent)"';};
  var val=function(x){if(!x)return '<span class="xt-none" aria-label="'+t('Not played')+'">·</span>';return xt.v==='rate'?pct(x.w,x.n):xt.v==='won'?x.w:x.n;};
  var tip=function(rk,ck,x){return esc(rows[rk]+' · '+cols[ck]+': '+(x?tn('{n} play · {won} won','{n} plays · {won} won',x.n,{won:x.w}):t('Not played')));};
  var vertical=cOrder.length>6;
  h+='<div class="xt-wrap"><table class="xt'+(vertical?' xt-v':'')+'"><thead><tr><th class="xt-corner"><span>'+esc(xdimName(xt.r))+' \\ '+esc(xdimName(xt.c))+'</span></th>'+
    cOrder.map(function(ck){return '<th scope="col" title="'+esc(cols[ck])+'"><span>'+esc(cols[ck])+'</span></th>';}).join('')+'<th scope="col" class="xt-tot"><span>'+t('Total')+'</span></th></tr></thead><tbody>'+
    rOrder.map(function(rk){return '<tr><th scope="row">'+esc(rows[rk])+'</th>'+cOrder.map(function(ck){var x=cell[rk+'\u0001'+ck];return '<td class="num"'+shade(x)+' title="'+tip(rk,ck,x)+'">'+val(x)+'</td>';}).join('')+
      '<td class="num xt-tot">'+val(rTot[rk])+'</td></tr>';}).join('')+
    '</tbody><tfoot><tr><th scope="row">'+t('Total')+'</th>'+cOrder.map(function(ck){return '<td class="num xt-tot">'+val(cTot[ck])+'</td>';}).join('')+'<td class="num xt-tot">'+(xt.v==='rate'?pct(plays.filter(function(p){return p.result==='pass';}).length,plays.length):xt.v==='won'?plays.filter(function(p){return p.result==='pass';}).length:plays.length)+'</td></tr></tfoot></table></div>'+
    '<p class="note fine">'+t('A play counts once in each cell it belongs to, so a game with four investigators adds to four columns; totals count each play once.')+'</p></section>';
  return h;
}
function statsHtml(){
  if(!plays.length)return '<section class="sec empty"><h2>'+t('No stats yet')+'</h2><p class="note">'+t('They fill in as you log plays.')+'</p></section>';
  var n=plays.length,pass=plays.filter(function(p){return p.result==='pass';}).length,fail=plays.filter(function(p){return p.result==='fail';}).length;
  var st=scenStats(),beaten=Object.keys(st).filter(function(k){return st[k].pass;}).length;
  var tile=function(k,v,s){return '<div class="stat"><span class="lbl">'+k+'</span><b class="num">'+v+'</b>'+(s?'<small>'+s+'</small>':'')+'</div>';};
  var h='<div class="stats">'+tile(t('Plays'),n)+tile(t('Won|total'),pass,pct(pass,n))+tile(t('Lost|total'),fail,pct(fail,n))+tile(t('Scenarios played'),Object.keys(st).length,tn('{n} won','{n} won',beaten))+'</div>';
  h+=xtabHtml();
  var table=function(title,rows,col){
    if(!rows.length)return '';var max=Math.max.apply(null,rows.map(function(r){return r.n;}));
    return '<section class="sec"><h2>'+esc(title)+'</h2><table class="tbl"><thead><tr><th>'+esc(col)+'</th><th class="r">'+t('Plays')+'</th><th class="r">'+t('Won|total')+'</th><th class="w">'+t('Win rate')+'</th></tr></thead><tbody>'+
      rows.map(function(r){return '<tr><td>'+esc(r.k)+'</td><td class="r num">'+r.n+'</td><td class="r num">'+r.pass+'</td><td class="w"><span class="barwrap"><span class="track"><span class="meter" style="width:'+Math.max(4,Math.round(r.n*100/max))+'%"><span class="meterin" style="width:'+(r.n?Math.round(r.pass*100/r.n):0)+'%"></span></span></span><span class="num">'+pct(r.pass,r.n)+'</span></span></td></tr>';}).join('')+'</tbody></table></section>';
  };
  var tally=function(keyFn){var c={};plays.forEach(function(p){keyFn(p).forEach(function(k){if(!k)return;var r=c[k]||(c[k]={k:k,n:0,pass:0});r.n++;if(p.result==='pass')r.pass++;});});
    return Object.keys(c).map(function(k){return c[k];}).sort(function(a,b){return b.n-a.n||b.pass-a.pass||a.k.localeCompare(b.k);});};
  var uniq=function(a){return a.filter(function(x,i){return x&&a.indexOf(x)===i;});};
  var sizes=tally(function(p){var n2=peopleAt(p).count;return n2?[n2===1?t('Solo'):tn('{n} player','{n} players',n2)]:[];});
  // a person counts once per play even with two characters; the same name in any case is the same person
  var spell={};plays.forEach(function(p){peopleAt(p).names.forEach(function(n){var k=n.toLowerCase();if(!spell[k])spell[k]=n;});});
  h+=table(t('Who you played with'),tally(function(p){return peopleAt(p).names.map(function(n){return spell[n.toLowerCase()];});}),t('Player'));
  h+=table(t('Investigators'),tally(function(p){return uniq((p.party||[]).map(function(s){return (s.investigator||'').trim();}));}),t('Investigator'));
  h+=table(t('Scenarios'),tally(function(p){return [scName(p.scenarioId,p.scenarioName)];}),t('Scenario'));
  h+=table(t('Party size'),sizes,t('Party'));
  if(plays.some(function(p){return p.location;}))h+=table(t('Where you played'),tally(function(p){return [p.location||t('Not recorded')];}),t('Where'));
  h+=table(t('Rules'),tally(function(p){return [p.rules?rulesName(p.rules):t('Not recorded')];}),t('Rules'));
  h+=table(t('Scenario type'),tally(function(p){return [typeName(p.scenarioType||'official')];}),t('Type'));
  if(!names('player').length)h+='<p class="note">'+t('Add who played to your plays to see stats per person.')+'</p>';
  return h;
}

function settingsHtml(){
  var own=owned(),imp=ui.imp;
  var h='';
  h+='<section class="sec"><h2>'+t('Language')+'</h2><p class="note">'+t('The language the site is shown in, on this device and wherever you sign in. Names, notes and what you type stay as they are.')+'</p>'+
    '<label class="field langfield"><span class="lbl">'+t('Language')+'</span>'+I18N.picker('s-lang','f')+'</label></section>';
  h+='<section class="sec"><h2>'+t('Products you own')+'</h2><p class="note">'+t('The Scenarios tab and the scenario picker list what’s ticked here.')+'</p><div class="checks">'+
    MOM.PRODUCTS.map(function(p){return '<label class="check"><input type="checkbox" data-own="'+p.id+'"'+(own.indexOf(p.id)>=0?' checked':'')+'><span>'+esc(p.name)+' <small class="note">'+p.scenarios.length+'</small></span></label>';}).join('')+
    '<label class="check"><input type="checkbox" id="s-valk"'+(showValk()?' checked':'')+'><span>'+t('Valkyrie fan scenarios')+' <small class="note">'+MOM.VALKYRIE.length+'</small></span></label></div></section>';
  h+='<section class="sec" id="import"><h2>'+t('Import from a spreadsheet')+'</h2>'+
    '<p class="note">'+t('Paste the link to a Google Sheet shared as “Anyone with the link”, or choose a CSV file. The first row needs headings such as <i>Scenario, Played, Characters, Pass/Fail, Notes, Rules</i> (also <i>Date</i> and <i>Players</i> if you have them). Rows marked N under Played are skipped, and rows you’ve already imported are never added twice.')+'</p>'+
    '<form class="row bottom" data-form="sheet"><label class="field grow"><span class="lbl">'+t('Google Sheets link')+'</span><input class="f" id="imp-link" type="url" placeholder="https://docs.google.com/spreadsheets/d/…" value="'+esc(ui.impLink||'')+'"></label><button class="btn" type="submit"'+(ui.busy?' disabled':'')+'>'+t('Load sheet')+'</button></form>'+
    '<div class="row"><label class="btn file">'+t('Choose a CSV file')+'<input type="file" id="imp-file" accept=".csv,text/csv" hidden></label></div>';
  if(imp){
    if(imp.error)h+='<p class="err" role="alert">'+esc(imp.error)+'</p>';
    else{
      var fresh=imp.plays.filter(function(p){return !p.dupe;});
      h+='<div class="preview"><p><b>'+tn('{n} play to import','{n} plays to import',fresh.length)+'</b>'+(imp.plays.length-fresh.length?', '+tn('{n} already in your log','{n} already in your log',imp.plays.length-fresh.length):'')+(imp.skipped?', '+tn('{n} not-played row skipped','{n} not-played rows skipped',imp.skipped):'')+'.</p>'+
        imp.notes.map(function(n){return '<p class="note">'+esc(n)+'</p>';}).join('')+
        (fresh.length?'<ul class="mini">'+fresh.map(function(p){return '<li>'+resChip(p.result)+' <b>'+esc(scName(p.scenarioId,p.scenarioName))+'</b>'+(p.sheetName?' <span class="chip muted">'+t('choose below')+'</span>':'')+(p.attempts>1?' ('+tn('{n} try','{n} tries',p.attempts)+')':'')+(partyText(p)?' · '+partyText(p):'')+'</li>';}).join('')+'</ul>':'')+
        (fresh.length&&imp.cols.players==null&&imp.cols.party==null?'<p class="note">'+t('The sheet doesn’t say who played, so players are left blank. Tap a play afterwards to add them.')+'</p>':'')+
        unmatchedHtml(imp)+
        '<div class="row">'+(fresh.length?'<button class="btn pri" data-a="doimport"'+(ui.busy?' disabled':'')+'>'+(Object.keys(imp.unmatched||{}).length?t('Import'):tn('Import {n} play','Import {n} plays',fresh.length))+'</button>':'')+'<button class="btn" data-a="cancelimport">'+t('Cancel')+'</button></div></div>';
    }
  }
  h+='</section>';
  h+='<section class="sec"><h2>'+t('Export')+'</h2><p class="note">'+t('A copy of all your plays. The CSV opens in any spreadsheet and can be imported back here.')+'</p><div class="row"><button class="btn" data-a="csv">'+t('Download CSV')+'</button><button class="btn" data-a="json">'+t('Download backup (JSON)')+'</button></div></section>';
  if(!(window.LocalMoM&&LocalMoM.mode==='demo'))h+='<section class="sec danger"><h2>'+t('Delete')+'</h2><div class="row"><button class="btn" data-a="wipe"'+(plays.length?'':' disabled')+'>'+t('Delete all plays…')+'</button><button class="btn dng" data-a="delacct">'+(window.LocalMoM&&LocalMoM.mode?t('Delete this casebook…'):t('Delete my account…'))+'</button></div></section>';
  return h;
}

// ---------- players and groups ----------
// Regular players are just names (they don't need accounts): users/{uid}/people {name, notes}. Groups are named sets of
// them, users/{uid}/groups {name, members:[person ids]}, picked when logging a play to fill in the seats.
function lc(x){return String(x||'').trim().toLowerCase();}
// official scenarios sort by the name in the reader's language (anything else by its own name)
function byName(a,b){return scName(a.id,a.name).localeCompare(scName(b.id,b.name),undefined,{sensitivity:'base',ignorePunctuation:true,numeric:true});}
window.byNameCmp=byName;
function personByName(n){n=lc(n);return people.filter(function(p){return lc(p.name)===n;})[0];}
function groupMembers(g){return (g.members||[]).map(function(id){return people.filter(function(p){return p.id===id;})[0];}).filter(Boolean);}
function personStats(name){
  var n=0,pass=0,last='',inv={},k=lc(name);
  plays.forEach(function(p){var seats=(p.party||[]).filter(function(s){return lc(s.player)===k;});if(!seats.length)return;
    // one play however many characters they took; each of those characters counts once
    n++;if(p.result==='pass')pass++;if((p.date||'')>last)last=p.date;
    var once={};seats.forEach(function(s){if(s.investigator&&!once[s.investigator]){once[s.investigator]=1;inv[s.investigator]=(inv[s.investigator]||0)+1;}});});
  var fav=Object.keys(inv).sort(function(a,b){return inv[b]-inv[a];})[0];
  return {n:n,pass:pass,last:last,fav:fav,favN:fav?inv[fav]:0};
}
function playsWith(name){var k=lc(name);return plays.filter(function(p){return (p.party||[]).some(function(s){return lc(s.player)===k;});});}
function playersHtml(){
  var h='<div class="filters"><button class="btn pri" data-a="newperson">'+t('Add a player')+'</button><button class="btn" data-a="newgroup"'+(people.length?'':' disabled title="'+t('Add players first')+'"')+'>'+t('New group')+'</button></div>';
  // groups
  var gl=groups.slice().sort(byName);
  h+='<section class="sec"><div class="sec-head"><h2>'+t('Groups')+'</h2><span class="note">'+t('Pick a group when logging a play to fill in the seats.')+'</span></div>'+
    (gl.length?'<ul class="scs">'+gl.map(function(g){var m=groupMembers(g);return '<li><div class="grow"><b>'+esc(g.name)+'</b><span class="row tight chips">'+
      (m.length?m.map(function(x){return '<span class="chip tag">'+esc(x.name)+'</span>';}).join(''):'<span class="note">'+t('No players')+'</span>')+'</span></div>'+
      '<div class="row tight"><button class="btn sm" data-a="editgroup" data-id="'+esc(g.id)+'">'+t('Edit')+'</button><button class="btn sm ghost" data-a="delgroup" data-id="'+esc(g.id)+'">'+t('Delete')+'</button></div></li>';}).join('')+'</ul>'
      :'<p class="note">'+t('No groups yet. Make one for the people you usually play with together, such as “Thursday group”. Someone can be in more than one.')+'</p>')+'</section>';
  // players
  var pl=people.slice().sort(byName);
  h+='<section class="sec"><div class="sec-head"><h2>'+t('Players')+'</h2><span class="note">'+tn('{n} saved','{n} saved',pl.length)+'</span></div>'+
    (pl.length?'<ul class="scs">'+pl.map(function(x){var st=personStats(x.name),ing=groups.filter(function(g){return (g.members||[]).indexOf(x.id)>=0;}).sort(byName);
      var line=st.n?tn('{n} play','{n} plays',st.n)+' · '+t('{pct} won',{pct:pct(st.pass,st.n)})+(st.last?' · '+t('last {date}',{date:esc(fmtDate(st.last))}):'')+(st.fav?' · '+t('usually {name}',{name:esc(st.fav)}):''):t('No plays yet');
      return '<li>'+avatarHtml(x.name,'','')+'<div class="grow"><b>'+(st.n?'<a href="#" data-a="playerplays" data-n="'+esc(x.name)+'">'+esc(x.name)+'</a>':esc(x.name))+'</b>'+
        '<span class="note">'+line+'</span>'+(x.notes?'<span class="note pnote">'+esc(x.notes)+'</span>':'')+
        (ing.length?'<span class="row tight chips">'+ing.map(function(g){return '<span class="chip muted">'+esc(g.name)+'</span>';}).join('')+'</span>':'')+'</div>'+
        '<div class="row tight"><button class="btn sm" data-a="editperson" data-id="'+esc(x.id)+'">'+t('Edit')+'</button><button class="btn sm ghost" data-a="delperson" data-id="'+esc(x.id)+'">'+t('Delete')+'</button></div></li>';}).join('')+'</ul>'
      :'<p class="note">'+t('Add the people you play with. They don’t need accounts; it’s just their names, for picking quickly when you log a play and for stats per person.')+'</p>')+'</section>';
  // names typed into plays but not saved
  var loose=names('player').filter(function(n){return !personByName(n);});
  if(loose.length)h+='<section class="sec"><div class="sec-head"><h2>'+t('In your plays, not saved yet')+'</h2><button class="btn sm" data-a="addloose">'+t('Add all {n}',{n:loose.length})+'</button></div><ul class="scs">'+
    loose.map(function(n){var st=personStats(n);return '<li>'+avatarHtml(n,'','')+'<div class="grow"><b>'+esc(n)+'</b><span class="note">'+tn('{n} play','{n} plays',st.n)+'</span></div><button class="btn sm" data-a="addname" data-n="'+esc(n)+'">'+t('Add')+'</button></li>';}).join('')+'</ul></section>';
  return h;
}
function newId(){return fb.db.collection('users/'+me.uid+'/people').doc().id;}
function savePerson(name,notes){var id=newId();return fb.db.doc('users/'+me.uid+'/people/'+id).set({name:name,notes:notes||'',created:Date.now()}).then(function(){return id;});}
function personDialog(x){
  var editing=!!x;x=x||{};var used=editing?playsWith(x.name).length:0;
  var d=openDialog('<form class="stack"><div class="dlg-head"><h2>'+(editing?t('Edit player'):t('Add a player'))+'</h2><button class="x" type="button" data-close aria-label="'+t('Close')+'">×</button></div>'+
    '<label class="field"><span class="lbl">'+t('Name')+'</span><input class="f" name="pname" maxlength="40" required value="'+esc(x.name||'')+'" autocomplete="off"></label>'+
    '<label class="field"><span class="lbl">'+t('Notes (optional)')+'</span><textarea class="f" name="pnotes" rows="3" maxlength="500" placeholder="'+t('Favorite investigators, house rules they like…')+'">'+esc(x.notes||'')+'</textarea></label>'+
    (used?'<label class="check renm" hidden><input type="checkbox" name="renplays" checked><span>'+tn('Also rename them in {n} past play','Also rename them in {n} past plays',used)+'</span></label>':'')+
    (editing?'':'<div class="field"><span class="lbl">'+t('Groups (optional)')+'</span><div class="checks">'+(groups.length?groups.slice().sort(byName).map(function(g){return '<label class="check"><input type="checkbox" name="pg" value="'+esc(g.id)+'"><span>'+esc(g.name)+'</span></label>';}).join(''):'<span class="note">'+t('No groups yet.')+'</span>')+'</div></div>')+
    '<p class="err" role="alert" hidden></p><div class="row end"><button class="btn" type="button" data-close>'+t('Cancel')+'</button><button class="btn pri" type="submit">'+(editing?t('Save'):t('Add'))+'</button></div></form>',editing?t('Edit player'):t('Add a player'));
  var f=d.querySelector('form'),err=f.querySelector('.err'),ren=f.querySelector('.renm');
  if(ren)f.pname.addEventListener('input',function(){ren.hidden=lc(f.pname.value)===lc(x.name)&&f.pname.value.trim()===x.name;});
  f.addEventListener('submit',async function(e){
    e.preventDefault();var name=f.pname.value.trim().replace(/\s+/g,' '),notes=f.pnotes.value.trim();
    var clash=personByName(name);if(clash&&clash.id!==x.id){err.textContent=t('You already have a player called “{name}”.',{name:clash.name});err.hidden=false;return;}
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
      d.close();toast(editing?t('Saved.'):t('Added {name}.',{name:name}));
    }catch(e2){btn.disabled=false;err.textContent=friendly(e2);err.hidden=false;}
  });
}
function groupDialog(g){
  var editing=!!g;g=g||{members:[]};
  var d=openDialog('<form class="stack"><div class="dlg-head"><h2>'+(editing?t('Edit group'):t('New group'))+'</h2><button class="x" type="button" data-close aria-label="'+t('Close')+'">×</button></div>'+
    '<label class="field"><span class="lbl">'+t('Group name')+'</span><input class="f" name="gname" maxlength="40" required value="'+esc(g.name||'')+'" placeholder="'+t('e.g. Thursday group')+'" autocomplete="off"></label>'+
    '<div class="field"><span class="lbl">'+t('Who’s in it')+'</span><div class="checks">'+people.slice().sort(byName).map(function(x){return '<label class="check"><input type="checkbox" name="gm" value="'+esc(x.id)+'"'+((g.members||[]).indexOf(x.id)>=0?' checked':'')+'><span>'+esc(x.name)+'</span></label>';}).join('')+'</div></div>'+
    '<label class="field"><span class="lbl">'+t('Add someone new (optional)')+'</span><input class="f" name="gnew" maxlength="200" placeholder="'+t('Names, separated by commas')+'" autocomplete="off"></label>'+
    '<p class="err" role="alert" hidden></p><div class="row end"><button class="btn" type="button" data-close>'+t('Cancel')+'</button><button class="btn pri" type="submit">'+(editing?t('Save'):t('Make group'))+'</button></div></form>',editing?t('Edit group'):t('New group'));
  var f=d.querySelector('form'),err=f.querySelector('.err');
  f.addEventListener('submit',async function(e){
    e.preventDefault();var name=f.gname.value.trim().replace(/\s+/g,' ');
    if(groups.some(function(y){return y.id!==g.id&&lc(y.name)===lc(name);})){err.textContent=t('You already have a group with that name.');err.hidden=false;return;}
    var ids=[].slice.call(f.querySelectorAll('input[name=gm]:checked')).map(function(c){return c.value;});
    var extra=f.gnew.value.split(',').map(function(n){return n.trim().replace(/\s+/g,' ').slice(0,40);}).filter(Boolean);
    if(!ids.length&&!extra.length){err.textContent=t('Tick at least one player, or add someone new.');err.hidden=false;return;}
    var btn=f.querySelector('[type=submit]');btn.disabled=true;
    try{
      for(var i=0;i<extra.length;i++){var ex=personByName(extra[i]);var id=ex?ex.id:await savePerson(extra[i],'');if(ids.indexOf(id)<0)ids.push(id);}
      var ref=editing?fb.db.doc('users/'+me.uid+'/groups/'+g.id):fb.db.collection('users/'+me.uid+'/groups').doc();
      await ref.set(editing?{name:name,members:ids.slice(0,30),updated:Date.now()}:{name:name,members:ids.slice(0,30),created:Date.now()},{merge:true});
      d.close();toast(editing?t('Saved.'):t('Group made.'));
    }catch(e2){btn.disabled=false;err.textContent=friendly(e2);err.hidden=false;}
  });
}

// ---------- Your account (from the account menu, like the Arkham site) ----------
function accountBody(){
  var hasPic=profile&&picOk(profile.photo),cur=(profile&&AVATAR_COLORS[profile.color])?profile.color:'slate';
  return '<div class="dlg-head"><h2>'+t('Your account')+'</h2><button class="x" type="button" data-close aria-label="'+t('Close')+'">×</button></div>'+
    '<div class="row picrow">'+avatarHtml(myName()||me.email,profile&&profile.photo,cur,'xl')+'<div class="stack tight"><span class="lbl">'+t('Profile picture')+'</span><div class="row">'+
    '<button class="btn" type="button" data-ac="pic">'+(hasPic?t('Change picture'):t('Choose a picture'))+'</button>'+(hasPic?'<button class="btn ghost" type="button" data-ac="picrm">'+t('Remove')+'</button>':'')+'</div>'+
    '<span class="note">'+(hasPic?t('Your picture is showing. Remove it to show your initial on a color instead.'):t('Or show your initial on the color you pick below.'))+'</span></div></div>'+
    // the color is only for the initial, so it's hidden while a picture is showing
    (hasPic?'':'<div class="field"><span class="lbl">'+t('Color')+'</span><div class="swatches">'+Object.keys(AVATAR_COLORS).map(function(k){return '<button class="swatch'+(k===cur?' on':'')+'" type="button" data-ac="color" data-v="'+k+'" style="background:'+AVATAR_COLORS[k]+'" aria-label="'+t(k)+'" aria-pressed="'+(k===cur)+'"></button>';}).join('')+'</div></div>')+
    '<form class="row bottom" data-ac-form><label class="field grow"><span class="lbl">'+t('Your name')+'</span><input class="f" name="aname" maxlength="40" value="'+esc(myName())+'"></label><button class="btn" type="submit">'+t('Save')+'</button></form>'+
    '<p class="note">'+t('Your name is how you appear on this site and in the account menu. Signed in as {email}.',{email:esc(me.email||me.displayName||'')})+'</p>'+
    '<div class="row end"><button class="btn" type="button" data-close>'+t('Done')+'</button></div>';
}
function openAccount(){
  if(!me)return;
  var d=openDialog(accountBody(),t('Your account')),box=d.querySelector('.dlg');
  var redraw=function(){if(document.body.contains(d))box.innerHTML=accountBody();};
  box.addEventListener('click',function(e){
    var b=e.target.closest('[data-ac]');if(!b)return;
    if(b.dataset.ac==='pic')choosePicture().then(function(data){if(!data)return;return fb.db.doc('users/'+me.uid).set({photo:data},{merge:true}).then(function(){profile.photo=data;redraw();toast(t('Picture saved.'));});}).catch(function(err){toast(friendly(err));});
    else if(b.dataset.ac==='color'){var v=b.dataset.v;if(!AVATAR_COLORS[v])return;profile=profile||{};profile.color=v;redraw();render();
      fb.db.doc('users/'+me.uid).set({color:v},{merge:true}).catch(function(err){toast(friendly(err));});}
    else if(b.dataset.ac==='picrm')fb.db.doc('users/'+me.uid).set({photo:''},{merge:true}).then(function(){profile.photo='';redraw();toast(t('Picture removed.'));}).catch(function(err){toast(friendly(err));});
  });
  box.addEventListener('submit',function(e){
    e.preventDefault();var n=box.querySelector('[name=aname]').value.trim().replace(/\s+/g,' ').slice(0,40);
    fb.db.doc('users/'+me.uid).set({name:n},{merge:true}).then(function(){toast(t('Saved.'));}).catch(function(err){toast(friendly(err));});
  });
}
window.addEventListener('acct-account',openAccount);

// ---------- investigators: official names only ----------
// The dropdown on each seat: the 40 official investigators grouped by box, or Unknown.
function invSelect(val){
  var odd=val&&!MOM.isInvestigator(val);
  return '<select class="f" name="pi" aria-label="'+t('Investigator')+'"><option value="">'+t('Investigator…')+'</option>'+
    MOM.INVESTIGATOR_GROUPS.map(function(g){return '<optgroup label="'+esc(g.name)+'">'+g.list.map(function(n){return '<option'+(n===val?' selected':'')+'>'+esc(n)+'</option>';}).join('')+'</optgroup>';}).join('')+
    (odd?'<option value="" selected disabled>'+t('{name} (not official)',{name:esc(val)})+'</option>':'')+'</select>';
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
  var probs=investigatorProblems();if(!probs.length){toast(t('Every investigator is already an official one.'));return;}
  var nPlays=Object.keys(probs.reduce(function(o,x){Object.keys(x.ids).forEach(function(id){o[id]=1;});return o;},{})).length;
  var opts=function(sel){return MOM.INVESTIGATOR_GROUPS.map(function(g){return '<optgroup label="'+esc(g.name)+'">'+g.list.map(function(n){return '<option'+(n===sel?' selected':'')+'>'+esc(n)+'</option>';}).join('')+'</optgroup>';}).join('');};
  var d=openDialog('<form class="stack"><div class="dlg-head"><h2>'+t('Fix investigator names')+'</h2><button class="x" type="button" data-close aria-label="'+t('Close')+'">×</button></div>'+
    '<p class="note">'+t('Only official investigators can be saved. Each name below is matched to the one it most likely means; change any that are wrong.')+'</p>'+
    '<ul class="fixes">'+probs.map(function(x,i){return '<li><div><b>'+esc(x.text)+'</b><span class="note"> '+(x.kind==='player'?tn('typed as a player in {n} play','typed as a player in {n} plays',x.n):tn('as investigator in {n} play','as investigator in {n} plays',x.n))+'</span></div>'+
      '<select class="f" name="fix'+i+'">'+(x.kind==='player'?'<option value="__keep">'+t('It’s a person; leave it')+'</option>':'<option value="">'+t('Unknown (leave blank)')+'</option>')+opts(x.guess)+'</select></li>';}).join('')+'</ul>'+
    '<p class="err" role="alert" hidden></p><div class="row end"><button class="btn" type="button" data-close>'+t('Cancel')+'</button><button class="btn pri" type="submit">'+tn('Fix {n} play','Fix {n} plays',nPlays)+'</button></div></form>',t('Fix investigator names'));
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
      d.close();toast(tn('Fixed {n} play.','Fixed {n} plays.',todo.length));
    }catch(err){btn.disabled=false;var el=f.querySelector('.err');el.textContent=friendly(err);el.hidden=false;}
  });
}

// ---------- scenarios: official or Valkyrie only ----------
function fixScenarios(){
  var bad=scenarioProblems();if(!bad.length){toast(t('Every play is matched to a real scenario.'));return;}
  var all=validScenarios(),byName={};
  bad.forEach(function(p){var n=p.scenarioName||t('(no name)');(byName[n]=byName[n]||[]).push(p);});
  var names=Object.keys(byName).sort();
  var groups=MOM.PRODUCTS.map(function(pr){return '<optgroup label="'+esc(pr.name)+'">'+MOM.OFFICIAL.filter(function(s){return s.product===pr.id;}).map(function(s){return '<option value="'+esc(s.id)+'">'+esc(scName(s.id,s.name))+'</option>';}).join('')+'</optgroup>';}).join('')+
    '<optgroup label="Valkyrie">'+MOM.VALKYRIE.filter(function(s){return !s.retired;}).slice().sort(window.byNameCmp).map(function(s){return '<option value="'+esc(s.id)+'">'+esc(scName(s.id,s.name))+'</option>';}).join('')+'</optgroup>';
  var d=openDialog('<form class="stack"><div class="dlg-head"><h2>'+t('Match plays to scenarios')+'</h2><button class="x" type="button" data-close aria-label="'+t('Close')+'">×</button></div>'+
    '<p class="note">'+t('Every play must be an official or Valkyrie scenario. Each name below has its best guess chosen; change any that are wrong.')+'</p>'+
    '<ul class="fixes">'+names.map(function(n,i){var c=MOM.matchScenarios(n,all).slice(0,6);
      return '<li><div><b>'+esc(n)+'</b><span class="note"> '+tn('in {n} play','in {n} plays',byName[n].length)+'</span></div><select class="f" name="sc'+i+'" required>'+
        (c.length?'<optgroup label="'+t('Best guesses')+'">'+c.map(function(x,k){return '<option value="'+esc(x.s.id)+'"'+(k===0?' selected':'')+'>'+esc(scName(x.s.id,x.s.name))+'</option>';}).join('')+'</optgroup>':'<option value="" selected disabled>'+t('Choose a scenario…')+'</option>')+groups+'</select></li>';}).join('')+'</ul>'+
    '<p class="err" role="alert" hidden></p><div class="row end"><button class="btn" type="button" data-close>'+t('Cancel')+'</button><button class="btn pri" type="submit">'+tn('Match {n} play','Match {n} plays',bad.length)+'</button></div></form>',t('Match plays to scenarios'));
  var f=d.querySelector('form');
  f.addEventListener('submit',async function(e){
    e.preventDefault();var btn=f.querySelector('[type=submit]');btn.disabled=true;
    try{
      var todo=[];names.forEach(function(n,i){var sc=scenById(f['sc'+i].value);if(sc)byName[n].forEach(function(p){todo.push([p,sc]);});});
      for(var i=0;i<todo.length;i+=400){var b=fb.db.batch();todo.slice(i,i+400).forEach(function(t){
        b.update(fb.db.doc('users/'+me.uid+'/plays/'+t[0].id),{scenarioId:t[1].id,scenarioName:t[1].name,scenarioType:t[1].type,updated:Date.now()});});await b.commit();}
      await cleanOwnScenarios();
      d.close();toast(tn('Matched {n} play.','Matched {n} plays.',todo.length));
    }catch(err){btn.disabled=false;var el=f.querySelector('.err');el.textContent=friendly(err);el.hidden=false;}
  });
}
// Personal scenario records from older versions aren't used any more; remove them once no play needs them.
async function cleanOwnScenarios(){
  if(!mine.length||scenarioProblems().length)return;
  var b=fb.db.batch();mine.forEach(function(s){b.delete(fb.db.doc('users/'+me.uid+'/scenarios/'+s.id));});await b.commit().catch(function(){});
}

// ---------- the play form ----------
function playForm(p,preset){
  var editing=!!(p&&p.id);p=p||{};
  var scId=p.scenarioId||preset||'';
  // a fresh Log a play starts empty; Play again, a plan or an edit bring their own details
  var party=(p.party&&p.party.length?p.party:[{player:'',investigator:''}]);
  var opts='<option value="">'+t('Choose a scenario…')+'</option>';
  var own=owned(),st=scenStats();
  MOM.PRODUCTS.forEach(function(pr){var l=MOM.OFFICIAL.filter(function(s){return s.product===pr.id&&(own.indexOf(pr.id)>=0||s.id===scId);});
    if(l.length)opts+='<optgroup label="'+esc(pr.name)+'">'+l.map(function(s){return '<option value="'+esc(s.id)+'"'+(s.id===scId?' selected':'')+'>'+esc(scName(s.id,s.name))+(st[s.id]?'':' • '+t('new'))+'</option>';}).join('')+'</optgroup>';});
  var offK={};MOM.OFFICIAL.forEach(function(s){offK[MOM.key(s.name)]=1;});
  // beyond the built-in official list: official ones the admin added, then Valkyrie
  var ex=allScenarios().filter(function(s){return !offK[MOM.key(s.name)];}).sort(byName);
  [['official',t('Official (added)')],['valkyrie',t('Valkyrie')]].forEach(function(g){var l=ex.filter(function(s){return s.type===g[0];});
    if(l.length)opts+='<optgroup label="'+g[1]+'">'+l.map(function(s){return '<option value="'+esc(s.id)+'"'+(s.id===scId?' selected':'')+'>'+esc(scName(s.id,s.name))+'</option>';}).join('')+'</optgroup>';});
  if(scId&&!scenById(scId)&&p.scenarioName)opts+='<option value="" selected disabled>'+t('{name} (not in the list: choose one)',{name:esc(scName(p.scenarioId,p.scenarioName))})+'</option>';
  var seat=function(s){return '<div class="seat"><span class="pp-wrap"><input class="f combo" name="pp" data-suggest="dl-pl" autocomplete="off" placeholder="'+t('Player')+'" maxlength="40" value="'+esc(s.player||'')+'" aria-label="'+t('Player')+'">'+
    '<select class="pp-pick" tabindex="-1" aria-label="'+t('Choose a player')+'"><option value="">'+t('Choose a player')+'</option></select></span>'+
    invSelect(s.investigator||'')+
    '<button class="x" type="button" data-f="rmseat" aria-label="'+t('Remove this seat')+'">×</button></div>';};
  var ppl=people.map(function(x){return x.name;}).sort();names('player').forEach(function(n){if(!personByName(n)&&ppl.indexOf(n)<0)ppl.push(n);});if(myName()&&!ppl.some(function(n){return lc(n)===lc(myName());}))ppl.unshift(myName());
  var res=p.result||'';
  return '<form class="stack" data-form="play"'+(editing?' data-id="'+esc(p.id)+'"':'')+'>'+
    '<div class="dlg-head"><h2>'+(editing?t('Edit play'):p._again?t('Play again'):t('Log a play'))+'</h2><button class="x" type="button" data-close aria-label="'+t('Close')+'">×</button></div>'+
    '<label class="field"><span class="lbl">'+t('Scenario')+'</span><select class="f" name="sc" required>'+opts+'</select></label>'+
    '<div class="grid2"><label class="field"><span class="lbl">'+t('Date (optional)')+'</span><input class="f" type="date" name="date" value="'+esc(p.date||'')+'" max="'+today()+'"></label>'+
    '<label class="field"><span class="lbl">'+t('Attempt')+'</span><input class="f num" type="number" name="att" min="1" max="99" value="'+(p.attempts||1)+'" aria-describedby="att-h"><small class="note" id="att-h">'+t('Which try this was')+'</small></label></div>'+
    '<fieldset class="field"><legend class="lbl">'+t('Result')+'</legend><div class="seg big" role="radiogroup">'+[['pass',t('Won')],['fail',t('Lost')],['abandoned',t('Abandoned')]].map(function(r){return '<label class="'+r[0]+'"><input type="radio" name="res" value="'+r[0]+'"'+(res===r[0]?' checked':'')+' required><span>'+r[1]+'</span></label>';}).join('')+'</div></fieldset>'+
    '<fieldset class="field"><legend class="lbl">'+t('Who played')+'</legend>'+
    (groups.length?'<select class="f grp" name="grp" aria-label="'+t('Fill in from a group')+'"><option value="">'+t('Fill in from a group…')+'</option>'+groups.slice().sort(byName).map(function(g){return '<option value="'+esc(g.id)+'">'+esc(g.name)+' ('+groupMembers(g).length+')</option>';}).join('')+'</select>':'')+
    '<div class="seats">'+party.map(seat).join('')+'</div><div class="row"><button class="btn sm" type="button" data-f="addseat">'+t('+ Add a player')+'</button></div></fieldset>'+
    '<label class="field"><span class="lbl">'+t('Where (optional)')+'</span><input class="f" name="loc" list="dl-loc" maxlength="60" placeholder="'+t('e.g. home, a friend’s house or the game store')+'" value="'+esc(p.location||'')+'" autocomplete="off"></label>'+
    '<datalist id="dl-loc">'+places().map(function(n){return '<option value="'+esc(n)+'">';}).join('')+'</datalist>'+
    '<label class="field"><span class="lbl">'+t('Rules')+'</span><input class="f" name="rules" list="dl-rules" maxlength="80" placeholder="'+t(NORMAL)+'" value="'+esc(p.rules?rulesName(p.rules):'')+'"></label>'+
    '<label class="field"><span class="lbl">'+t('Notes')+'</span><textarea class="f" name="notes" rows="4" maxlength="4000" placeholder="'+t('What happened? Anything to remember next time?')+'">'+esc(p.notes||'')+'</textarea></label>'+
    '<datalist id="dl-pl">'+ppl.map(function(n){return '<option value="'+esc(n)+'">';}).join('')+'</datalist>'+
    '<datalist id="dl-rules">'+rulesUsed().map(function(n){return '<option value="'+esc(rulesName(n))+'">';}).join('')+'</datalist>'+
    '<p class="err" role="alert" hidden></p>'+
    '<div class="row end">'+(editing?'<button class="btn dng ghost" type="button" data-f="del" style="margin-right:auto">'+t('Delete')+'</button>':'')+'<button class="btn" type="button" data-close>'+t('Cancel')+'</button><button class="btn pri" type="submit">'+(editing?t('Save'):t('Log play'))+'</button></div></form>';
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
  var d=openDialog(playForm(p,preset),p&&p.id?t('Edit play'):t('Log a play')),f=d.querySelector('form'),err=f.querySelector('.err');
  var seatHtml=f.querySelector('.seat').outerHTML;
  // picking a known player fills in the investigator they usually take, if that seat has none yet
  f.addEventListener('change',function(e){var t=e.target;if(t.name!=='pp'||!t.value.trim())return;var s=t.closest('.seat'),iv=s&&s.querySelector('[name=pi]');
    if(!iv||iv.value)return;var fav=personStats(t.value).fav;if(fav&&MOM.isInvestigator(fav)){iv.value=fav;}});
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
    if(k==='addseat'){var box=f.querySelector('.seats');if(box.children.length>=8)return;box.insertAdjacentHTML('beforeend',seatHtml);var s=box.lastElementChild;s.querySelectorAll('input').forEach(function(i){i.value='';});if(!matchMedia('(pointer:coarse)').matches)s.querySelector('input').focus();}
    else if(k==='rmseat'){var all=f.querySelectorAll('.seat');if(all.length>1)b.closest('.seat').remove();else b.closest('.seat').querySelectorAll('input').forEach(function(i){i.value='';});}
    else if(k==='del'){
      if(b.dataset.sure){b.disabled=true;fb.db.doc('users/'+me.uid+'/plays/'+f.dataset.id).delete().then(function(){d.close();toast(t('Play deleted.'));}).catch(function(e2){b.disabled=false;showErr(friendly(e2));});}
      else{b.dataset.sure='1';b.textContent=t('Delete this play?');b.classList.remove('ghost');}
    }
  });
  var showErr=function(m){err.textContent=m;err.hidden=!m;};
  f.addEventListener('submit',function(e){
    e.preventDefault();showErr('');
    var btn=f.querySelector('[type=submit]');btn.disabled=true;
    savePlay(f).then(function(){d.close();toast(f.dataset.id?t('Saved.'):t('Play logged.'));
      if(p&&p._fromPlan){var m={},c=starredMap();for(var k in c)if(k!==p._fromPlan)m[k]=c[k];saveStarred(m);}if(!f.dataset.id&&ui.tab!=='plays'){ui.tab='plays';render();window.scrollTo(0,0);}}).catch(function(e2){btn.disabled=false;showErr(friendly(e2));});
  });
}
async function savePlay(f){
  var scId=f.sc.value,sc;
  sc=scenById(scId);
  if(!sc||(sc.type!=='official'&&sc.type!=='valkyrie'))throw {msg:t('Choose a scenario from the list.')};
  var res=(f.querySelector('input[name=res]:checked')||{}).value;if(!res)throw {msg:t('Choose Won, Lost or Abandoned.')};
  var party=[];f.querySelectorAll('.seat').forEach(function(s){var a=s.querySelector('[name=pp]').value.trim(),b=s.querySelector('[name=pi]').value;if(b&&!MOM.isInvestigator(b))b='';if(a||b)party.push({player:a.slice(0,40),investigator:b});});
  var att=Math.max(1,Math.min(99,parseInt(f.att.value,10)||1));
  var doc={scenarioId:sc.id,scenarioName:sc.name,scenarioType:sc.type,date:f.date.value||'',result:res,attempts:att,
    party:party,solo:peopleAt({party:party}).count===1,rules:(f.rules.value.trim()===t(NORMAL)?NORMAL:f.rules.value.trim()||NORMAL).slice(0,80),location:f.loc.value.trim().replace(/\s+/g,' ').slice(0,60),notes:f.notes.value.trim().slice(0,4000),updated:Date.now()};
  if(f.dataset.id)await fb.db.doc('users/'+me.uid+'/plays/'+f.dataset.id).update(doc);
  else{doc.created=Date.now();await fb.db.collection('users/'+me.uid+'/plays').add(doc);}
}

// ---------- import ----------
// In the import preview: each sheet name that isn't a known scenario, with a dropdown to choose the real one
// (best guesses first) or skip those rows.
function unmatchedHtml(imp){
  var names=Object.keys(imp.unmatched||{});if(!names.length)return '';
  var all=validScenarios(),byId={};all.forEach(function(s){byId[s.id]=s;});
  var groups=MOM.PRODUCTS.map(function(pr){return '<optgroup label="'+esc(pr.name)+'">'+MOM.OFFICIAL.filter(function(s){return s.product===pr.id;}).map(function(s){return '<option value="'+esc(s.id)+'">'+esc(scName(s.id,s.name))+'</option>';}).join('')+'</optgroup>';}).join('')+
    '<optgroup label="Valkyrie">'+MOM.VALKYRIE.filter(function(s){return !s.retired;}).slice().sort(byName).map(function(s){return '<option value="'+esc(s.id)+'">'+esc(scName(s.id,s.name))+'</option>';}).join('')+'</optgroup>';
  return '<div class="unmatched"><p><b>'+tn('{n} scenario name isn’t an exact match.','{n} scenario names aren’t an exact match.',names.length)+'</b> '+t('Every play must be an official or Valkyrie scenario: choose the right one, or skip those rows.')+'</p>'+
    names.map(function(n,i){var guess=(imp.unmatched[n]||[]).filter(function(id){return byId[id];});var count=imp.plays.filter(function(p){return !p.dupe&&p.sheetName===n;}).length;
      return '<label class="field"><span class="lbl">“'+esc(n)+'” · '+tn('{n} play','{n} plays',count)+'</span><select class="f" id="um-'+i+'">'+
        (guess.length?'<optgroup label="'+t('Best guesses')+'">'+guess.map(function(id,k){return '<option value="'+esc(id)+'"'+(k===0?' selected':'')+'>'+esc(scName(id,byId[id].name))+'</option>';}).join('')+'</optgroup>':'')+
        '<option value=""'+(guess.length?'':' selected')+'>'+t('Skip these rows')+'</option>'+groups+'</select></label>';}).join('')+'</div>';
}
function prepareImport(rows){
  var r=I.buildPlays(rows,allScenarios(true));
  var have={};plays.forEach(function(p){if(p.importKey)have[p.importKey]=1;});
  r.plays.forEach(function(p){p.dupe=!!have[p.importKey];});
  ui.imp=r;
}
async function runImport(){
  var imp=ui.imp;if(!imp)return;
  // the person's choice for each sheet name that didn't match (or skip those rows)
  var pick={};Object.keys(imp.unmatched||{}).forEach(function(n,i){var el=document.getElementById('um-'+i);pick[n]=el?el.value:'';});
  ui.busy=true;render();
  try{
    var writes=[],now=Date.now(),base=fb.db.collection('users/'+me.uid+'/plays');
    var fresh=imp.plays.filter(function(p){return !p.dupe;}).map(function(p){
      if(p.scenarioId)return p;var sc=scenById(pick[p.sheetName]);if(!sc)return null;
      var q={};for(var k in p)q[k]=p[k];q.scenarioId=sc.id;q.scenarioName=sc.name;q.scenarioType=sc.type;
      q.notes=(q.notes?q.notes+'\n':'')+t('Scenario in the sheet: “{name}”.',{name:p.sheetName});return q;}).filter(Boolean);
    fresh.forEach(function(p,i){var d={};Object.keys(p).forEach(function(k){if(k!=='dupe'&&k!=='sheetName')d[k]=p[k];});d.created=now+i;d.updated=now+i;writes.push([base.doc(),d]);});
    for(var i=0;i<writes.length;i+=400){var b=fb.db.batch();writes.slice(i,i+400).forEach(function(w){b.set(w[0],w[1]);});await b.commit();}
    ui.imp=null;ui.tab='plays';toast(tn('Imported {n} play.','Imported {n} plays.',fresh.length));
  }catch(e){ui.imp={error:friendly(e)};}
  ui.busy=false;render();
}
function download(name,text,type){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},500);}
async function deleteAll(col){var q=await fb.db.collection('users/'+me.uid+'/'+col).get();for(var i=0;i<q.docs.length;i+=400){var b=fb.db.batch();q.docs.slice(i,i+400).forEach(function(d){b.delete(d.ref);});await b.commit();}}
function confirmDialog(title,body,yes,run){
  var d=openDialog('<div class="dlg-head"><h2>'+esc(title)+'</h2><button class="x" type="button" data-close aria-label="'+t('Close')+'">×</button></div><p>'+body+'</p><p class="err" role="alert" hidden></p>'+
    '<div class="row end"><button class="btn" type="button" data-close>'+t('Cancel')+'</button><button class="btn dng" type="button" data-yes>'+esc(yes)+'</button></div>',title);
  d.querySelector('[data-yes]').addEventListener('click',function(e){var b=e.currentTarget;b.disabled=true;Promise.resolve(run()).then(function(){d.close();}).catch(function(err){b.disabled=false;var el=d.querySelector('.err');el.textContent=friendly(err);el.hidden=false;});});
}

// ---------- events ----------
app.addEventListener('click',function(e){
  var a=e.target.closest('[data-a]');if(!a)return;var k=a.getAttribute('data-a');
  if(a.tagName==='A')e.preventDefault();
  if(k==='tab'){ui.tab=a.dataset.t;try{sessionStorage.setItem('mom-tab',ui.tab);}catch(x){}render();window.scrollTo(0,0);}
  else if(k==='log')openPlay(null,a.dataset.sc);
  else if(k==='again')playAgain(a.dataset.sc);
  else if(k==='star')toggleStar(a.dataset.sc);
  else if(k==='plan')planDialog(a.dataset.sc);
  else if(k==='pack')packDialog(a.dataset.sc);
  else if(k==='calmenu')calMenu(a);
  else if(k==='logplan')logFromPlan(a.dataset.sc);
  else if(k==='edit'){var p=plays.filter(function(x){return x.id===a.dataset.id;})[0];if(p)openPlay(p);}
  else if(k==='clearf'){ui.q=ui.result=ui.player=ui.scen='';render();}
  else if(k==='scplays'){ui.q=ui.result=ui.player='';ui.scen=a.dataset.id;ui.tab='plays';render();window.scrollTo(0,0);}
  else if(k==='fixinv')fixInvestigators();
  else if(k==='fixsc')fixScenarios();
  else if(k==='sfclear'){sf.src=sf.diff=sf.len=sf.rate=sf.lang=sf.own='any';sf.src='all';ui.sfilter='all';ui.sq='';try{sessionStorage.setItem('mom-sf',JSON.stringify(sf));}catch(x){}render();}
  else if(k==='xtswap'){var xr=xt.r;xt.r=xt.c;xt.c=xr;saveXt();render();}
  else if(k==='newperson')personDialog();
  else if(k==='newgroup')groupDialog();
  else if(k==='editperson'){var ps=people.filter(function(x){return x.id===a.dataset.id;})[0];if(ps)personDialog(ps);}
  else if(k==='editgroup'){var gr=groups.filter(function(x){return x.id===a.dataset.id;})[0];if(gr)groupDialog(gr);}
  else if(k==='delperson'){var pd=people.filter(function(x){return x.id===a.dataset.id;})[0];if(pd)confirmDialog(t('Delete player'),t('Delete <b>{name}</b>? They’re taken out of your groups. Past plays keep their name.',{name:esc(pd.name)}),t('Delete'),async function(){
    var b=fb.db.batch();groups.forEach(function(g){if((g.members||[]).indexOf(pd.id)>=0)b.update(fb.db.doc('users/'+me.uid+'/groups/'+g.id),{members:g.members.filter(function(m){return m!==pd.id;}),updated:Date.now()});});
    b.delete(fb.db.doc('users/'+me.uid+'/people/'+pd.id));await b.commit();});}
  else if(k==='delgroup'){var gd=groups.filter(function(x){return x.id===a.dataset.id;})[0];if(gd)confirmDialog(t('Delete group'),t('Delete the group <b>{name}</b>? The players in it stay.',{name:esc(gd.name)}),t('Delete'),function(){return fb.db.doc('users/'+me.uid+'/groups/'+gd.id).delete();});}
  else if(k==='addname'){savePerson(a.dataset.n,'').then(function(){toast(t('Added {name}.',{name:a.dataset.n}));}).catch(function(err){toast(friendly(err));});}
  else if(k==='addloose'){var ln=names('player').filter(function(n){return !personByName(n);});Promise.all(ln.map(function(n){return savePerson(n,'');})).then(function(){toast(tn('Added {n} player.','Added {n} players.',ln.length));}).catch(function(err){toast(friendly(err));});}
  else if(k==='playerplays'){ui.q=ui.result=ui.scen='';ui.player=a.dataset.n;ui.tab='plays';render();window.scrollTo(0,0);}
  else if(k==='goimport'){ui.tab='settings';render();var el=document.getElementById('import');if(el)el.scrollIntoView();}
  else if(k==='doimport')runImport();
  else if(k==='cancelimport'){ui.imp=null;render();}
  else if(k==='csv')download('mansions-plays.csv',I.toCSV(plays.slice().sort(sortPlays)),'text/csv');
  else if(k==='json')download('mansions-backup.json',JSON.stringify({exported:new Date().toISOString(),version:self.APP_VERSION,plays:plays,scenarios:mine},null,1),'application/json');
  else if(k==='wipe')confirmDialog(t('Delete all plays'),tn('Your {n} play goes for good. Download a copy first if you might want it.','All {n} plays go for good. Download a copy first if you might want them.',plays.length),t('Delete all plays'),function(){return deleteAll('plays').then(function(){toast(t('All plays deleted.'));});});
  else if(k==='delacct')confirmDialog(LocalMoM.mode?t('Delete this casebook'):t('Delete my account'),LocalMoM.mode?t('Your plays, players and groups in this browser all go for good. This can’t be undone.'):t('Your plays, your scenarios and your sign-in all go for good. This can’t be undone.'),LocalMoM.mode?t('Delete this casebook'):t('Delete my account'),async function(){
    await deleteAll('plays');await deleteAll('scenarios');await deleteAll('people');await deleteAll('groups');await fb.db.doc('users/'+me.uid).delete();
    try{await me.delete();}catch(err){if(err.code==='auth/requires-recent-login'){await fb.auth.signOut();throw {msg:t('Your plays are deleted. To remove the sign-in too, sign in again and choose Delete my account once more.')};}throw err;}
    location.href='./';
  });
  else if(k==='trylocal'){LocalMoM.start();location.href='./';}
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
  var el=e.target;
  if(el.id==='fres'){ui.result=el.value;render();}else if(el.id==='fpl'){ui.player=el.value;render();}else if(el.id==='fsc'){ui.scen=el.value;render();}
  else if(el.id==='sf-status'){ui.sfilter=el.value;render();}
  else if(/^sf-/.test(el.id)&&el.id!=='sf-status'){sf[el.id.slice(3)]=el.value;try{sessionStorage.setItem('mom-sf',JSON.stringify(sf));}catch(x){}render();}
  else if(/^xt-/.test(el.id)){xt[el.id.slice(3)]=el.value;saveXt();render();}
  else if(el.id==='s-lang')I18N.set(el.value);
  else if(el.id==='s-valk')fb.db.doc('users/'+me.uid).set({hideValkyrie:!el.checked},{merge:true}).catch(function(err){toast(friendly(err));});
  else if(el.dataset.own){var o=owned().slice(),i=o.indexOf(el.dataset.own);if(el.checked&&i<0)o.push(el.dataset.own);if(!el.checked&&i>=0)o.splice(i,1);
    fb.db.doc('users/'+me.uid).set({owned:o},{merge:true}).catch(function(err){toast(friendly(err));});}
  else if(el.id==='imp-file'&&el.files[0]){var r=new FileReader();r.onload=function(){prepareImport(I.parseCSV(r.result));render();};r.readAsText(el.files[0]);el.value='';}
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
    if(ui.authMode==='reset'){await fb.auth.sendPasswordResetEmail(em);ui.authMode='signin';toast(t('If that email has an account, a reset link is on its way.'));}
    else if(ui.authMode==='signup'){var nm=(document.getElementById('au-name')||{}).value||'';ui.pendingName=nm.trim();var c=await fb.auth.createUserWithEmailAndPassword(em,pw);if(ui.pendingName)await c.user.updateProfile({displayName:ui.pendingName}).catch(function(){});}
    else await fb.auth.signInWithEmailAndPassword(em,pw);
  }catch(e){ui.authErr=friendly(e);}
  ui.busy=false;render();
}

// ---------- moving a browser-only casebook into an account ----------
// After "Save to an account" (index.html?save=1) and signing in: copy the plays, players, groups, stars and profile
// from this browser (js/localfb.js) into the account, then clear the browser copy. Anything already in the account stays;
// for the profile, the account's own name, picture and settings win.
var moving=false;
async function moveLocal(user){
  if(moving||!window.LocalMoM||!LocalMoM.save)return;moving=true;
  var d=LocalMoM.dump(),base='users/'+user.uid,ops=[];
  ['plays','people','groups'].forEach(function(c){Object.keys(d[c]).forEach(function(id){ops.push([base+'/'+c+'/'+id,d[c][id]]);});});
  try{
    var snap=await fb.db.doc(base).get(),cur=snap.exists?snap.data():{},lp=d.profile||{},prof={};
    var st={};Object.keys(lp.starred||{}).forEach(function(k){st[k]=lp.starred[k];});Object.keys(cur.starred||{}).forEach(function(k){st[k]=cur.starred[k];});
    if(Object.keys(st).length)prof.starred=st;
    if(!cur.name&&lp.name)prof.name=String(lp.name).slice(0,40);
    if(!cur.photo&&lp.photo)prof.photo=lp.photo;
    if(!cur.color&&lp.color)prof.color=lp.color;
    if(!cur.lang&&lp.lang)prof.lang=lp.lang;
    if(cur.owned==null&&Array.isArray(lp.owned))prof.owned=lp.owned;
    if(cur.hideValkyrie==null&&typeof lp.hideValkyrie==='boolean')prof.hideValkyrie=lp.hideValkyrie;
    for(var i=0;i<ops.length;i+=400){var b=fb.db.batch();ops.slice(i,i+400).forEach(function(o){b.set(fb.db.doc(o[0]),o[1]);});await b.commit();}
    if(Object.keys(prof).length)await fb.db.doc(base).set(prof,{merge:true});
    LocalMoM.clear();LocalMoM.save=false;history.replaceState(null,'','./');
    toast(ops.length?t('Your casebook is saved to your account.'):t('Signed in.'));
  }catch(e){console.warn(e);toast(t('Couldn’t move everything over: {error} The copy in this browser is kept.',{error:friendly(e)}));}
  moving=false;render();
}

// ---------- language (js/i18n.js) ----------
// The account remembers the language, so it follows you to other devices: once the profile loads, a different language
// saved there switches this page to it; a language picked on this device but not saved yet is saved.
var langSynced=false;
function syncLang(){
  if(langSynced||!profile||(window.LocalMoM&&LocalMoM.embed))return;langSynced=true;
  var saved=profile.lang;
  if(saved&&saved!==I18N.lang&&I18N.langs.some(function(x){return x[0]===saved;}))I18N.set(saved);
  else if(!saved&&I18N.chosen&&me)fb.db.doc('users/'+me.uid).set({lang:I18N.lang},{merge:true}).catch(function(){});
}
// picking a language in Settings or the footer saves it to the account before the page reloads in it
window.momSaveLang=function(code){if(!me||!fb||(window.LocalMoM&&LocalMoM.embed))return null;if(profile)profile.lang=code;return fb.db.doc('users/'+me.uid).set({lang:code},{merge:true});};

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
  unsub.push(uref.onSnapshot(function(s){profile=s.data()||{};syncLang();render();},function(){}));
  unsub.push(fb.db.collection('users/'+user.uid+'/plays').onSnapshot(function(q){
    plays=q.docs.map(function(d){var x=d.data();x.id=d.id;return x;}).sort(sortPlays);loaded.plays=true;
    if(!q.metadata.fromCache&&profile&&profile.playCount!==plays.length)uref.set({playCount:plays.length},{merge:true}).catch(function(){});
    render();
  },function(e){console.warn(e);loaded.plays=true;render();}));
  unsub.push(fb.db.collection('users/'+user.uid+'/people').onSnapshot(function(q){people=q.docs.map(function(d){var x=d.data();x.id=d.id;return x;});render();},function(){}));
  unsub.push(fb.db.collection('users/'+user.uid+'/groups').onSnapshot(function(q){groups=q.docs.map(function(d){var x=d.data();x.id=d.id;return x;});render();},function(){}));
  unsub.push(fb.db.collection('users/'+user.uid+'/scenarios').onSnapshot(function(q){mine=q.docs.map(function(d){var x=d.data();x.id=d.id;x.mine=true;return x;});if(loaded.plays)cleanOwnScenarios();render();},function(){}));
  unsub.push(fb.db.collection('scenarios').onSnapshot(function(q){shared=q.docs.map(function(d){var x=d.data();x.id=d.id;return x;});render();},function(){}));
  fb.db.doc('admins/'+user.uid).get().then(function(s){isAdmin=s.exists;render();}).catch(function(){});
}

momFirebase().then(function(x){
  fb=x;
  fb.auth.getRedirectResult().catch(function(e){ui.authErr=friendly(e);});
  var wantAccount=/[?&]account=1/.test(location.search);
  fb.auth.onAuthStateChanged(function(u){
    authKnown=true;me=u;
    if(u){listen(u);if(window.LocalMoM&&LocalMoM.save&&!LocalMoM.mode)moveLocal(u);if(wantAccount){wantAccount=false;history.replaceState(null,'',location.pathname);setTimeout(openAccount,400);}}else{unsub.forEach(function(f){f();});unsub=[];plays=[];isAdmin=false;}
    render();
  });
}).catch(function(e){
  console.warn(e);authKnown=true;
  app.innerHTML='<section class="sec"><h2>'+t('Can’t start')+'</h2><p class="note">'+t('The site couldn’t load its settings. If you’re offline, connect once and reload; after that it works offline.')+'</p><div class="row"><button class="btn" onclick="location.reload()">'+t('Reload')+'</button></div></section>';
});
render();
})();
