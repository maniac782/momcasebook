/* Mansions of Madness Casebook — the admin page: accounts, the shared scenario list (Valkyrie and other scenarios
   everyone can pick), feedback and errors. Only accounts with an admins/{uid} document (made by hand in the
   Firebase console) can use it; firestore.rules enforces that, not just this page. */
(function(){
'use strict';
var MOM=window.MOM,app=document.getElementById('app'),acctEl=document.getElementById('acct');
var fb=null,me=null,authKnown=false,state='loading',users=[],scs=[],fbs=[],errs=[],loadedAt=0,unsubSc=null;
var ui={tab:'users',q:''};
var DAY=86400000;
function ago(t){if(!t)return '—';var d=Math.floor((Date.now()-t)/DAY);return d<=0?'today':d===1?'yesterday':d<30?d+' days ago':new Date(t).toLocaleDateString([], {year:'numeric',month:'short',day:'numeric'});}
function when(t){return t?new Date(t).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';}
function nameOf(uid){var u=users.filter(function(x){return x.id===uid;})[0];return u?(u.name||u.email||'(no name)'):'(deleted account)';}
function browserOf(ua){ua=String(ua||'');var os=/iPhone|iPad/.test(ua)?'iOS':/Android/.test(ua)?'Android':/Mac OS X/.test(ua)?'Mac':/Windows/.test(ua)?'Windows':/Linux/.test(ua)?'Linux':'';
  var br=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/CriOS|Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Browser';return br+(os?' on '+os:'');}

async function load(quiet){
  if(!quiet){state='loading';render();}
  try{
    var us=await fb.db.collection('users').get();users=us.docs.map(function(d){var x=d.data();x.id=d.id;return x;});
    try{var f=await fb.db.collection('feedback').orderBy('t','desc').limit(200).get();fbs=f.docs.map(function(d){var x=d.data();x.id=d.id;return x;});}catch(e){fbs=[];}
    try{var e2=await fb.db.collection('errors').orderBy('t','desc').limit(200).get();errs=e2.docs.map(function(d){var x=d.data();x.id=d.id;return x;});}catch(e){errs=[];}
    loadedAt=Date.now();state='ready';
  }catch(e){console.warn(e);state='error';}
  render();
}

function render(){
  if(!authKnown){app.innerHTML='<p class="note pad">Loading…</p>';return;}
  if(!me){acctEl.innerHTML='';app.innerHTML='<section class="sec"><h2>Admin</h2><p class="note">Sign in on the <a href="./">main page</a> first.</p></section>';return;}
  var mine=users.filter(function(u){return u.id===me.uid;})[0]||{};
  acctEl.innerHTML=accountMenu(me,{home:true,photo:mine.photo,name:mine.name});
  if(state==='denied'){app.innerHTML='<section class="sec"><h2>Admin</h2><p class="note">This page is only for the site’s admins.</p><div class="row"><a class="btn" href="./">Back to the site</a></div></section>';return;}
  if(state==='loading'){app.innerHTML='<p class="note pad">Loading…</p>';return;}
  if(state==='error'){app.innerHTML='<section class="sec"><h2>Couldn’t load</h2><p class="note">The database refused the request. If you just made yourself an admin, wait a minute for the rules and try again.</p><div class="row"><button class="btn" data-a="reload">Try again</button></div></section>';return;}
  var keep=document.activeElement&&document.activeElement.tagName==='INPUT'&&document.activeElement.id;
  var plays=users.reduce(function(n,u){return n+(u.playCount||0);},0),week=users.filter(function(u){return (u.lastSeen||0)>Date.now()-7*DAY;}).length;
  var h='<div class="stats">'+[['Accounts',users.length],['Active this week',week],['Plays logged',plays],['Shared scenarios',scs.length]].map(function(x){return '<div class="stat"><span class="lbl">'+x[0]+'</span><b class="num">'+x[1]+'</b></div>';}).join('')+'</div>';
  var open=fbs.filter(function(f){return !f.done;}).length;
  h+='<div class="bar"><div class="tabs" role="tablist">'+[['users','Accounts'],['scs','Shared scenarios'],['fb','Feedback'+(open?' ('+open+')':'')],['errs','Errors'+(errs.length?' ('+errs.length+')':'')]].map(function(t){return '<button class="tab" role="tab" aria-selected="'+(ui.tab===t[0])+'" data-a="tab" data-t="'+t[0]+'">'+t[1]+'</button>';}).join('')+'</div>'+
    '<button class="btn sm" data-a="reload" title="Loaded '+esc(new Date(loadedAt).toLocaleTimeString())+'">Refresh</button></div>';
  h+=ui.tab==='scs'?scsHtml():ui.tab==='fb'?fbHtml():ui.tab==='errs'?errsHtml():usersHtml();
  app.innerHTML=h;
  if(keep){var el=document.getElementById(keep);if(el){el.focus();try{el.setSelectionRange(el.value.length,el.value.length);}catch(e){}}}
}
function usersHtml(){
  var q=ui.q.trim().toLowerCase();
  var list=users.filter(function(u){return !q||((u.name||'')+' '+(u.email||'')).toLowerCase().indexOf(q)>=0;}).sort(function(a,b){return (b.lastSeen||0)-(a.lastSeen||0);});
  return '<label class="field"><span class="lbl">Search</span><input class="f" id="q" value="'+esc(ui.q)+'" placeholder="Name or email" autocomplete="off"></label>'+
    (list.length?'<ul class="adm">'+list.map(function(u){return '<li>'+avatarHtml(u.name||u.email,u.photo,u.color)+'<div class="grow"><span class="row tight"><b>'+esc(u.name||'(no name)')+'</b>'+(u.id===me.uid?'<span class="chip ok">You</span>':'')+'</span>'+
      '<span class="note">'+esc(u.email||'')+' · '+(u.playCount||0)+' play'+(u.playCount===1?'':'s')+' · joined '+esc(ago(u.created))+' · last seen '+esc(ago(u.lastSeen))+'</span></div></li>';}).join('')+'</ul>':'<p class="note">No accounts match.</p>')+
    '<p class="note">To remove an account, delete it in Firebase › Authentication and its document under <code>users</code> in Firestore. People can also delete their own from Settings.</p>';
}
function scsHtml(){
  var list=scs.slice().sort(function(a,b){return (a.type||'').localeCompare(b.type||'')||a.name.localeCompare(b.name);});
  return '<section class="sec"><h2>Add a shared scenario</h2><p class="note">Everyone can pick these when logging a play. The '+MOM.OFFICIAL.length+' official and '+MOM.VALKYRIE.length+' Valkyrie scenarios are already built in; use this for anything missing, such as a Valkyrie scenario newer than the built-in list (refresh that with <code>scripts/fetch-valkyrie.py</code>).</p>'+
    '<form class="stack" data-form="addsc"><div class="grid2"><label class="field"><span class="lbl">Name</span><input class="f" id="sc-name" maxlength="80" required></label>'+
    '<label class="field"><span class="lbl">Kind</span><select class="f" id="sc-type"><option value="valkyrie">Valkyrie</option><option value="official">Official</option></select></label>'+
    '<label class="field"><span class="lbl">Author (optional)</span><input class="f" id="sc-author" maxlength="60"></label>'+
    '<label class="field"><span class="lbl">Link (optional)</span><input class="f" id="sc-link" type="url" maxlength="300" placeholder="https://"></label></div>'+
    '<div class="row"><button class="btn pri" type="submit">Add</button></div></form></section>'+
    (list.length?'<ul class="adm">'+list.map(function(s){return '<li><div class="grow"><b>'+esc(s.name)+'</b><span class="note">'+esc(s.type==='official'?'Official':'Valkyrie')+(s.author?' · by '+esc(s.author):'')+(s.link&&/^https:\/\//.test(s.link)?' · <a href="'+esc(s.link)+'" target="_blank" rel="noopener">link</a>':'')+'</span></div>'+
      '<button class="btn sm" data-a="delsc" data-id="'+esc(s.id)+'">Remove</button></li>';}).join('')+'</ul>':'<p class="note">No shared scenarios yet. The '+MOM.OFFICIAL.length+' official and '+MOM.VALKYRIE.length+' Valkyrie scenarios are built in.</p>');
}
function fbHtml(){
  if(!fbs.length)return '<p class="note">No feedback yet.</p>';
  return '<ul class="adm">'+fbs.map(function(f){return '<li class="'+(f.done?'done':'')+'"><div class="grow"><span class="row tight"><span class="chip '+(f.kind==='bug'?'bad':f.kind==='idea'?'ok':'muted')+'">'+esc(f.kind==='bug'?'Problem':f.kind==='idea'?'Idea':'Other')+'</span><b>'+esc(nameOf(f.uid))+'</b><span class="note">'+esc(when(f.t))+' · '+esc(f.v||'')+' · '+esc(browserOf(f.ua))+'</span></span>'+
    '<span class="msg">'+esc(f.msg)+'</span></div><div class="row tight">'+(f.done?'':'<button class="btn sm" data-a="fbdone" data-id="'+esc(f.id)+'">Done</button>')+'<button class="btn sm ghost" data-a="fbdel" data-id="'+esc(f.id)+'">Delete</button></div></li>';}).join('')+'</ul>';
}
function errsHtml(){
  if(!errs.length)return '<p class="note">No errors recorded.</p>';
  return '<div class="row"><button class="btn sm" data-a="clearerrs">Clear all</button></div><ul class="adm">'+errs.map(function(e){return '<li><div class="grow"><b class="mono">'+esc(e.msg)+'</b><span class="note">'+esc(when(e.t))+' · '+esc(e.page)+' · '+esc(e.v||'')+' · '+esc(browserOf(e.ua))+' · '+esc(nameOf(e.uid))+'</span>'+
    (e.stack?'<details><summary class="note">Stack</summary><pre>'+esc(e.stack)+'</pre></details>':'')+'</div><button class="btn sm ghost" data-a="errdel" data-id="'+esc(e.id)+'">Clear</button></li>';}).join('')+'</ul>';
}

app.addEventListener('click',function(e){
  var a=e.target.closest('[data-a]');if(!a)return;var k=a.dataset.a,id=a.dataset.id;
  var fail=function(err){console.warn(err);toast('That didn’t work. Try again.');};
  if(k==='tab'){ui.tab=a.dataset.t;render();}
  else if(k==='reload')load();
  else if(k==='delsc'){if(a.dataset.sure){fb.db.doc('scenarios/'+id).delete().catch(fail);}else{a.dataset.sure='1';a.textContent='Remove?';a.classList.add('dng');}}
  else if(k==='fbdone')fb.db.doc('feedback/'+id).update({done:true}).then(function(){fbs.forEach(function(f){if(f.id===id)f.done=true;});render();}).catch(fail);
  else if(k==='fbdel')fb.db.doc('feedback/'+id).delete().then(function(){fbs=fbs.filter(function(f){return f.id!==id;});render();}).catch(fail);
  else if(k==='errdel')fb.db.doc('errors/'+id).delete().then(function(){errs=errs.filter(function(x){return x.id!==id;});render();}).catch(fail);
  else if(k==='clearerrs')Promise.all(errs.map(function(x){return fb.db.doc('errors/'+x.id).delete();})).then(function(){errs=[];render();}).catch(fail);
});
app.addEventListener('input',function(e){if(e.target.id==='q'){ui.q=e.target.value;render();}});
app.addEventListener('submit',function(e){
  if(!e.target.matches('[data-form=addsc]'))return;e.preventDefault();
  var nm=document.getElementById('sc-name').value.trim().replace(/\s+/g,' '),type=document.getElementById('sc-type').value,link=document.getElementById('sc-link').value.trim();
  if(!nm)return;
  if(MOM.OFFICIAL.concat(MOM.VALKYRIE,scs).some(function(s){return MOM.key(s.name)===MOM.key(nm);})){toast('“'+nm+'” is already on the list.');return;}
  var pre=type==='official'?'o-':'v-';
  fb.db.doc('scenarios/'+pre+MOM.slug(nm)).set({name:nm,type:type,author:document.getElementById('sc-author').value.trim().slice(0,60),link:/^https:\/\//.test(link)?link:'',created:Date.now(),by:me.uid})
    .then(function(){toast('Added.');}).catch(function(err){console.warn(err);toast('Couldn’t add that.');});
});

momFirebase().then(function(x){
  fb=x;
  fb.auth.onAuthStateChanged(async function(u){
    authKnown=true;me=u;if(unsubSc){unsubSc();unsubSc=null;}
    if(!u){render();return;}
    try{var a=await fb.db.doc('admins/'+u.uid).get();if(!a.exists){state='denied';render();return;}}catch(e){state='denied';render();return;}
    unsubSc=fb.db.collection('scenarios').onSnapshot(function(q){scs=q.docs.map(function(d){var x=d.data();x.id=d.id;return x;});if(state==='ready')render();},function(){});
    load();
  });
}).catch(function(){authKnown=true;app.innerHTML='<section class="sec"><h2>Can’t start</h2><p class="note">The site couldn’t load its settings.</p></section>';});
render();
})();
