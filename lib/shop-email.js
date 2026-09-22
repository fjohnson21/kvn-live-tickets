const esc=(value='')=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(cents||0)/100);
const impact='A portion of every purchase helps fund Kingdom Projects and supports our Acts 2:44 Foundation—All Things in Common—advancing practical resources, opportunity, and community impact.';
function addressText(address={}){return [[address.line1,address.line2].filter(Boolean).join(' '),[address.city,address.state,address.postal_code||address.postalCode].filter(Boolean).join(', '),address.country].filter(Boolean).join('\n');}

export function buildShopConfirmation({order}){
  const itemText=(order.items||[]).map(item=>`${item.name} — Size ${item.size} × ${item.quantity} (${money(item.unitAmount)} each)`).join('\n');
  const numbers=(order.collectorNumbers||[]).map(number=>`Collector’s Edition ${number}`).join(', ');
  const address=addressText(order.shippingAddress);
  const summary=`Merchandise: ${money(order.merchandiseSubtotal)}\nShipping: ${money(order.shippingAmount)}\nTax: ${money(order.taxAmount)}\nTotal: ${money(order.amountTotal)}`;
  const text=[`ORDER CONFIRMED — ${order.id}`,`Thank you${order.buyerName?`, ${order.buyerName}`:''}.`,itemText,numbers,`Shipping address:\n${address}`,summary,'Ships beginning October 15, 2026.','YOUR PURCHASE BUILDS THE KINGDOM',impact,'All sales are final except damaged, defective or incorrectly fulfilled items. Size changes before fulfillment depend on available inventory.'].join('\n\n');
  const html=`<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#111"><p style="color:#e2252b;font-weight:700;letter-spacing:2px">KINGDOM VIBE SHOP</p><h1>Order confirmed.</h1><p><strong>Order:</strong> ${esc(order.id)}</p><p>${esc(itemText).replaceAll('\n','<br>')}</p><p><strong>${esc(numbers)}</strong></p><p><strong>Shipping address:</strong><br>${esc(address).replaceAll('\n','<br>')}</p><p>${esc(summary).replaceAll('\n','<br>')}</p><p><strong>Ships beginning October 15, 2026.</strong></p><div style="margin:24px 0;padding:18px;border-left:4px solid #e2252b;background:#f4f4f4"><p style="margin:0 0 8px;color:#e2252b;font-weight:700;letter-spacing:1px">YOUR PURCHASE BUILDS THE KINGDOM</p><p style="margin:0"><strong>${esc(impact)}</strong></p></div><p>All sales are final except damaged, defective or incorrectly fulfilled items. Size changes before fulfillment depend on available inventory.</p></div>`;
  return {subject:`Your Kingdom Vibe Shop order ${order.id}`,text,html};
}

export async function deliverShopConfirmation({order,apiKey,from='Kingdom Vibe Shop <shop@kvnlive.com>',force=false,fetchImpl=fetch,now=()=>new Date().toISOString()}){
  if(!force&&order.confirmationEmail?.status==='sent')return {status:'skipped',reason:'already_sent'};
  let result;
  if(!apiKey)result={status:'not_configured',provider:'resend',failedAt:now(),error:'RESEND_API_KEY is not configured.'};
  else if(!order.buyerEmail)result={status:'failed',provider:'resend',failedAt:now(),error:'Buyer email is required.'};
  else try{
    const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[order.buyerEmail],...buildShopConfirmation({order})})});
    const data=await response.json().catch(()=>({}));
    result=response.ok?{status:'sent',provider:'resend',messageId:data.id||'',sentAt:now()}:{status:'failed',provider:'resend',failedAt:now(),error:`Resend rejected shop email (${response.status}): ${data.message||data.error||'Unknown provider error'}`};
  }catch(error){result={status:'failed',provider:'resend',failedAt:now(),error:`Shop email delivery failed: ${error.message}`};}
  order.confirmationEmail=result;order.confirmationEmailAttempts||=[];order.confirmationEmailAttempts.push({...result});return result;
}
