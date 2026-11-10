(() => {
 const toggle = document.getElementById('adminMenuToggle');
 const side = document.getElementById('adminSidebar');
 const backdrop = document.getElementById('adminMenuBackdrop');
 const media = matchMedia('(max-width:760px)');
 let opened = false;
 function setOpen(value, restore = true) {
  opened = value && media.matches;
  document.body.classList.toggle('admin-menu-open', opened);
  toggle.setAttribute('aria-expanded', String(opened));
  toggle.setAttribute('aria-label', opened ? 'Fechar menu' : 'Abrir menu');
  backdrop.hidden = !opened;
  side.inert = media.matches && !opened;
  if (opened) document.getElementById('adminMenuClose').focus();
  else if (restore && media.matches) toggle.focus();
 }
 toggle.onclick = () => setOpen(!opened);
 backdrop.onclick = () => setOpen(false);
 document.getElementById('adminMenuClose').onclick = () => setOpen(false);
 side.addEventListener('click', e => { if(e.target.closest('.admin-tab,.sidebar-action')) setOpen(false); });
 document.addEventListener('keydown', e => {
  if(!opened) return;
  if(e.key === 'Escape') setOpen(false);
  if(e.key === 'Tab') {
   const nodes = [...side.querySelectorAll('a[href],button:not([disabled])')];
   const first=nodes[0],last=nodes[nodes.length-1];
   if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
   else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
  }
 });
 media.addEventListener('change', () => setOpen(false,false));
 setOpen(false,false);
})();
