export const SHIRT_SHIPPING_CUTOFF = '2026-11-09T05:00:00.000Z';
export function shirtFulfillmentMethod(now = Date.now()) {
  return new Date(now).getTime() < Date.parse(SHIRT_SHIPPING_CUTOFF) ? 'shipping' : 'will_call';
}
