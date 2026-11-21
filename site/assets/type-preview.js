/* Typography previews are opt-in, never a persistent setting. */
(function(){
 'use strict';
 var type=document.documentElement.getAttribute('data-type');
 if(!/^(0[1-8])$/.test(type||''))return;
 var names={"01":"The Curious Builder","02":"Quietly Confident","03":"The Thoughtful Editorial","04":"Studio Contrast","05":"Human First","06":"The Friendly Specialist","07":"Soft Precision","08":"Creative Systems"};
 function enhance(){
  var pages=new Set(['/','/index.html','/about.html','/studio-direction.html','/tools.html']);
  document.querySelectorAll('a[href]').forEach(function(anchor){
   var value=anchor.getAttribute('href');
   if(!value||value.charAt(0)==='#'||/^(mailto:|tel:|javascript:)/i.test(value))return;
   try{
    var target=new URL(value,location.href);
    if(target.origin!==location.origin||!pages.has(target.pathname))return;
    target.searchParams.set('type',type);
    anchor.href=target.pathname+target.search+target.hash;
   }catch(e){}
  });
  var banner=document.createElement('aside');
  banner.className='ty-preview-ribbon';
  banner.setAttribute('aria-label','Typography preview controls');
  var name=document.createElement('strong');
  name.textContent='TYPE '+type+' / '+names[type];
  var compare=document.createElement('a');
  compare.href='/type-lab.html';
  compare.textContent='Compare all 8';
  var original=document.createElement('a');
  var link=new URL(location.href);link.searchParams.delete('type');
  original.href=link.pathname+link.search+link.hash;
  original.textContent='Original';
  banner.appendChild(name);banner.appendChild(compare);banner.appendChild(original);
  document.body.appendChild(banner);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});
 else enhance();
})();