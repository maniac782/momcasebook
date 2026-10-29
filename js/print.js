/* print.html: show the sheet the casebook handed over (window.__printSheet, see printPage() in js/app.js).
   On a computer the button prints. On an iPhone or iPad, web pages often can't print at all (a home-screen app, or a
   link opened inside another app), so there the sheet is turned into a picture as soon as it's shown (html2canvas,
   js/vendor/, MIT) and the button opens the phone's own share sheet with it: Print, Save Image, or send it to the
   group. The picture is made ahead of time because the share sheet only opens straight from a tap. */
(function(){
  var d=null;try{d=window.opener&&window.opener.__printSheet;}catch(e){}
  if(!d||!d.html){location.replace('./');return;}
  document.documentElement.lang=d.lang||'en';document.title=d.title||document.title;
  var area=document.getElementById('printarea'),b=document.getElementById('pr'),hint=document.getElementById('hint');
  area.innerHTML=d.html;
  // back to the casebook: close this page if the casebook opened it as a new tab, else (a home-screen app shows it in
  // the same window, with no tabs to switch to) go back to it
  var back=document.getElementById('back');back.textContent='‹ '+(d.back||'Back');back.hidden=false;
  back.addEventListener('click',function(){try{window.close();}catch(e){}setTimeout(function(){if(history.length>1)history.back();else location.replace('./');},250);});
  var ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(!ios){b.textContent=d.print;b.hidden=false;b.addEventListener('click',function(){window.print();});return;}

  b.textContent=d.share;b.hidden=false;b.disabled=true;hint.textContent=d.hint;hint.hidden=false;
  var file=null,url='';
  var script=function(src){return new Promise(function(ok,no){var s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=no;document.head.appendChild(s);});};
  Promise.all([loadedIn(area),document.fonts?document.fonts.ready:0,script('js/vendor/html2canvas.min.js')]).then(function(){
    // drawn at a page's width, one card per row as on paper, whatever the phone's width
    var box=document.createElement('div');box.className='shot';box.innerHTML=d.html;document.body.appendChild(box);
    return loadedIn(box).then(function(){return window.html2canvas(box,{scale:2,backgroundColor:'#ffffff',useCORS:true,logging:false});})
      .then(function(c){box.remove();return new Promise(function(r){c.toBlob(r,'image/png');});});
  }).then(function(blob){
    file=new File([blob],d.file||'cheat-sheet.png',{type:'image/png'});url=URL.createObjectURL(blob);b.disabled=false;
  }).catch(function(e){if(window.console)console.warn('cheat sheet picture',e);b.textContent=d.print;b.disabled=false;});
  function loadedIn(el){return Promise.all([].map.call(el.querySelectorAll('img'),function(i){return i.complete?0:new Promise(function(r){i.onload=i.onerror=r;});}));}
  b.addEventListener('click',function(){
    if(file&&navigator.canShare&&navigator.canShare({files:[file]})){navigator.share({files:[file],title:d.title}).catch(function(){});return;}
    // no share sheet: show the picture itself, to press and hold (Save, Share, Print)
    if(url){area.innerHTML='<img src="'+url+'" alt="" style="width:100%;height:auto;display:block;border:1px solid var(--line)">';hint.textContent=d.hold;b.hidden=true;return;}
    window.print();
  });
})();
