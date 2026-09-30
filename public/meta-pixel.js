!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
window.fbq('init','2155532292513260');
window.fbq('track','PageView');

window.kvnMeta={
  track(eventName,parameters={}){window.fbq?.('track',eventName,parameters);},
  custom(eventName,parameters={}){window.fbq?.('trackCustom',eventName,parameters);},
  purchaseOnce(orderId,valueInCents,contentIds=[]){
    if(!orderId||typeof window.fbq!=='function')return false;
    const key=`kvn_meta_purchase_${orderId}`;
    if(localStorage.getItem(key))return false;
    window.fbq('track','Purchase',{value:Math.max(0,Number(valueInCents)||0)/100,currency:'USD',content_ids:contentIds,content_type:'product'});
    localStorage.setItem(key,'1');
    return true;
  }
};

if(location.pathname.endsWith('/event.html'))window.kvnMeta.track('ViewContent',{content_name:'Kingdom Vibe Live 2026',content_category:'Live Event',content_ids:['kingdom-vibe-live-2026'],content_type:'product'});
else if(location.pathname.endsWith('/submit.html'))window.kvnMeta.track('ViewContent',{content_name:'List Your Event',content_category:'Organizer'});

document.addEventListener('click',event=>{
  const anchor=event.target?.closest?.('a');
  if(!anchor)return;
  const label=anchor.textContent?.replace(/\s+/g,' ').trim().slice(0,120)||'Link';
  window.kvnMeta.custom('KVNLinkClick',{label,destination:anchor.href});
});
