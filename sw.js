/* Mansions of Madness Casebook — offline copy of the site for the installed app.
   Pages and scripts come from the network first (so changes show up straight away) and fall back to the copy
   saved here when offline. The cache is named after the version in js/version.js; a new version clears the old one.
   Your plays themselves are kept offline by Firestore, not here. */
importScripts('/js/version.js');
var CACHE='mom-'+self.APP_VERSION;
var SHELL=['/','/index.html','/admin.html','/privacy.html','/css/app.css','/js/version.js','/js/config.js','/js/catalog.js',
  '/js/importer.js','/js/shared.js','/js/app.js','/js/admin.js','/manifest.webmanifest','/icon-192.png','/icon-512.png','/favicon-32.png'];
self.addEventListener('install',function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(SHELL.map(function(u){return new Request(u,{cache:'reload'});}));}).catch(function(){}).then(function(){return self.skipWaiting();}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k.indexOf('mom-')===0&&k!==CACHE;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));
});
self.addEventListener('fetch',function(e){
  var req=e.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==location.origin||(url.pathname.indexOf('/__/')===0&&url.pathname!=='/__/firebase/init.json'))return;
  e.respondWith(fetch(req).then(function(res){
    if(res.ok&&res.type==='basic'){var copy=res.clone();caches.open(CACHE).then(function(c){c.put(req,copy);});}
    return res;
  }).catch(function(){
    return caches.match(req,{ignoreSearch:true}).then(function(hit){
      return hit||(req.mode==='navigate'?caches.match('/index.html'):Response.error());
    });
  }));
});
