// A tiny in-memory stand-in for the Firebase compat SDK, used only by test/ui.test.js.
(function(){
  var store={},listeners=[],user=null,authCbs=[];
  function snapDoc(path){var d=store[path];return {id:path.split('/').pop(),exists:!!d,data:function(){return d?JSON.parse(JSON.stringify(d)):undefined;},ref:docRef(path)};}
  function kids(col){var n=col.split('/').length;return Object.keys(store).filter(function(p){return p.indexOf(col+'/')===0&&p.split('/').length===n+1;}).sort();}
  function colSnap(col){var docs=kids(col).map(snapDoc);return {docs:docs,size:docs.length,metadata:{fromCache:false}};}
  function fire(){setTimeout(function(){listeners.forEach(function(l){l.run();});},0);}
  function docRef(path){return {path:path,id:path.split('/').pop(),
    get:function(){return Promise.resolve(snapDoc(path));},
    set:function(d,o){store[path]=o&&o.merge?Object.assign({},store[path]||{},JSON.parse(JSON.stringify(d))):JSON.parse(JSON.stringify(d));fire();return Promise.resolve();},
    update:function(d){if(!store[path])return Promise.reject({code:'not-found'});Object.assign(store[path],JSON.parse(JSON.stringify(d)));fire();return Promise.resolve();},
    delete:function(){delete store[path];fire();return Promise.resolve();},
    onSnapshot:function(cb){var l={run:function(){cb(snapDoc(path));}};listeners.push(l);setTimeout(l.run,0);return function(){listeners.splice(listeners.indexOf(l),1);};}};}
  var idn=0;function colRef(col){return {
    doc:function(id){return docRef(col+'/'+(id||('auto'+(++idn))));},
    add:function(d){var r=docRef(col+'/auto'+(++idn));return r.set(d).then(function(){return r;});},
    get:function(){return Promise.resolve(colSnap(col));},
    orderBy:function(){return this;},limit:function(){return this;},
    onSnapshot:function(cb){var l={run:function(){cb(colSnap(col));}};listeners.push(l);setTimeout(l.run,0);return function(){listeners.splice(listeners.indexOf(l),1);};}};}
  var db={doc:docRef,collection:colRef,enablePersistence:function(){return Promise.resolve();},
    batch:function(){var ops=[];return {set:function(r,d,o){ops.push(function(){return r.set(d,o);});},update:function(r,d){ops.push(function(){return r.update(d);});},delete:function(r){ops.push(function(){return r.delete();});},commit:function(){return Promise.all(ops.map(function(f){return f();}));}};}};
  function setUser(u){user=u;auth.currentUser=u;authCbs.forEach(function(cb){cb(u);});}
  function mkUser(email,name){return {uid:'u-'+email.replace(/\W/g,''),email:email,displayName:name||null,photoURL:null,
    updateProfile:function(p){this.displayName=p.displayName;return Promise.resolve();},delete:function(){setUser(null);return Promise.resolve();}};}
  var auth={currentUser:null,onAuthStateChanged:function(cb){authCbs.push(cb);setTimeout(function(){cb(user);},0);},
    getRedirectResult:function(){return Promise.resolve({});},
    signInWithEmailAndPassword:function(e){setUser(mkUser(e,'Dan'));return Promise.resolve({user:user});},
    createUserWithEmailAndPassword:function(e){setUser(mkUser(e));return Promise.resolve({user:user});},
    signInWithPopup:function(){setUser(mkUser('dan@example.com','Dan'));return Promise.resolve({});},
    sendPasswordResetEmail:function(){return Promise.resolve();},signOut:function(){setUser(null);return Promise.resolve();}};
  var app={name:'[DEFAULT]',auth:function(){return auth;},firestore:function(){return db;}};
  window.firebase={apps:[],initializeApp:function(){this.apps=[app];return app;},app:function(){return app;},auth:{GoogleAuthProvider:function(){this.setCustomParameters=function(){};}},firestore:{FieldValue:{}}};
  window.__fake={store:store,makeAdmin:function(uid){store['admins/'+uid]={};}};
})();
