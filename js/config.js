/* Mansions of Madness Ledger — Firebase start-up, shared by every page.
   The Firebase web settings are read from /__/firebase/init.json, which Firebase Hosting serves for this project
   automatically, so nothing needs pasting into the code. (They aren't secret anyway: they only name the project;
   firestore.rules decides what anyone can do.) For a local copy outside Firebase Hosting, set
   window.FIREBASE_CONFIG = {...} before this file loads. */
(function(){
'use strict';
var ready=null;
window.momFirebase=function(){
  if(ready)return ready;
  ready=(window.FIREBASE_CONFIG?Promise.resolve(window.FIREBASE_CONFIG):
    fetch('/__/firebase/init.json',{cache:'no-cache'}).then(function(r){if(!r.ok)throw new Error('init '+r.status);return r.json();}))
  .then(function(cfg){
    var app=firebase.apps.length?firebase.app():firebase.initializeApp(cfg);
    var db=app.firestore();
    // Keep a copy in the browser so the log opens and saves offline; changes sync when back online.
    try{db.enablePersistence({synchronizeTabs:true}).catch(function(){});}catch(e){}
    return {app:app,auth:app.auth(),db:db,cfg:cfg};
  });
  return ready;
};

/* Unexpected errors on any page are written (quietly, a few per visit at most) to the `errors` collection,
   which only admins can read, on the admin page. Nothing is sent for people who aren't signed in. */
(function(){
  var sent=0,seen={};
  function report(msg,stack){
    try{
      msg=String(msg||'').slice(0,500);
      if(!msg||msg==='Script error.'||/ResizeObserver loop|resource-exhausted|Failed to fetch|NetworkError|network-request-failed|IndexedDB|IDBDatabase|in-progress transaction/i.test(msg))return;
      if(/ethereum|web3|solana|__gCrWeb|webkit\.messageHandlers|__firefox__/i.test(msg+' '+String(stack||'')))return;
      if(seen[msg]||sent>=5||!window.firebase||!firebase.apps.length)return;
      var u=firebase.app().auth().currentUser;if(!u)return;
      seen[msg]=1;sent++;
      firebase.app().firestore().collection('errors').add({msg:msg,stack:String(stack||'').slice(0,2000),
        page:(location.pathname+location.search).slice(0,300),ua:String(navigator.userAgent||'').slice(0,300),
        v:String(self.APP_VERSION||''),t:Date.now(),uid:u.uid}).catch(function(){});
    }catch(e){}
  }
  window.reportError=report;
  window.addEventListener('error',function(e){if(e.filename&&e.filename.indexOf(location.origin)!==0)return;report(e.message||(e.error&&e.error.message),e.error&&e.error.stack);});
  window.addEventListener('unhandledrejection',function(e){var r=e.reason||{};report(r.message||String(r),r.stack);});
})();

/* Show the version in the footer, and keep the installed app's offline copy up to date. */
document.addEventListener('DOMContentLoaded',function(){
  var v=document.getElementById('ver');if(v)v.textContent=self.APP_VERSION||'';
});
if('serviceWorker' in navigator&&location.protocol==='https:'){
  window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});
}
})();
