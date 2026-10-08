(() => {
 const nav=document.getElementById('dashNav'), sidebar=document.querySelector('.sidebar'), toggle=document.getElementById('mobileMenuToggle');
 if(!nav||!sidebar||!toggle)return;
 document.body.classList.add('mobile-navigation-ready');
 const close=()=>{sidebar.classList.remove('mobile-menu-open');toggle.setAttribute('aria-expanded','false');toggle.textContent='Menu';};
 const sync=()=>{toggle.hidden=nav.hidden;if(nav.hidden)close();};
 toggle.addEventListener('click',()=>{if(nav.hidden)return;const open=sidebar.classList.toggle('mobile-menu-open');toggle.setAttribute('aria-expanded',String(open));toggle.textContent=open?'Close menu':'Menu';});
 nav.addEventListener('click',event=>{if(event.target.closest('button[data-panel]')&&window.matchMedia('(max-width: 900px)').matches){close();toggle.focus({preventScroll:true});window.scrollTo({top:0,behavior:'smooth'});}});
 sidebar.addEventListener('keydown',event=>{if(event.key==='Escape'){close();toggle.focus();}});
 new MutationObserver(sync).observe(nav,{attributes:true,attributeFilter:['hidden']});sync();
})();
