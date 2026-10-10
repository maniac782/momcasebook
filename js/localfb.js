/* Mansions of Madness Casebook — a casebook kept in this browser, without an account.
   Two uses, both on index.html only:
   - the sample casebook on the welcome page (index.html?demo=1&embed=1): invented data from js/demo.js, kept in memory,
     so nothing anyone changes there is saved;
   - "Start a casebook, no account needed": the visitor's own casebook, saved in this browser's localStorage until they
     make an account, when js/app.js copies it over (index.html?save=1) and clears it from here.
   Either way this stands in for the small part of the Firebase SDK the app uses (documents, collections, live updates,
   batches and a signed-in user), so js/app.js runs unchanged. Outside those two cases it does nothing. */
(function(){
  'use strict';
  var q=location.search,KEY='mom-local-db',FLAG='mom-local';
  var demo=/[?&]demo=1/.test(q),embed=/[?&]embed=1/.test(q),save=/[?&]save=1/.test(q);
  var ls=function(k,v){try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch(e){}return null;};
  var flagged=ls(FLAG)==='1',local=!demo&&!save&&flagged,mode=demo?'demo':local?'local':'';
  var read=function(){try{return JSON.parse(ls(KEY)||'{}')||{};}catch(e){return {};}};

  // What the welcome page and the save step need, whether or not the stand-in is in use.
  window.LocalMoM={
    mode:mode,embed:embed,save:save&&flagged,
    has:function(){var s=read();return Object.keys(s).some(function(p){return p.indexOf('users/local/')===0;});},
    // the local casebook as {profile, plays, people, groups}, each collection {id: doc}
    dump:function(){var s=read(),out={profile:s['users/local']||{},plays:{},people:{},groups:{}};
      Object.keys(s).forEach(function(p){var m=/^users\/local\/(plays|people|groups)\/([^/]+)$/.exec(p);if(m)out[m[1]][m[2]]=s[p];});return out;},
    start:function(){ls(FLAG,'1');},
    clear:function(){ls(KEY,null);ls(FLAG,null);}
  };
  if(!mode)return;
  document.documentElement.classList.add('mode-'+mode);if(embed)document.documentElement.classList.add('embed');

  var uid=demo?'sample':'local',store=demo?(window.MOM_DEMO||{}):read(),listeners=[],user=null,authCbs=[];
  var clone=function(x){return x===undefined?undefined:JSON.parse(JSON.stringify(x));};
  var saveSoon=null;
  function changed(){
    if(!demo&&!saveSoon)saveSoon=setTimeout(function(){saveSoon=null;try{localStorage.setItem(KEY,JSON.stringify(store));}catch(e){console.warn('local save',e);}},0);
    setTimeout(function(){listeners.slice().forEach(function(l){l.run();});},0);
  }
  var ID='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  function newId(){var s='';for(var i=0;i<20;i++)s+=ID.charAt(Math.floor(Math.random()*ID.length));return s;}
  function snapDoc(path){var d=store[path];return {id:path.split('/').pop(),exists:!!d,data:function(){return clone(d);},ref:docRef(path)};}
  function kids(col){var n=col.split('/').length;return Object.keys(store).filter(function(p){return p.indexOf(col+'/')===0&&p.split('/').length===n+1;}).sort();}
  function colSnap(col){var docs=kids(col).map(snapDoc);return {docs:docs,size:docs.length,empty:!docs.length,metadata:{fromCache:false},forEach:function(f){docs.forEach(f);}};}
  function listen(run){var l={run:run};listeners.push(l);setTimeout(run,0);return function(){var i=listeners.indexOf(l);if(i>=0)listeners.splice(i,1);};}
  function docRef(path){return {path:path,id:path.split('/').pop(),
    get:function(){return Promise.resolve(snapDoc(path));},
    set:function(d,o){store[path]=o&&o.merge?Object.assign({},store[path]||{},clone(d)):clone(d);changed();return Promise.resolve();},
    update:function(d){if(!store[path])return Promise.reject({code:'not-found',message:'No such document.'});Object.assign(store[path],clone(d));changed();return Promise.resolve();},
    delete:function(){delete store[path];changed();return Promise.resolve();},
    onSnapshot:function(cb){return listen(function(){cb(snapDoc(path));});}};}
  function colRef(col){var r={path:col,
    doc:function(id){return docRef(col+'/'+(id||newId()));},
    add:function(d){var x=docRef(col+'/'+newId());return x.set(d).then(function(){return x;});},
    get:function(){return Promise.resolve(colSnap(col));},
    orderBy:function(){return r;},limit:function(){return r;},where:function(){return r;},
    onSnapshot:function(cb){return listen(function(){cb(colSnap(col));});}};return r;}
  var db={doc:docRef,collection:colRef,enablePersistence:function(){return Promise.resolve();},
    batch:function(){var ops=[];return {set:function(r,d,o){ops.push(function(){return r.set(d,o);});},update:function(r,d){ops.push(function(){return r.update(d);});},
      delete:function(r){ops.push(function(){return r.delete();});},commit:function(){return Promise.all(ops.map(function(f){return f();}));}};}};
  function setUser(u){user=u;auth.currentUser=u;authCbs.slice().forEach(function(cb){cb(u);});}
  var me={uid:uid,email:'',displayName:null,photoURL:null,isAnonymous:true,providerData:[],metadata:{},
    updateProfile:function(p){this.displayName=p.displayName;return Promise.resolve();},
    // "Delete my account" in a browser-only casebook: it all goes, and the welcome page comes back
    delete:function(){if(!demo){store={};window.LocalMoM.clear();}setUser(null);return Promise.resolve();},
    getIdToken:function(){return Promise.resolve('');}};
  var no=function(){return Promise.reject({code:'auth/operation-not-allowed',message:'Not available here.'});};
  var auth={currentUser:null,onAuthStateChanged:function(cb){authCbs.push(cb);setTimeout(function(){cb(user);},0);return function(){};},
    getRedirectResult:function(){return Promise.resolve({user:null});},
    signInWithEmailAndPassword:no,createUserWithEmailAndPassword:no,signInWithPopup:no,signInWithRedirect:no,sendPasswordResetEmail:no,
    signOut:function(){setUser(null);return Promise.resolve();}};
  var app={name:'[DEFAULT]',options:{projectId:'local'},auth:function(){return auth;},firestore:function(){return db;}};
  window.FIREBASE_CONFIG={projectId:'local'};
  window.firebase={apps:[],initializeApp:function(){this.apps=[app];return app;},app:function(){return app;},
    auth:Object.assign(function(){return auth;},{GoogleAuthProvider:function(){this.setCustomParameters=function(){};}}),
    firestore:Object.assign(function(){return db;},{FieldValue:{}})};
  user=me;auth.currentUser=me;
})();
