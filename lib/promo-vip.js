export const PROMO_VIP_OFFER='kap-vip-3999';
export const PROMO_VIP_PRICE=3999;
export function promoVipProduct(product){return {...product,price:PROMO_VIP_PRICE,earlyRelease:{...product.earlyRelease,enabled:false},group:{...product.group,enabled:false},promoOffer:PROMO_VIP_OFFER};}
export function validatePromoVipRequest(event,input){
 if(input.promotion!==PROMO_VIP_OFFER||event.slug!=='kingdom-vibe-live-2026'||input.discountCode||!Array.isArray(input.cart)||input.cart.length!==1||input.cart[0].id!=='kv-all-access-2026')throw Object.assign(new Error('Choose the Kingdom VIP promo offer without an additional discount code.'),{statusCode:400});
}
