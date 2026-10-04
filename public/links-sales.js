export function selectOfferProduct(event,offer) {
 if(event?.slug!=='kingdom-vibe-live-2026')return null;
 const ids={'community-pass':'kv-community-2026','full-access':'kv-all-access-2026','kingdom-pass':'kv-kingdom-pass-2026'};
 return event.products?.find(p=>p.id===ids[offer]&&p.type==='ticket'&&Number(p.available)>0)||null;
}
