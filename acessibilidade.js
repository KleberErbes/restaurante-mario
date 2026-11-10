(() => {
 const overlays=[...document.querySelectorAll('.cart-panel,.modal-nome,.modal-ajuda')];
 let last=null;const previous=new Map();
 const focusable=e=>[...e.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length);
 function sync(){
  for(const e of overlays){const open=e.classList.contains('open');e.inert=!open;e.setAttribute('aria-hidden',String(!open));if(open)e.setAttribute('aria-modal','true');else e.removeAttribute('aria-modal');}
  const active=[...overlays].reverse().find(e=>e.classList.contains('open'));
  document.body.style.overflow=active||document.querySelector('dialog[open]')?'hidden':'';
  if(active!==last){
   if(active){previous.set(active,document.activeElement);focusable(active)[0]?.focus();}
   else if(last)previous.get(last)?.focus();
   last=active;
  }
 }
 const observer=new MutationObserver(sync);overlays.forEach(e=>observer.observe(e,{attributes:true,attributeFilter:['class']}));
 document.querySelectorAll('dialog').forEach(e=>observer.observe(e,{attributes:true,attributeFilter:['open']}));
 document.addEventListener('keydown',e=>{if(e.key!=='Tab'||!last||document.querySelector('dialog[open]'))return;const nodes=focusable(last);const first=nodes[0],end=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();end?.focus();}else if(!e.shiftKey&&document.activeElement===end){e.preventDefault();first?.focus();}});
 sync();
})();
