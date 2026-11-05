/* Preview-only enhancement. A query parameter opts in; no persistent settings. */
(function(){
 'use strict';
 var id=document.documentElement.getAttribute('data-colors');
 if(!/^(0[1-9]|10)$/.test(id||''))return;
 var names={"10":"Carbon Ice","01":"Harbor After Dark","02":"Cinder & Copper","03":"Midnight Fig","04":"Evergreen Voltage","05":"Indigo & Peach","06":"Oxide & Ash","07":"Deep Petrol","08":"Violet Hour","09":"Coffee & Terracotta"};
 function enhance(){
  var root=document.documentElement;
  var first=window.location.pathname;
  var links=document.querySelectorAll('a[href]');
  links.forEach(function(a){
   var href=a.getAttribute('href');
   if(!href||href.charAt(0)==='#'||href.indexOf('mailto:')===0||href.indexOf('tel:')===0)return;
   try{
    var to=new URL(href,window.location.href);
    if(to.origin!==window.location.origin)return;
    if(to.pathname==='/'||to.pathname==='/about.html'||to.pathname==='/tools.html'){
     to.searchParams.set('colors',id);
     a.href=to.pathname+to.search+to.hash;
    }
   }catch(e){}
  });
  var banner=document.createElement('aside');
  banner.className='color-preview-ribbon';
  banner.setAttribute('aria-label','Color preview controls');
  banner.innerHTML='<span>COLOR '+id+' / '+names[id]+'</span><a href="/color-lab.html">Compare all 10</a><a href="'+first+'">Original</a>';
  document.body.appendChild(banner);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});
 else enhance();
})();