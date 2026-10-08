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
var fb=null,me=null,authKnown=false,profile=null,plays=[],mine=[],shared=[],isAdmin=false,loaded={plays:false},unsub=[];
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
  acctEl.innerHTML=accountMenu(me,{admin:isAdmin});
  var keep=document.activeElement&&/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)&&document.activeElement.id;
  var tabs=[['plays','Plays'],['scenarios','Scenarios'],['stats','Stats'],['settings','Settings']];
  var h='<div class="bar"><div class="tabs" role="tablist">'+tabs.map(function(t){return '<button class="tab" role="tab" aria-selected="'+(ui.tab===t[0])+'" data-a="tab" data-t="'+t[0]+'">'+t[1]+'</button>';}).join('')+'</div>'+
    '<button class="btn pri" data-a="log">+ Log a play</button></div>';
  h+=ui.tab==='scenarios'?scenariosHtml():ui.tab==='stats'?statsHtml():ui.tab==='settings'?settingsHtml():playsHtml();
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
    if(q){var hay=[p.scenarioName,p.notes,p.rules].concat((p.party||[]).map(function(s){return s.player+' '+s.investigator;})).join(' ').toLowerCase();if(hay.indexOf(q)<0)return false;}
    return true;
  });
}
function playsHtml(){
  if(!loaded.plays)return '<p class="note pad">Loading your plays…</p>';
  if(!plays.length)return '<section class="sec empty"><h2>No plays yet</h2><p class="note">Log your first game with <b>+ Log a play</b>, or bring in the spreadsheet you’ve been keeping.</p>'+
    '<div class="row"><button class="btn pri" data-a="log">+ Log a play</button><button class="btn" data-a="goimport">Import a spreadsheet</button></div></section>';
  var list=filtered(),people=names('player'),invs=names('investigator');
  var scs={};plays.forEach(function(p){scs[p.scenarioId]=p.scenarioName;});
  var h='<div class="filters"><label class="field grow"><span class="lbl">Search</span><input class="f" id="q" type="search" value="'+esc(ui.q)+'" placeholder="Scenario, person, investigator or notes" autocomplete="off"></label>'+
    sel('fres','Result',ui.result,[['','Any'],['pass','Passed'],['fail','Failed'],['abandoned','Abandoned']])+
    sel('fpl','Player or investigator',ui.player,[['','Anyone']].concat(people.map(function(n){return [n,n];}),invs.length?[['-','────']]:[],invs.map(function(n){return [n,n];})))+
    sel('fsc','Scenario',ui.scen,[['','Any']].concat(Object.keys(scs).sort(function(a,b){return scs[a].localeCompare(scs[b]);}).map(function(k){return [k,scs[k]];})))+'</div>';
  var any=ui.q||ui.result||ui.player||ui.scen;
  h+='<p class="note count">'+list.length+' of '+plays.length+' play'+(plays.length===1?'':'s')+(any?' · <a href="#" data-a="clearf">Clear filters</a>':'')+'</p>';
  if(!list.length)return h+'<p class="note">Nothing matches.</p>';
  h+='<ul class="plays">'+list.map(function(p){
    var t=p.scenarioType&&p.scenarioType!=='official'?'<span class="chip tag">'+typeName(p.scenarioType)+'</span>':'';
    return '<li><button class="play" data-a="edit" data-id="'+esc(p.id)+'">'+
      '<span class="pl-top"><span class="pl-date num">'+esc(fmtDate(p.date))+'</span>'+resChip(p.result)+(p.attempts>1?'<span class="chip muted">'+p.attempts+' tries</span>':'')+t+'</span>'+
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
function scenariosHtml(){
  var st=scenStats(),own=owned(),f=ui.sfilter,sq=(ui.sq||'').trim().toLowerCase();
  var keep=function(s){var x=st[s.id];if(sq&&((s.name||'')+' '+(s.author||'')).toLowerCase().indexOf(sq)<0)return false;return f==='all'||(f==='new'&&!x)||(f==='unbeaten'&&(!x||!x.pass))||(f==='beaten'&&x&&x.pass);};
  var row=function(s){
    var x=st[s.id],chip=!x?'<span class="chip muted">Not played</span>':x.pass?'<span class="chip ok">Beaten</span>':'<span class="chip bad">Not beaten yet</span>';
    var meta=x?x.n+' play'+(x.n===1?'':'s')+(x.n?' · '+x.pass+' passed':'')+(x.last?' · last '+esc(fmtDate(x.last)):''):'';
    var by=[s.author?'by '+esc(s.author):'',s.difficulty?diffName(s.difficulty):'',s.minutes?esc(lenText(s.minutes)):''].filter(Boolean).join(' \u00b7 ');
    return '<li class="sc"><div class="grow"><span class="row tight"><b>'+(x?'<a href="#" data-a="scplays" data-id="'+esc(s.id)+'">'+esc(s.name)+'</a>':esc(s.name))+'</b>'+chip+'</span>'+
      ((meta||by||s.link)?'<span class="note">'+[meta,by].filter(Boolean).join(' · ')+(s.link&&/^https:\/\//.test(s.link)?(meta||by?' · ':'')+'<a href="'+esc(s.link)+'" target="_blank" rel="noopener">Details</a>':'')+'</span>':'')+'</div>'+
      '<div class="row tight"><button class="btn sm" data-a="log" data-sc="'+esc(s.id)+'">Log a play</button>'+
      (s.mine&&!x?'<button class="btn sm ghost" data-a="delsc" data-id="'+esc(s.id)+'" aria-label="Remove '+esc(s.name)+'">Remove</button>':'')+'</div></li>';
  };
  var group=function(title,list,sub){list=list.filter(keep);if(!list.length)return '';return '<section class="sec"><div class="sec-head"><h2>'+esc(title)+'</h2>'+(sub?'<span class="note">'+sub+'</span>':'')+'</div><ul class="scs">'+list.map(row).join('')+'</ul></section>';};
  var offIds=MOM.OFFICIAL.filter(function(s){return own.indexOf(s.product)>=0;}),beat=offIds.filter(function(s){return st[s.id]&&st[s.id].pass;}).length;
  var h='<div class="filters"><label class="field grow"><span class="lbl">Search</span><input class="f" id="sq" type="search" value="'+esc(ui.sq||'')+'" placeholder="Scenario or author" autocomplete="off"></label><div class="seg" role="radiogroup" aria-label="Show">'+[['all','All'],['new','Not played'],['unbeaten','Not beaten'],['beaten','Beaten']].map(function(o){return '<label><input type="radio" name="sf" value="'+o[0]+'"'+(f===o[0]?' checked':'')+'><span>'+o[1]+'</span></label>';}).join('')+'</div>'+
    '<button class="btn" data-a="addsc">Add a scenario</button></div>'+
    '<p class="note count">Official scenarios beaten: <b>'+beat+' of '+offIds.length+'</b>'+(own.length<MOM.PRODUCTS.length?' (from the products you own; change them in Settings)':'')+'</p>';
  MOM.PRODUCTS.forEach(function(p){if(own.indexOf(p.id)>=0)h+=group(p.name,MOM.OFFICIAL.filter(function(s){return s.product===p.id;}));});
  var shownKeys={};MOM.OFFICIAL.forEach(function(s){shownKeys[MOM.key(s.name)]=1;});
  var extra=function(list){return list.filter(function(s){var k=MOM.key(s.name);if(shownKeys[k])return false;shownKeys[k]=1;return true;});};
  // the built-in Valkyrie list (or, with it switched off in Settings, just the ones you've played), then shared and your own
  var valk=extra((showValk()?MOM.VALKYRIE:MOM.VALKYRIE.filter(function(s){return st[s.id];})).concat(shared,mine).filter(function(s){return s.type==='valkyrie';}));
  var own2=extra(shared.concat(mine).filter(function(s){return s.type!=='valkyrie';}));
  h+=group('Valkyrie scenarios',valk,showValk()?MOM.VALKYRIE.length+' from the Valkyrie app\u2019s catalogue':'The full list is switched off in Settings')+group('Other scenarios',own2,'Homemade and anything else');
  if(sq&&h.indexOf('<ul class="scs">')<0)h+='<p class="note">No scenarios match \u201c'+esc(ui.sq)+'\u201d. Use <b>Add a scenario</b> if it\u2019s missing.</p>';
  return h;
}

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
  h+=table('Rules',tally(function(p){return [p.rules||'Not recorded'];}),'Rules');
  h+=table('Scenario type',tally(function(p){return [typeName(p.scenarioType||'official')];}),'Type');
  if(!names('player').length)h+='<p class="note">Add who played to your plays to see stats per person.</p>';
  return h;
}

function settingsHtml(){
  var own=owned(),imp=ui.imp;
  var h='<section class="sec"><h2>You</h2><form class="row bottom" data-form="name"><label class="field grow"><span class="lbl">Your name</span><input class="f" id="s-name" maxlength="40" value="'+esc(myName())+'"></label><button class="btn" type="submit">Save</button></form>'+
    '<p class="note">It’s filled in as the first player when you log a play. Signed in as '+esc(me.email||me.displayName||'')+'.</p></section>';
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
    '<input class="f" name="pi" list="dl-inv" placeholder="Investigator" maxlength="40" value="'+esc(s.investigator||'')+'" aria-label="Investigator">'+
    '<button class="x" type="button" data-f="rmseat" aria-label="Remove this seat">×</button></div>';};
  var invs=MOM.INVESTIGATORS.slice();names('investigator').forEach(function(n){if(invs.indexOf(n)<0)invs.push(n);});invs.sort();
  var ppl=names('player');if(myName()&&ppl.indexOf(myName())<0)ppl.unshift(myName());
  var res=p.result||'';
  return '<form class="stack" data-form="play"'+(editing?' data-id="'+esc(p.id)+'"':'')+'>'+
    '<div class="dlg-head"><h2>'+(editing?'Edit play':'Log a play')+'</h2><button class="x" type="button" data-close aria-label="Close">×</button></div>'+
    '<label class="field"><span class="lbl">Scenario</span><select class="f" name="sc" required>'+opts+'</select></label>'+
    '<div class="newsc" hidden><div class="grid2"><label class="field"><span class="lbl">Scenario name</span><input class="f" name="nsname" maxlength="80"></label>'+
    '<label class="field"><span class="lbl">Kind</span><select class="f" name="nstype"><option value="valkyrie">Valkyrie</option><option value="custom">Other / homemade</option></select></label></div></div>'+
    '<div class="grid2"><label class="field"><span class="lbl">Date</span><input class="f" type="date" name="date" value="'+esc(editing?p.date||'':today())+'" max="'+today()+'"></label>'+
    '<label class="field"><span class="lbl">Attempt</span><input class="f num" type="number" name="att" min="1" max="99" value="'+(p.attempts||1)+'" aria-describedby="att-h"><small class="note" id="att-h">Which try this was</small></label></div>'+
    '<fieldset class="field"><legend class="lbl">Result</legend><div class="seg big" role="radiogroup">'+[['pass','Passed'],['fail','Failed'],['abandoned','Abandoned']].map(function(r){return '<label class="'+r[0]+'"><input type="radio" name="res" value="'+r[0]+'"'+(res===r[0]?' checked':'')+' required><span>'+r[1]+'</span></label>';}).join('')+'</div></fieldset>'+
    '<fieldset class="field"><legend class="lbl">Who played</legend><div class="seats">'+party.map(seat).join('')+'</div><div class="row"><button class="btn sm" type="button" data-f="addseat">+ Add a player</button></div></fieldset>'+
    '<label class="field"><span class="lbl">Rules</span><input class="f" name="rules" list="dl-rules" maxlength="80" value="'+esc(editing?p.rules||'':(last&&last.rules)||'Normal rules')+'"></label>'+
    '<label class="field"><span class="lbl">Notes</span><textarea class="f" name="notes" rows="4" maxlength="4000" placeholder="What happened? Anything to remember next time?">'+esc(p.notes||'')+'</textarea></label>'+
    '<datalist id="dl-pl">'+ppl.map(function(n){return '<option value="'+esc(n)+'">';}).join('')+'</datalist>'+
    '<datalist id="dl-inv">'+invs.map(function(n){return '<option value="'+esc(n)+'">';}).join('')+'</datalist>'+
    '<datalist id="dl-rules">'+rulesUsed().map(function(n){return '<option value="'+esc(n)+'">';}).join('')+'</datalist>'+
    '<p class="err" role="alert" hidden></p>'+
    '<div class="row end">'+(editing?'<button class="btn dng ghost" type="button" data-f="del" style="margin-right:auto">Delete</button>':'')+'<button class="btn" type="button" data-close>Cancel</button><button class="btn pri" type="submit">'+(editing?'Save':'Log play')+'</button></div></form>';
}
function openPlay(p,preset){
  var d=openDialog(playForm(p,preset),p&&p.id?'Edit play':'Log a play'),f=d.querySelector('form'),err=f.querySelector('.err');
  var seatHtml=f.querySelector('.seat').outerHTML;
  var syncNew=function(){var on=f.sc.value==='__new';f.querySelector('.newsc').hidden=!on;f.nsname.required=on;if(on)f.nsname.focus();};
  f.sc.addEventListener('change',syncNew);
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
  var party=[];f.querySelectorAll('.seat').forEach(function(s){var a=s.querySelector('[name=pp]').value.trim(),b=s.querySelector('[name=pi]').value.trim();if(a||b)party.push({player:a.slice(0,40),investigator:MOM.fullInvestigator(b).slice(0,40)});});
  var att=Math.max(1,Math.min(99,parseInt(f.att.value,10)||1));
  var doc={scenarioId:sc.id,scenarioName:sc.name,scenarioType:sc.type||'official',date:f.date.value||'',result:res,attempts:att,
    party:party,solo:party.length===1,rules:f.rules.value.trim().slice(0,80),notes:f.notes.value.trim().slice(0,4000),updated:Date.now()};
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
  else if(k==='edit'){var p=plays.filter(function(x){return x.id===a.dataset.id;})[0];if(p)openPlay(p);}
  else if(k==='clearf'){ui.q=ui.result=ui.player=ui.scen='';render();}
  else if(k==='scplays'){ui.q=ui.result=ui.player='';ui.scen=a.dataset.id;ui.tab='plays';render();window.scrollTo(0,0);}
  else if(k==='addsc')addScenarioDialog();
  else if(k==='delsc'){var s=mine.filter(function(x){return x.id===a.dataset.id;})[0];if(s)confirmDialog('Remove scenario','Remove <b>'+esc(s.name)+'</b> from your list?','Remove',function(){return fb.db.doc('users/'+me.uid+'/scenarios/'+s.id).delete();});}
  else if(k==='goimport'){ui.tab='settings';render();var el=document.getElementById('import');if(el)el.scrollIntoView();}
  else if(k==='doimport')runImport();
  else if(k==='cancelimport'){ui.imp=null;render();}
  else if(k==='csv')download('mansions-plays.csv',I.toCSV(plays.slice().sort(sortPlays)),'text/csv');
  else if(k==='json')download('mansions-backup.json',JSON.stringify({exported:new Date().toISOString(),version:self.APP_VERSION,plays:plays,scenarios:mine},null,1),'application/json');
  else if(k==='wipe')confirmDialog('Delete all plays','All '+plays.length+' plays go for good. Download a copy first if you might want them.','Delete all plays',function(){return deleteAll('plays').then(function(){toast('All plays deleted.');});});
  else if(k==='delacct')confirmDialog('Delete my account','Your plays, your scenarios and your sign-in all go for good. This can’t be undone.','Delete my account',async function(){
    await deleteAll('plays');await deleteAll('scenarios');await fb.db.doc('users/'+me.uid).delete();
    try{await me.delete();}catch(err){if(err.code==='auth/requires-recent-login'){await fb.auth.signOut();throw {msg:'Your plays are deleted. To remove the sign-in too, sign in again and choose Delete my account once more.'};}throw err;}
    location.href='./';
  });
  else if(k==='google')googleSignIn();
  else if(k==='mode'){ui.authMode=a.dataset.m;ui.authErr='';render();}
});
app.addEventListener('input',function(e){if(e.target.id==='q'){ui.q=e.target.value;render();}else if(e.target.id==='sq'){ui.sq=e.target.value;render();}else if(e.target.id==='imp-link')ui.impLink=e.target.value;});
app.addEventListener('change',function(e){
  var t=e.target;
  if(t.id==='fres'){ui.result=t.value;render();}else if(t.id==='fpl'){ui.player=t.value;render();}else if(t.id==='fsc'){ui.scen=t.value;render();}
  else if(t.name==='sf'){ui.sfilter=t.value;render();}
  else if(t.id==='s-valk')fb.db.doc('users/'+me.uid).set({hideValkyrie:!t.checked},{merge:true}).catch(function(err){toast(friendly(err));});
  else if(t.dataset.own){var o=owned().slice(),i=o.indexOf(t.dataset.own);if(t.checked&&i<0)o.push(t.dataset.own);if(!t.checked&&i>=0)o.splice(i,1);
    fb.db.doc('users/'+me.uid).set({owned:o},{merge:true}).catch(function(err){toast(friendly(err));});}
  else if(t.id==='imp-file'&&t.files[0]){var r=new FileReader();r.onload=function(){prepareImport(I.parseCSV(r.result));render();};r.readAsText(t.files[0]);t.value='';}
});
app.addEventListener('submit',function(e){
  var f=e.target.closest('[data-form]');if(!f)return;e.preventDefault();var k=f.getAttribute('data-form');
  if(k==='auth')emailAuth();
  else if(k==='name'){var n=document.getElementById('s-name').value.trim().slice(0,40);fb.db.doc('users/'+me.uid).set({name:n},{merge:true}).then(function(){toast('Saved.');}).catch(function(err){toast(friendly(err));});}
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
  unsub.forEach(function(u){u();});unsub=[];plays=[];mine=[];shared=[];profile=null;loaded.plays=false;
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
  unsub.push(fb.db.collection('users/'+user.uid+'/scenarios').onSnapshot(function(q){mine=q.docs.map(function(d){var x=d.data();x.id=d.id;x.mine=true;return x;});render();},function(){}));
  unsub.push(fb.db.collection('scenarios').onSnapshot(function(q){shared=q.docs.map(function(d){var x=d.data();x.id=d.id;return x;});render();},function(){}));
  fb.db.doc('admins/'+user.uid).get().then(function(s){isAdmin=s.exists;render();}).catch(function(){});
}

momFirebase().then(function(x){
  fb=x;
  fb.auth.getRedirectResult().catch(function(e){ui.authErr=friendly(e);});
  fb.auth.onAuthStateChanged(function(u){
    authKnown=true;me=u;
    if(u)listen(u);else{unsub.forEach(function(f){f();});unsub=[];plays=[];isAdmin=false;}
    render();
  });
}).catch(function(e){
  console.warn(e);authKnown=true;
  app.innerHTML='<section class="sec"><h2>Can’t start</h2><p class="note">The site couldn’t load its settings. If you’re offline, connect once and reload; after that it works offline.</p><div class="row"><button class="btn" onclick="location.reload()">Reload</button></div></section>';
});
render();
})();
