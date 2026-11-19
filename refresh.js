(() => {
 const toggle=document.getElementById('menuToggle'), menu=document.getElementById('siteMenu');
 function close(){menu.hidden=true;toggle.setAttribute('aria-expanded','false');}
 toggle.addEventListener('click',()=>{menu.hidden=!menu.hidden;toggle.setAttribute('aria-expanded',String(!menu.hidden));});
 menu.addEventListener('click',e=>{if(e.target.closest('button,a[href]'))close();});
 document.addEventListener('click',e=>{if(!e.target.closest('header'))close();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){close();toggle.focus();}});
 const trigger=document.getElementById('hoursToggle'), dialog=document.getElementById('hoursDialog');
 trigger.addEventListener('click',()=>{
   const orders=document.getElementById('pxFaixaAjuda');
   if(orders) document.getElementById('hoursOrders').textContent=orders.textContent;
   if(!dialog.open) dialog.showModal();
 });
 dialog.querySelector('.hours-close').addEventListener('click',()=>dialog.close());
 dialog.querySelector('.hours-ok').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 dialog.addEventListener('close',()=>trigger.focus());
})();

(() => {
 const logo=document.querySelector('button.hero-logo-place');
 if(!logo) return;
 const image=logo.querySelector('.logo-coin');
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 let animation, start=null, suppressClickUntil=0, autoTimer, visible=false;
 function spin(){
   if(animation) animation.cancel();
   if(reduced.matches) return;
   animation=image.animate(
     [{transform:'rotateY(0deg)'},{transform:'rotateY(-360deg)'}],
     {duration:3600,easing:'cubic-bezier(.16,.75,.25,1)'}
   );
 }
 function updateAutoplay(){
   clearInterval(autoTimer);
   if(!visible || document.hidden || reduced.matches){
     if(animation) animation.cancel();
     return;
   }
   autoTimer=setInterval(()=>{
     if(!animation || animation.playState!=='running') spin();
   },8000);
 }
 if('IntersectionObserver' in window){
   new IntersectionObserver(entries=>{
     visible=entries[0].isIntersecting;
     updateAutoplay();
   },{threshold:0.25}).observe(logo);
 }else{visible=true;updateAutoplay();}
 document.addEventListener('visibilitychange',updateAutoplay);
 reduced.addEventListener('change',updateAutoplay);
 logo.addEventListener('click',event=>{
   if(event.detail!==0 && performance.now()<suppressClickUntil) return;
   spin();
 });
 logo.addEventListener('pointerdown',event=>{
   if(event.pointerType==='mouse') return;
   start={id:event.pointerId,x:event.clientX,y:event.clientY};
 },{passive:true});
 logo.addEventListener('pointermove',event=>{
   if(!start || start.id!==event.pointerId) return;
   if(Math.hypot(event.clientX-start.x,event.clientY-start.y)<12) return;
   start=null;
   suppressClickUntil=performance.now()+800;
   spin();
 },{passive:true});
 for(const name of ['pointerup','pointercancel','pointerleave']){
   logo.addEventListener(name,()=>{start=null;},{passive:true});
 }
})();
