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
   The same as the Arkham Horror RPG Ledger's top-right corner (same markup, class names and styles, so the two sites
   look and behave alike): your picture or initial, your name and a caret; on phones just the picture. The menu has
   Your account, Admin (for admins), Install app, Send feedback, Sign out and the version. opts: {name, photo, admin, home, local}.
   The open state lives in window.__acctOpen, so the menu stays open when the page redraws behind it. */
// The round icon: your chosen picture, else your Google photo, else your initial in white on slate.
window.acctIcon=function(name,photo,gphoto){
  var src=picOk(photo)?photo:gphoto||'';
  if(src)return '<img class="av" src="'+esc(src)+'" alt="" referrerpolicy="no-referrer">';
  return '<span class="av" aria-hidden="true" style="background:#56606f">'+esc((String(name||'?').trim().charAt(0)||'?').toUpperCase())+'</span>';
};
window.accountMenu=function(user,opts){
  opts=opts||{};var open=!!window.__acctOpen;
  var name=opts.name||user.displayName||(user.email||'').split('@')[0]||'You',ic=acctIcon(name,opts.photo,googlePic(user));
  return '<span class="acctwrap"><button class="acctbtn" type="button" data-acct="toggle" aria-haspopup="menu" aria-expanded="'+open+'" title="Your account">'+ic+'<b class="acctname">'+esc(name)+'</b><span class="caret" aria-hidden="true">\u25be</span></button>'+
    '<div class="acctmenu" role="menu"'+(open?'':' hidden')+'><div class="acctmenu-head">'+ic+'<span><b>'+esc(name)+'</b>'+(user.email?'<span class="note">'+esc(user.email)+'</span>':'')+'</span></div>'+
    (opts.home?'<a role="menuitem" href="./?account=1">Your account</a>':'<button role="menuitem" type="button" data-acct="account">Your account</button>')+
    (opts.admin?'<a role="menuitem" href="admin.html">Admin</a>':'')+(opts.home?'<a role="menuitem" href="./">Back to my plays</a>':'')+
    (isInstalledApp()?'':'<button role="menuitem" type="button" data-acct="install">Install app</button>')+
    // a casebook kept in this browser (js/localfb.js) has no sign-in yet: offer to save it to an account instead
    (opts.local?'<a role="menuitem" href="./?save=1">Save to an account</a>':
    '<button role="menuitem" type="button" data-acct="feedback">Send feedback</button>'+
    '<button role="menuitem" type="button" data-acct="signout">Sign out</button>')+
    '<span class="acctver">Mansions of Madness Casebook '+esc(self.APP_VERSION||'')+'</span></div></span>';
};
(function(){
  function setOpen(v){window.__acctOpen=v;document.querySelectorAll('.acctwrap').forEach(function(w){var m=w.querySelector('.acctmenu'),b=w.querySelector('.acctbtn');if(m)m.hidden=!v;if(b)b.setAttribute('aria-expanded',String(v));});}
  document.addEventListener('click',function(e){
    var t=e.target.closest&&e.target.closest('[data-acct]'),k=t&&t.dataset.acct;
    if(k==='toggle'){e.stopPropagation();setOpen(!window.__acctOpen);return;}
    if(k){setOpen(false);
      if(k==='account')window.dispatchEvent(new CustomEvent('acct-account'));
      else if(k==='install')openInstall();
      else if(k==='feedback')openFeedback();
      else if(k==='signout')firebase.app().auth().signOut().then(function(){location.href='./';});
      return;}
    if(window.__acctOpen&&!(e.target.closest&&e.target.closest('.acctmenu')))setOpen(false);
    else if(window.__acctOpen&&e.target.closest('.acctmenu a'))setOpen(false);
  },true);
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&window.__acctOpen){setOpen(false);var b=document.querySelector('.acctbtn');if(b)b.focus();}});
})();
/* ---------- Dropdowns ----------
   Every <select class="f"> stays a real select (forms, values, change events and layout all work as before), but clicking,
   tapping or pressing Enter/Space/arrow keys on it opens our own menu instead of the browser's plain one: a tick on the
   current choice, hover and keyboard highlighting, group headings, and a search box on long lists. That's for mouse and
   keyboard only: a tap on a phone or tablet gets the device's own picker, which people there are used to. */
(function(){
  var cur=null;   // {sel, wrap, panel, list, input, empty, items, active}
  var norm=function(t){return String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[“”"]/g,'');};
  var isSep=function(o){return o.disabled&&/^[─\-\s]+$/.test(o.textContent);};
  function labelFor(sel){
    var f=sel.closest('.field'),l=f&&f.querySelector('.lbl');
    return (l&&l.textContent)||sel.getAttribute('aria-label')||'Choose';
  }
  function close(refocus){
    if(!cur)return;var c=cur;cur=null;
    c.sel.classList.remove('dd-open');c.sel.removeAttribute('aria-expanded');
    c.wrap.classList.add('dd-out');setTimeout(function(){c.wrap.remove();},140);
    window.removeEventListener('resize',onResize);document.removeEventListener('scroll',onScroll,true);
    if(refocus&&c.sel.isConnected)try{c.sel.focus({preventScroll:true});}catch(e){}
  }
  function choose(o){
    var c=cur;if(!c||!o||o.disabled)return;var sel=c.sel,changed=sel.value!==o.value||sel.selectedIndex!==o.index;
    close(true);
    // the page may have redrawn while the menu was open; use the select that's there now
    if(!sel.isConnected&&sel.id&&document.getElementById(sel.id)){sel=document.getElementById(sel.id);changed=sel.value!==o.value;
      var m=Array.prototype.filter.call(sel.options,function(y){return y.value===o.value;})[0];if(!m)return;o=m;}
    if(changed){sel.selectedIndex=o.index;sel.dispatchEvent(new Event('input',{bubbles:true}));sel.dispatchEvent(new Event('change',{bubbles:true}));}
  }
  function setActive(i,scroll){
    if(!cur)return;var it=cur.items;if(cur.active>=0&&it[cur.active])it[cur.active].el.classList.remove('on');
    cur.active=i;if(i<0||!it[i])return;it[i].el.classList.add('on');
    (cur.input||cur.list).setAttribute('aria-activedescendant',it[i].el.id);
    if(scroll!==false)it[i].el.scrollIntoView({block:'nearest'});
  }
  function visible(){return cur.items.filter(function(x){return !x.el.hidden;});}
  function move(d){
    var v=visible().filter(function(x){return !x.o.disabled;});if(!v.length)return;
    var at=v.indexOf(cur.items[cur.active]),n=at<0?(d>0?0:v.length-1):Math.min(v.length-1,Math.max(0,at+d));
    setActive(cur.items.indexOf(v[n]));
  }
  function filter(q){
    q=norm(q).trim();var any=false;
    cur.list.querySelectorAll('.dd-grp').forEach(function(g){g._n=0;});
    cur.items.forEach(function(x){var hit=!q||norm(x.o.textContent).indexOf(q)>=0;x.el.hidden=!hit;if(hit){any=true;if(x.grp)x.grp._n++;}});
    cur.list.querySelectorAll('.dd-grp').forEach(function(g){g.hidden=!!q&&!g._n;});
    cur.list.querySelectorAll('.dd-sep').forEach(function(s){s.hidden=!!q;});
    cur.empty.hidden=any;
    var first=visible().filter(function(x){return !x.o.disabled;})[0];setActive(first?cur.items.indexOf(first):-1,!!q);
    if(!q){var s=cur.items.filter(function(x){return x.o.selected;})[0];if(s)setActive(cur.items.indexOf(s));}
  }
  function place(){
    if(!cur)return;var r=cur.sel.getBoundingClientRect(),vw=innerWidth,vh=innerHeight,p=cur.panel;
    var w=Math.min(Math.max(r.width,240),vw-16),left=Math.min(Math.max(8,r.left),vw-w-8);
    var below=vh-r.bottom-12,above=r.top-12,up=below<240&&above>below,room=Math.min(380,up?above:below);
    p.style.width=w+'px';p.style.left=left+'px';p.style.maxHeight=Math.max(160,room)+'px';
    if(up){p.style.top='';p.style.bottom=(vh-r.top+6)+'px';p.classList.add('up');}else{p.style.bottom='';p.style.top=(r.bottom+6)+'px';p.classList.remove('up');}
  }
  function onResize(){if(cur)close(false);}
  function onScroll(e){if(cur&&!(e.target.nodeType===1&&cur.panel.contains(e.target)))close(false);}
  function open(sel){
    if(cur){var same=cur.sel===sel;close(false);if(same)return;}
    if(sel.disabled)return;
    var opts=Array.prototype.slice.call(sel.options),searchable=opts.length>12,id='dd'+Date.now().toString(36);
    var wrap=document.createElement('div');wrap.className='dd-wrap';
    wrap.innerHTML='<div class="dd" role="presentation">'+
      (searchable?'<div class="dd-search"><input type="text" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="'+id+'" placeholder="Search…" autocomplete="off" spellcheck="false"></div>':'')+
      '<div class="dd-list" role="listbox" id="'+id+'" tabindex="-1" aria-label="'+esc(labelFor(sel))+'"></div><p class="dd-empty" hidden>No matches</p></div>';
    var list=wrap.querySelector('.dd-list'),items=[],lastGrp=null;
    opts.forEach(function(o,i){
      var g=o.parentNode.tagName==='OPTGROUP'?o.parentNode:null;
      if(g!==lastGrp){lastGrp=g;if(g){var h=document.createElement('div');h.className='dd-grp';h.textContent=g.label;h.setAttribute('role','presentation');list.appendChild(h);lastGrp._el=h;}}
      if(isSep(o)){var s=document.createElement('div');s.className='dd-sep';s.setAttribute('role','separator');list.appendChild(s);return;}
      if(o.hidden||(o.value===''&&(o.disabled||sel.required)))return;   // a "Choose…" placeholder isn't a choice
      var el=document.createElement('div');el.className='dd-opt'+(o.selected?' sel':'')+(o.disabled?' dis':'');el.id=id+'-'+i;
      el.setAttribute('role','option');el.setAttribute('aria-selected',String(o.selected));if(o.disabled)el.setAttribute('aria-disabled','true');
      var t=o.textContent,m=/^(.*?) \u2022 ([^\u2022]{1,16})$/.exec(t);   // "Name • new" shows the end as a small tag
      el.innerHTML='<span class="dd-tick" aria-hidden="true"></span><span class="dd-txt"></span>'+(m?'<span class="dd-tag"></span>':'');
      el.querySelector('.dd-txt').textContent=m?m[1]:t;if(m)el.querySelector('.dd-tag').textContent=m[2];
      list.appendChild(el);items.push({o:o,el:el,grp:g&&g._el});
    });
    document.body.appendChild(wrap);
    cur={sel:sel,wrap:wrap,panel:wrap.querySelector('.dd'),list:list,input:wrap.querySelector('.dd-search input'),empty:wrap.querySelector('.dd-empty'),items:items,active:-1};
    sel.classList.add('dd-open');sel.setAttribute('aria-expanded','true');
    place();
    var s=items.filter(function(x){return x.o.selected&&!x.o.disabled;})[0]||items.filter(function(x){return !x.o.disabled;})[0];
    if(s){setActive(items.indexOf(s),false);s.el.scrollIntoView({block:'center'});}
    // keep keyboard focus inside the menu
    if(cur.input)cur.input.focus({preventScroll:true});else list.focus({preventScroll:true});
    wrap.addEventListener('click',function(e){
      var el=e.target.closest('.dd-opt');if(!el)return;var x=items.filter(function(y){return y.el===el;})[0];if(x)choose(x.o);
    });
    wrap.addEventListener('mousemove',function(e){var el=e.target.closest('.dd-opt');if(!el||!cur)return;var i=-1;cur.items.some(function(y,k){if(y.el===el){i=k;return true;}});if(i>=0&&i!==cur.active&&!cur.items[i].o.disabled)setActive(i,false);});
    wrap.addEventListener('keydown',keys);
    if(cur.input)cur.input.addEventListener('input',function(){filter(cur.input.value);});
    window.addEventListener('resize',onResize);document.addEventListener('scroll',onScroll,true);
  }
  var typed='',typedAt=0;
  function keys(e){
    if(!cur)return;var k=e.key;
    if(k==='Escape'){e.preventDefault();e.stopPropagation();close(true);return;}
    if(k==='ArrowDown'){e.preventDefault();move(1);return;}
    if(k==='ArrowUp'){e.preventDefault();move(-1);return;}
    if(k==='PageDown'){e.preventDefault();move(8);return;}
    if(k==='PageUp'){e.preventDefault();move(-8);return;}
    if((k==='Home'||k==='End')&&!cur.input){e.preventDefault();move(k==='Home'?-1e6:1e6);return;}
    if(k==='Enter'||(k===' '&&!cur.input)){e.preventDefault();e.stopPropagation();var x=cur.items[cur.active];if(x)choose(x.o);return;}
    if(k==='Tab'){close(false);return;}
    // type-ahead when there's no search box
    if(!cur.input&&k.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
      var now=Date.now();typed=(now-typedAt<700?typed:'')+norm(k);typedAt=now;
      var v=cur.items.filter(function(x){return !x.o.disabled;}),hit=v.filter(function(x){return norm(x.o.textContent).indexOf(typed)===0;})[0];
      if(hit)setActive(cur.items.indexOf(hit));
    }
  }
  var isDD=function(t){return t&&t.tagName==='SELECT'&&t.classList.contains('f')&&!t.multiple;};
  document.addEventListener('mousedown',function(e){
    if(!isDD(e.target)||e.button!==0||Date.now()-touchedAt<1000||(e.sourceCapabilities&&e.sourceCapabilities.firesTouchEvents))return;e.preventDefault();
    try{e.target.focus({preventScroll:true});}catch(x){}open(e.target);
  },true);
  // a tap (phone, tablet, touch screen) is left to the device's own picker; phones also send a made-up mousedown after a tap
  var touchedAt=0;
  document.addEventListener('touchstart',function(){touchedAt=Date.now();},{capture:true,passive:true});
  document.addEventListener('keydown',function(e){
    if(!isDD(e.target))return;var k=e.key;
    if(k==='Enter'||k===' '||k==='ArrowDown'||k==='ArrowUp'||(k==='F4')){e.preventDefault();open(e.target);}
  },true);
  // clicking anywhere else closes it
  document.addEventListener('mousedown',function(e){if(cur&&!cur.wrap.contains(e.target)&&e.target!==cur.sel)close(false);},true);
  window.closeDropdown=function(){close(false);};
})();
/* ---------- Pick-or-type boxes ----------
   A text box with data-suggest="<datalist id>" (the player names when logging a play) shows a list of the known names
   under it as soon as it's tapped or typed in, narrowed as you type; pick one, or just keep typing a new name. It looks
   like the dropdown menus above. Names already used elsewhere in the same form (another seat) are left out. Works the
   same on phones, where the browser's own datalist suggestions are easy to miss. */
(function(){
  var cur=null;   // {inp, wrap, list, items, active}
  var norm=function(t){return String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();};
  var isCombo=function(t){return t&&t.tagName==='INPUT'&&t.hasAttribute('data-suggest');};
  function names(inp){
    var dl=document.getElementById(inp.getAttribute('data-suggest'));if(!dl)return [];
    var form=inp.form||document,used={};
    form.querySelectorAll('input[data-suggest="'+inp.getAttribute('data-suggest')+'"]').forEach(function(o){if(o!==inp&&o.value.trim())used[norm(o.value)]=1;});
    return Array.prototype.map.call(dl.options,function(o){return o.value;}).filter(function(v){return v&&!used[norm(v)];});
  }
  function place(){
    if(!cur)return;var r=cur.inp.getBoundingClientRect(),vv=window.visualViewport,vh=vv?vv.height+vv.offsetTop:innerHeight,vw=innerWidth,p=cur.panel;
    if(r.bottom<0||r.top>vh){close();return;}
    var w=Math.min(Math.max(r.width,220),vw-16),left=Math.min(Math.max(8,r.left),vw-w-8),below=vh-r.bottom-10,above=r.top-10,up=below<160&&above>below;
    p.style.width=w+'px';p.style.left=left+'px';p.style.maxHeight=Math.max(120,Math.min(300,up?above:below))+'px';
    if(up){p.style.top='';p.style.bottom=(innerHeight-r.top+4)+'px';p.classList.add('up');}else{p.style.bottom='';p.style.top=(r.bottom+4)+'px';p.classList.remove('up');}
  }
  function setActive(i){if(!cur)return;cur.items.forEach(function(x,k){x.el.classList.toggle('on',k===i);});cur.active=i;
    if(i>=0&&cur.items[i]){cur.items[i].el.scrollIntoView({block:'nearest'});cur.inp.setAttribute('aria-activedescendant',cur.items[i].el.id);}else cur.inp.removeAttribute('aria-activedescendant');}
  function fill(){
    if(!cur)return;var q=norm(cur.inp.value),all=names(cur.inp),list=cur.list,id=cur.id;
    var hits=all.filter(function(n){return !q||norm(n).indexOf(q)>=0;});
    // names starting with what's typed come first
    if(q)hits.sort(function(a,b){return (norm(a).indexOf(q)===0?0:1)-(norm(b).indexOf(q)===0?0:1);});
    var exact=all.some(function(n){return norm(n)===q;})||hits.some(function(n){return norm(n)===q;});
    list.innerHTML='';cur.items=[];
    var add=function(v,i,isNew){var el=document.createElement('div');el.className='dd-opt'+(isNew?' dd-new':'');el.id=id+'-'+i;el.setAttribute('role','option');
      el.innerHTML='<span class="dd-tick" aria-hidden="true"></span><span class="dd-txt"></span>'+(isNew?'<span class="dd-tag">new player</span>':'');el.querySelector('.dd-txt').textContent=v;
      list.appendChild(el);cur.items.push({el:el,v:v});};
    hits.slice(0,60).forEach(function(n,i){add(n,i);});
    if(q&&!exact){if(hits.length){var sep=document.createElement('div');sep.className='dd-sep';list.appendChild(sep);}add(cur.inp.value.trim(),'new',true);}
    // nothing to choose: no names, or just the one already typed in full
    if(!cur.items.length||(cur.items.length===1&&norm(cur.items[0].v)===q&&!cur.items[0].el.classList.contains('dd-new'))){close();return;}
    setActive(-1);
    place();
  }
  function open(inp){
    if(cur&&cur.inp===inp){fill();return;}close();
    if(!names(inp).length&&!inp.value.trim())return;
    var wrap=document.createElement('div'),id='cb'+Date.now().toString(36);wrap.className='dd-wrap combo';
    wrap.innerHTML='<div class="dd" role="presentation"><div class="dd-list" role="listbox" id="'+id+'" aria-label="Known players"></div></div>';
    document.body.appendChild(wrap);
    cur={inp:inp,wrap:wrap,panel:wrap.querySelector('.dd'),list:wrap.querySelector('.dd-list'),items:[],active:-1,id:id};
    inp.setAttribute('aria-expanded','true');inp.setAttribute('aria-controls',id);
    // keep the typing focus in the box while picking
    wrap.addEventListener('mousedown',function(e){e.preventDefault();});
    wrap.addEventListener('click',function(e){var el=e.target.closest('.dd-opt');if(!el||!cur)return;var x=cur.items.filter(function(y){return y.el===el;})[0];if(x)pick(x.v,true);});
    wrap.addEventListener('mousemove',function(e){var el=e.target.closest('.dd-opt');if(!el||!cur)return;var i=-1;cur.items.some(function(y,k){if(y.el===el){i=k;return true;}});if(i!==cur.active)setActive(i);});
    fill();
  }
  function close(){if(!cur)return;var c=cur;cur=null;c.inp.setAttribute('aria-expanded','false');c.inp.removeAttribute('aria-activedescendant');c.wrap.remove();}
  function pick(v,byTap){
    if(!cur)return;var inp=cur.inp;inp.value=v;close();
    inp.dispatchEvent(new Event('input',{bubbles:true}));inp.dispatchEvent(new Event('change',{bubbles:true}));
    // after a tap on a phone, put the keyboard away
    if(byTap&&window.matchMedia&&matchMedia('(pointer:coarse)').matches)inp.blur();
  }
  document.addEventListener('focusin',function(e){if(isCombo(e.target)){e.target.removeAttribute('list');e.target.setAttribute('autocomplete','off');e.target.setAttribute('role','combobox');e.target.setAttribute('aria-autocomplete','list');open(e.target);}});
  document.addEventListener('focusout',function(e){if(cur&&e.target===cur.inp)setTimeout(function(){if(cur&&document.activeElement!==cur.inp)close();},120);});
  document.addEventListener('input',function(e){if(isCombo(e.target)&&e.isTrusted!==false){if(cur&&cur.inp===e.target)fill();else open(e.target);}});
  document.addEventListener('click',function(e){if(isCombo(e.target)&&!cur)open(e.target);});
  document.addEventListener('keydown',function(e){
    if(!isCombo(e.target))return;var k=e.key;
    if(k==='ArrowDown'||k==='ArrowUp'){e.preventDefault();if(!cur){open(e.target);return;}var n=cur.items.length;if(!n)return;setActive(k==='ArrowDown'?(cur.active+1)%n:(cur.active<=0?n-1:cur.active-1));}
    // Enter takes the highlighted name, or just keeps what's typed and closes the list
    else if(k==='Enter'&&cur){e.preventDefault();if(cur.active>=0)pick(cur.items[cur.active].v);else close();}
    else if(k==='Escape'&&cur){e.preventDefault();e.stopPropagation();close();}
    else if(k==='Tab')close();
  },true);
  window.addEventListener('resize',function(){if(cur)place();});
  if(window.visualViewport)visualViewport.addEventListener('resize',function(){if(cur)place();});
  document.addEventListener('scroll',function(e){if(cur&&!(e.target.nodeType===1&&cur.panel.contains(e.target)))place();},true);
})();
})();
