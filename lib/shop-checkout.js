import { ensureShopCollections } from './shop-catalog.js';

export class ShopCheckoutError extends Error {
  constructor(message,statusCode=400){super(message);this.name='ShopCheckoutError';this.statusCode=statusCode;}
}

export function normalizeShopCart(store,cart=[]) {
  ensureShopCollections(store);
  if(!Array.isArray(cart)||!cart.length) throw new ShopCheckoutError('Your shop cart is empty.');
  const lines=[];
  for(const source of cart){
    if(source.price!=null||source.unitAmount!=null||source.total!=null) throw new ShopCheckoutError('Browser price values are not accepted.');
    const product=store.shopProducts.find(item=>item.id===String(source.productId||'')&&item.active!==false);
    if(!product) throw new ShopCheckoutError('Product is unavailable.',404);
    const size=String(source.size||''),quantity=Number(source.quantity);
    if(!product.sizes.includes(size)) throw new ShopCheckoutError(`Select a valid size for ${product.name}.`);
    if(!Number.isInteger(quantity)||quantity<=0) throw new ShopCheckoutError('Quantity must be a positive whole number.');
    lines.push({productId:product.id,name:product.name,size,quantity,unitAmount:Number(product.unitAmountBySize[size])});
  }
  const merchandiseSubtotal=lines.reduce((sum,line)=>sum+line.unitAmount*line.quantity,0);
  return {lines,totals:{merchandiseSubtotal,shippingAmount:Number(store.shopProducts[0]?.shippingAmount||500)}};
}

export function buildShopCheckoutSession(order,origin='https://www.kvnlive.com') {
  const safeOrigin=String(origin).replace(/\/$/,'');
  const line_items=order.items.map(item=>({
    quantity:item.quantity,
    price_data:{currency:'usd',unit_amount:item.unitAmount,product_data:{name:`${item.name} — ${item.size}`,description:'Black Numbered Collector’s Edition Drop 001 shirt'}}
  }));
  line_items.push({quantity:1,price_data:{currency:'usd',unit_amount:order.shippingAmount,product_data:{name:'Flat-rate shipping'}}});
  return {
    mode:'payment',line_items,automatic_tax:{enabled:true},
    shipping_address_collection:{allowed_countries:['US']},
    billing_address_collection:'required',phone_number_collection:{enabled:true},
    customer_email:order.buyerEmail,
    success_url:`${safeOrigin}/shop/success?order_id=${encodeURIComponent(order.id)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:`${safeOrigin}/shop?checkout=cancelled`,
    metadata:{order_type:'apparel',order_id:order.id,reservation_id:order.reservationId,disciple_code:order.discipleCode||''},
    payment_intent_data:{metadata:{order_type:'apparel',order_id:order.id}}
  };
}
