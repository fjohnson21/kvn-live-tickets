const csv=value=>{const text=String(value??'');const safe=/^[=+\-@]/.test(text)?`'${text}`:text;return /[",\n]/.test(safe)?`"${safe.replaceAll('"','""')}"`:safe;};
export function shopOrdersCsv(orders=[]){
  const headers=['order_id','status','buyer_name','buyer_email','sizes','units','collector_numbers','fulfillment_status','tracking_number','disciple_code','carrier','merchandise_subtotal','shipping_amount','tax_amount','amount_total','paid_at','shipped_at'];
  const rows=orders.map(order=>[order.id,order.status,order.buyerName,order.buyerEmail,(order.items||[]).map(item=>`${item.size}:${item.quantity}`).join('|'),(order.items||[]).reduce((n,item)=>n+Number(item.quantity||0),0),(order.collectorNumbers||[]).join('|'),order.fulfillmentStatus,order.trackingNumber,order.discipleCode,order.carrier,order.merchandiseSubtotal,order.shippingAmount,order.taxAmount,order.amountTotal,order.paidAt,order.shippedAt].map(csv).join(','));
  return [headers.join(','),...rows].join('\n');
}
export function shopMetrics(store){
  const paid=(store.shopOrders||[]).filter(order=>['paid','shipped'].includes(order.status)||['awaiting_fulfillment','shipped'].includes(order.fulfillmentStatus));
  return {grossRevenue:paid.reduce((n,o)=>n+Number(o.amountTotal||0),0),merchandiseRevenue:paid.reduce((n,o)=>n+Number(o.merchandiseSubtotal||0),0),unitsSold:paid.reduce((n,o)=>n+(o.items||[]).reduce((x,item)=>x+Number(item.quantity||0),0),0),unitsRemaining:(store.shopProducts||[]).reduce((n,p)=>n+Object.values(p.sizeInventory||{}).reduce((x,v)=>x+Number(v||0),0),0),paidOrders:paid.length};
}
