export const EVENT_REPORT_HEADERS = [
  'Event ID', 'Event Title', 'Order ID', 'Order Status', 'Order Created', 'Paid At',
  'Buyer Name', 'Buyer Email', 'Cell Phone',
  'Billing Street 1', 'Billing Street 2', 'Billing City', 'Billing State', 'Billing Postal Code', 'Billing Country',
  'Mailing Same As Billing', 'Mailing Street 1', 'Mailing Street 2', 'Mailing City', 'Mailing State', 'Mailing Postal Code', 'Mailing Country',
  'Ticket Code', 'Ticket Product ID', 'Ticket Type', 'Ticket Name', 'Holder Name', 'Holder Email',
  'Apparel Mode', 'Apparel Name', 'Apparel Selected', 'Apparel Size', 'Apparel Unit Price', 'Apparel Fulfilled',
  'Merchandise Subtotal', 'Group Discount', 'Promotional Discount', 'Tax', 'KVN Fee', 'Merchant Fee',
  'Buyer KVN Fee', 'Buyer Merchant Fee', 'Organizer KVN Fee', 'Organizer Merchant Fee', 'Order Total',
  'Disciple Code', 'Checked In', 'Checked In At', 'Transferred At'
];

const value = input => input ?? '';
const addressValues = address => [value(address?.line1), value(address?.line2), value(address?.city), value(address?.state), value(address?.postalCode), value(address?.country)];

export function eventReportRows(event, paidOrders) {
  const rows = [];
  for (const order of paidOrders || []) {
    const customer = order.customer || {};
    const billing = customer.billingAddress || {};
    const mailing = customer.mailingAddress || {};
    const fees = order.feeBreakdown || {};
    for (const ticket of order.tickets || []) {
      const apparel = ticket.apparel || (ticket.includedApparel ? {
        mode: 'included', name: 'T-shirt', size: ticket.includedApparel.size,
        unitAmount: 0, fulfilled: ticket.includedApparel.fulfilled
      } : null);
      rows.push([
        value(event.id), value(event.title), value(order.id), value(order.status), value(order.createdAt), value(order.paidAt),
        value(customer.name || order.buyerName), value(customer.email || order.buyerEmail), value(customer.cellPhone),
        ...addressValues(billing), customer.mailingSameAsBilling === true ? 'Yes' : customer.mailingSameAsBilling === false ? 'No' : '', ...addressValues(mailing),
        value(ticket.code), value(ticket.productId), 'ticket', value(ticket.ticketName), value(ticket.holderName), value(ticket.holderEmail),
        value(apparel?.mode), value(apparel?.name), apparel ? 'Yes' : 'No', value(apparel?.size), value(apparel?.unitAmount), apparel ? apparel.fulfilled ? 'Yes' : 'No' : '',
        value(order.amountSubtotal), value(order.groupDiscountAmount), value(order.promoDiscountAmount ?? order.discountAmount), value(order.taxAmount), value(fees.kvnFee), value(fees.merchantFee),
        value(fees.buyerKvnFee), value(fees.buyerMerchantFee), value(fees.organizerKvnFee), value(fees.organizerMerchantFee), value(order.amountTotal),
        value(order.discipleCode), ticket.checkedIn ? 'Yes' : 'No', value(ticket.checkedInAt), value(ticket.transferredAt)
      ]);
    }
  }
  return rows;
}

export function csvCell(input) {
  let text = String(input ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function eventReportCsv(event, paidOrders) {
  return [EVENT_REPORT_HEADERS, ...eventReportRows(event, paidOrders)]
    .map(row => row.map(csvCell).join(','))
    .join('\n');
}
