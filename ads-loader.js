/* বাংলা সংবাদ — Google Sheet controlled Ads
   Ads sheet columns:
   A Position | B Active | C Image URL | D Click URL | E Title | F Ad Code

   Priority:
   1) F (Ad Code) when supplied
   2) Otherwise C + D + E (image/link ad)
*/
(function(){
'use strict';
const SHEET_ID='1gX73WskIs3D-8IcyPJ24NT0xn1KIEJSjMXOF9nCQqTg';
const URL='https://docs.google.com/spreadsheets/d/'+SHEET_ID+'/gviz/tq?tqx=out:json&sheet=Ads';
const requestUrl=()=>URL+'&_='+Date.now();
const val=(r,i)=>r&&r.c&&r.c[i]&&r.c[i].v!=null?String(r.c[i].v).trim():'';
function parse(raw){const a=raw.indexOf('{'),b=raw.lastIndexOf('}')+1;if(a<0||b<=a)throw Error('Invalid Ads response');const d=JSON.parse(raw.slice(a,b));return d.table?.rows||[];}
function active(v){v=v.toLowerCase().trim();return !v||['yes','true','1','active','on','হ্যাঁ','চালু'].includes(v);}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function safeUrl(s){const u=String(s||'').trim();return /^(https?:|mailto:|tel:)/i.test(u)?u:'#';}
function imageAd(img,click,title){
  const src=safeUrl(img), href=safeUrl(click), alt=esc(title||'Advertisement');
  if(src==='#') return '';
  const image='<img src="'+esc(src)+'" alt="'+alt+'" loading="lazy" style="display:block;width:100%;height:100%;object-fit:cover;border:0;margin:0;padding:0">';
  return '<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer" style="display:block;width:100%;height:100%;text-decoration:none">'+image+'</a>';
}
function runScripts(slot){
  slot.querySelectorAll('script').forEach(old=>{const s=document.createElement('script');for(const a of old.attributes)s.setAttribute(a.name,a.value);s.text=old.text||old.textContent||'';old.replaceWith(s);});
}
function load(){
 fetch(requestUrl(),{cache:'no-store'}).then(r=>r.text()).then(parse).then(rows=>{
   const ads={TOP:null,MIDDLE:null,BOTTOM:null};
   rows.forEach(r=>{
     const pos=val(r,0).toUpperCase();
     if(!Object.prototype.hasOwnProperty.call(ads,pos)||!active(val(r,1))) return;
     ads[pos]={code:val(r,5),image:val(r,2),click:val(r,3),title:val(r,4)};
   });
   Object.keys(ads).forEach(pos=>{
     const ad=ads[pos];
     if(!ad) return;
     document.querySelectorAll('[data-ad-slot="'+pos.toLowerCase()+'"]').forEach(slot=>{
       const content=ad.code || imageAd(ad.image,ad.click,ad.title);
       if(!content) return;
       slot.innerHTML=content;
       runScripts(slot);
       slot.classList.add('ad-loaded');
     });
   });
 }).catch(e=>console.warn('Google Sheet Ads load failed:',e));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();
