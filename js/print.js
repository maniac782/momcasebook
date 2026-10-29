/* print.html: show the sheet the casebook handed over, with a Print button (the tap that prints, as Safari requires). */
(function(){
  var d=null;try{d=window.opener&&window.opener.__printSheet;}catch(e){}
  if(!d||!d.html){location.replace('./');return;}
  document.documentElement.lang=d.lang||'en';document.title=d.title||document.title;
  document.getElementById('printarea').innerHTML=d.html;
  var b=document.getElementById('pr');b.textContent=d.print||'Print';b.hidden=false;
  b.addEventListener('click',function(){window.print();});
})();
