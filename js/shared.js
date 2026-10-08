/* Mansions of Madness Casebook — helpers used on every page: escaping, the toast, dialogs, profile pictures,
   the account menu, Install app and Send feedback. */
(function(){
'use strict';
var esc=window.esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
var toastT;
window.toast=function(m){var t=document.getElementById('toast');if(!t)return;t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(function(){t.hidden=true;},3200);};

/* A simple modal. html is the dialog's inner markup; returns the dialog element. Closes on Escape,
   a click outside, or anything marked data-close. */
window.openDialog=function(html,label){
  var bg=document.createElement('div');bg.className='dlg-bg';
  bg.innerHTML='<div class="dlg" role="dialog" aria-modal="true" aria-label="'+esc(label||'')+'">'+html+'</div>';
  document.body.appendChild(bg);
  var prev=document.activeElement;
  var close=function(){bg.remove();document.removeEventListener('keydown',key);if(prev&&prev.focus)try{prev.focus();}catch(e){}};
  var key=function(e){if(e.key==='Escape')close();};
  document.addEventListener('keydown',key);
  bg.addEventListener('click',function(e){if(e.target===bg||e.target.closest('[data-close]'))close();});
  bg.close=close;
  var f=bg.querySelector('input,textarea,select,button.pri');if(f)setTimeout(function(){f.focus();},30);
  return bg;
};

/* ---------- Install as an app ----------
   Chrome, Edge and Android give a one-tap install prompt (kept from beforeinstallprompt);
   iPhone and iPad need Share > Add to Home Screen, so those get short steps instead. */
var deferred=null;
window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferred=e;});
window.addEventListener('appinstalled',function(){deferred=null;});
window.isInstalledApp=function(){try{return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}catch(e){return false;}};
window.openInstall=function(){
  if(deferred){var d=deferred;deferred=null;d.prompt();return;}
  var ua=navigator.userAgent||'',ios=/iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1),android=/Android/.test(ua);
  var steps=ios?['Tap the <b>Share</b> button (the square with an arrow) in Safari’s toolbar.','Scroll down and tap <b>Add to Home Screen</b>.','Tap <b>Add</b>. The casebook appears on your home screen and opens full-screen.']:
    android?['Tap the browser’s <b>⋮</b> menu (top right in Chrome).','Tap <b>Install app</b> or <b>Add to Home screen</b>.','Open Mansions of Madness Casebook from your home screen.']:
    ['In Chrome or Edge, click the <b>install</b> icon at the right end of the address bar, or open the browser menu and choose <b>Install Mansions of Madness Casebook</b>.','Open it from your Start menu, Dock or desktop like any other app. (Safari on a Mac: <b>File › Add to Dock</b>.)'];
  openDialog('<div class="dlg-head"><h2>Install the app</h2><button class="x" type="button" data-close aria-label="Close">×</button></div>'+
    '<p class="note">It opens full-screen with its own icon, and works offline: plays you log without a connection sync when you’re back online.</p>'+
    '<ol class="steps">'+steps.map(function(s){return '<li>'+s+'</li>';}).join('')+'</ol>'+
    (ios?'<p class="note">You’ll sign in once more inside the app; after that it remembers you.</p>':'')+
    '<div class="row end"><button class="btn pri" type="button" data-close>Got it</button></div>','Install the app');
};

/* ---------- Send feedback (read on the admin page) ---------- */
window.openFeedback=function(){
  var u=window.firebase&&firebase.apps.length&&firebase.app().auth().currentUser;if(!u)return;
  var d=openDialog('<form class="stack" data-fb><div class="dlg-head"><h2>Send feedback</h2><button class="x" type="button" data-close aria-label="Close">×</button></div>'+
    '<div class="seg" role="radiogroup" aria-label="Kind">'+[['bug','Something’s wrong'],['idea','An idea'],['other','Other']].map(function(k,i){return '<label><input type="radio" name="fbk" value="'+k[0]+'"'+(i===0?' checked':'')+'><span>'+k[1]+'</span></label>';}).join('')+'</div>'+
    '<label class="field"><span class="lbl">Message</span><textarea class="f" name="msg" rows="5" maxlength="3000" required></textarea></label>'+
    '<div class="row end"><button class="btn" type="button" data-close>Cancel</button><button class="btn pri" type="submit">Send</button></div></form>','Send feedback');
  d.querySelector('form').addEventListener('submit',function(e){
    e.preventDefault();var f=e.target,b=f.querySelector('[type=submit]');b.disabled=true;
    firebase.app().firestore().collection('feedback').add({kind:(f.querySelector('input[name=fbk]:checked')||{}).value||'other',
      msg:f.msg.value.trim().slice(0,3000),page:location.pathname,ua:String(navigator.userAgent).slice(0,300),
      v:String(self.APP_VERSION||''),t:Date.now(),uid:u.uid,name:(u.displayName||'').slice(0,60),done:false})
    .then(function(){d.close();toast('Thanks! Feedback sent.');}).catch(function(){b.disabled=false;toast('Couldn’t send that. Try again.');});
  });
};

/* ---------- Profile pictures ----------
   A picture is a small square JPEG (256x256) kept as text in the person's users/{uid} document as `photo`
   (Firebase's file storage would need the paid plan). Google sign-ins show their Google photo until they choose one. */
var PIC_MAX=60000; // characters; firestore.rules allows up to this
window.picOk=function(p){return typeof p==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(p)&&p.length<=PIC_MAX;};
window.googlePic=function(u){return u&&u.photoURL&&/^https:\/\/lh\d\.googleusercontent\.com\//.test(u.photoURL)?u.photoURL:'';};
// An avatar circle: the chosen picture, else the Google photo, else the first letter of the name.
window.avatarHtml=function(name,photo,gphoto,cls){
  var src=picOk(photo)?photo:gphoto||'';
  var ini=esc(((String(name||'').trim()[0])||'?').toUpperCase());
  return '<span class="avatar'+(cls?' '+cls:'')+'" aria-hidden="true">'+(src?'<img src="'+esc(src)+'" alt="" referrerpolicy="no-referrer">':ini)+'</span>';
};
/* Choose a picture: opens the file picker, then a crop dialog (drag to move, slider to zoom).
   Resolves with the JPEG data URL, or null if cancelled. */
window.choosePicture=function(){
  return new Promise(function(resolve){
    var inp=document.createElement('input');inp.type='file';inp.accept='image/*';inp.style.display='none';document.body.appendChild(inp);
    var settled=false,done=function(v){if(settled)return;settled=true;inp.remove();resolve(v);};
    inp.addEventListener('change',function(){
      var f=inp.files&&inp.files[0];if(!f){done(null);return;}
      if(!/^image\//.test(f.type)&&!/\.(jpe?g|png|gif|webp|heic|heif)$/i.test(f.name)){toast('That isn\u2019t a picture file.');done(null);return;}
      var url=URL.createObjectURL(f),img=new Image();
      img.onload=function(){cropDialog(img).then(function(v){URL.revokeObjectURL(url);done(v);});};
      img.onerror=function(){URL.revokeObjectURL(url);toast('Couldn\u2019t open that picture. Try a JPEG or PNG.');done(null);};
      img.src=url;
    });
    inp.addEventListener('cancel',function(){done(null);});
    window.addEventListener('focus',function onf(){window.removeEventListener('focus',onf);setTimeout(function(){if(!inp.files||!inp.files.length)done(null);},1500);});
    inp.click();
  });
};
function cropDialog(img){
  return new Promise(function(resolve){
    var V=260,OUT=256,w=img.naturalWidth,h=img.naturalHeight,base=V/Math.min(w,h),z=1,x=0,y=0,result=null;
    var d=openDialog('<div class="dlg-head"><h2>Profile picture</h2><button class="x" type="button" data-close aria-label="Close">\u00d7</button></div>'+
      '<p class="note">Drag to position it in the circle. Use the slider to zoom.</p>'+
      '<div class="crop"><canvas width="'+V*2+'" height="'+V*2+'" style="width:'+V+'px;height:'+V+'px" aria-label="Picture preview"></canvas></div>'+
      '<label class="field"><span class="lbl">Zoom</span><input type="range" min="1" max="4" step="0.01" value="1" class="zoom"></label>'+
      '<div class="row end"><button class="btn" type="button" data-close>Cancel</button><button class="btn pri" type="button" data-use>Use picture</button></div>','Profile picture');
    var cv=d.querySelector('canvas'),ctx=cv.getContext('2d'),zoom=d.querySelector('.zoom');
    var clamp=function(){var s=base*z,mx=Math.max(0,(w*s-V)/2),my=Math.max(0,(h*s-V)/2);x=Math.max(-mx,Math.min(mx,x));y=Math.max(-my,Math.min(my,y));};
    var draw=function(c,size){var k=size/V,s=base*z*k;c.fillStyle='#0f1317';c.fillRect(0,0,size,size);c.drawImage(img,size/2+x*k-w*s/2,size/2+y*k-h*s/2,w*s,h*s);};
    var paint=function(){clamp();draw(ctx,V*2);};
    paint();
    zoom.addEventListener('input',function(){z=+zoom.value;paint();});
    var drag=null;
    cv.addEventListener('pointerdown',function(e){drag={x:e.clientX-x,y:e.clientY-y};cv.setPointerCapture(e.pointerId);});
    cv.addEventListener('pointermove',function(e){if(!drag)return;x=e.clientX-drag.x;y=e.clientY-drag.y;paint();});
    cv.addEventListener('pointerup',function(){drag=null;});
    cv.addEventListener('wheel',function(e){e.preventDefault();z=Math.max(1,Math.min(4,z*(e.deltaY<0?1.08:1/1.08)));zoom.value=z;paint();},{passive:false});
    cv.addEventListener('keydown',function(e){var k={ArrowLeft:[8,0],ArrowRight:[-8,0],ArrowUp:[0,8],ArrowDown:[0,-8]}[e.key];if(k){e.preventDefault();x+=k[0];y+=k[1];paint();}});
    cv.tabIndex=0;
    d.querySelector('[data-use]').addEventListener('click',function(){
      var out=document.createElement('canvas');out.width=out.height=OUT;draw(out.getContext('2d'),OUT);
      var q=0.86,data=out.toDataURL('image/jpeg',q);
      while(data.length>PIC_MAX&&q>0.4){q-=0.08;data=out.toDataURL('image/jpeg',q);}
      result=picOk(data)?data:null;if(!result)toast('That picture is too detailed to save. Try another.');
      d.close();
    });
    // resolve when the dialog goes away, however it was closed
    new MutationObserver(function(m,o){if(!document.body.contains(d)){o.disconnect();resolve(result);}}).observe(document.body,{childList:true});
  });
}

/* ---------- Account button and menu ----------
   Shows the person's picture (or initial); the menu has Install app, Admin (for admins), Send feedback, Sign out and the version.
   opts.photo is their chosen profile picture, if any. */
window.accountMenu=function(user,opts){
  opts=opts||{};
  var name=opts.name||user.displayName||user.email||'You';
  return '<span class="acct"><button class="acct-btn" type="button" data-acct="toggle" aria-haspopup="true" aria-expanded="false" title="Your account" aria-label="Your account">'+avatarHtml(name,opts.photo,googlePic(user))+'<b class="acct-name">'+esc(name)+'</b><span class="caret" aria-hidden="true">\u25be</span></button>'+
    '<span class="acct-menu" role="menu" hidden><span class="acct-who">'+avatarHtml(name,opts.photo,googlePic(user),'lg')+'<span><b>'+esc(name)+'</b>'+(user.email&&user.email!==name?'<small>'+esc(user.email)+'</small>':'')+'</span></span>'+
    (opts.home?'<a role="menuitem" href="./?account=1">Your account</a>':'<button role="menuitem" type="button" data-acct="account">Your account</button>')+
    (isInstalledApp()?'':'<button role="menuitem" type="button" data-acct="install">Install app</button>')+
    (opts.admin?'<a role="menuitem" href="admin.html">Admin</a>':'')+(opts.home?'<a role="menuitem" href="./">Back to my plays</a>':'')+
    '<button role="menuitem" type="button" data-acct="feedback">Send feedback</button>'+
    '<button role="menuitem" type="button" data-acct="signout">Sign out</button>'+
    '<span class="acct-ver">Mansions of Madness Casebook '+esc(self.APP_VERSION||'')+'</span></span></span>';
};
document.addEventListener('click',function(e){
  var a=e.target.closest('[data-acct]'),open=document.querySelector('.acct-menu:not([hidden])');
  if(!a){if(open&&!e.target.closest('.acct-menu')){open.hidden=true;open.previousElementSibling.setAttribute('aria-expanded','false');}return;}
  var k=a.getAttribute('data-acct');
  if(k==='toggle'){var m=a.nextElementSibling;m.hidden=!m.hidden;a.setAttribute('aria-expanded',String(!m.hidden));return;}
  if(open){open.hidden=true;}
  if(k==='account')window.dispatchEvent(new CustomEvent('acct-account'));
  else if(k==='install')openInstall();
  else if(k==='feedback')openFeedback();
  else if(k==='signout')firebase.app().auth().signOut().then(function(){location.href='./';});
});
document.addEventListener('keydown',function(e){if(e.key==='Escape'){var m=document.querySelector('.acct-menu:not([hidden])');if(m){m.hidden=true;m.previousElementSibling.focus();}}});
})();
