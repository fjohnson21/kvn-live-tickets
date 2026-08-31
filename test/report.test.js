import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_REPORT_HEADERS, csvCell, eventReportRows, eventReportCsv } from '../lib/report.js';

const event = { id: 'event-1', title: 'KVN Weekend', slug: 'kvn-weekend' };
const address = { line1: '10 Main St', line2: 'Suite 2', city: 'Atlanta', state: 'GA', postalCode: '30303', country: 'US' };

test('complete report emits one row per pass with collected and derived data', () => {
  const order = {
    id: 'order-1', status: 'paid', createdAt: '2026-08-30T12:00:00Z', paidAt: '2026-08-30T12:01:00Z',
    buyerName: 'A Buyer', buyerEmail: 'a@example.com', customer: { name: 'A Buyer', email: 'a@example.com', cellPhone: '404-555-1212', billingAddress: address, mailingSameAsBilling: true, mailingAddress: address },
    amountSubtotal: 11750, groupDiscountAmount: 0, promoDiscountAmount: 500, discountAmount: 500, taxAmount: 900,
    feeBreakdown: { kvnFee: 350, merchantFee: 410, buyerKvnFee: 350, buyerMerchantFee: 410 }, amountTotal: 12910,
    discipleCode: 'FAITH', tickets: [
      { code: 'CODE-1', productId: 'ticket-1', ticketName: 'Weekend Pass', holderName: 'A Buyer', holderEmail: '', apparel: { mode: 'optional', name: 'KVN Tee', size: 'M', unitAmount: 1750, fulfilled: false }, checkedIn: true, checkedInAt: '2026-09-01T10:00:00Z', transferredAt: null },
      { code: 'CODE-2', productId: 'ticket-1', ticketName: 'Weekend Pass', holderName: 'A Buyer', holderEmail: '', apparel: null, checkedIn: false, checkedInAt: null }
    ]
  };
  const rows = eventReportRows(event, [order]);
  assert.equal(rows.length, 2);
  const first = Object.fromEntries(EVENT_REPORT_HEADERS.map((header, index) => [header, rows[0][index]]));
  assert.equal(first['Cell Phone'], '404-555-1212');
  assert.equal(first['Billing Street 1'], '10 Main St');
  assert.equal(first['Mailing Same As Billing'], 'Yes');
  assert.equal(first['Ticket Code'], 'CODE-1');
  assert.equal(first['Apparel Mode'], 'optional');
  assert.equal(first['Apparel Size'], 'M');
  assert.equal(first['Apparel Unit Price'], 1750);
  assert.equal(first['Checked In'], 'Yes');
  assert.equal(first['Order Total'], 12910);
  const second = Object.fromEntries(EVENT_REPORT_HEADERS.map((header, index) => [header, rows[1][index]]));
  assert.equal(second['Apparel Selected'], 'No');
  assert.equal(second['Apparel Size'], '');
});

test('legacy orders export included apparel and blank new customer fields', () => {
  const rows = eventReportRows(event, [{ id: 'legacy', status: 'paid', buyerName: 'Legacy Buyer', buyerEmail: 'legacy@example.com', tickets: [{ code: 'OLD-1', ticketName: 'VIP', includedApparel: { size: 'XL', fulfilled: true }, checkedIn: false }] }]);
  const row = Object.fromEntries(EVENT_REPORT_HEADERS.map((header, index) => [header, rows[0][index]]));
  assert.equal(row['Cell Phone'], '');
  assert.equal(row['Apparel Mode'], 'included');
  assert.equal(row['Apparel Size'], 'XL');
  assert.equal(row['Apparel Fulfilled'], 'Yes');
});

test('csv cells escape commas quotes and spreadsheet formulas', () => {
  assert.equal(csvCell('Johnson, Jr.'), '"Johnson, Jr."');
  assert.equal(csvCell('He said "yes"'), '"He said ""yes"""');
  assert.equal(csvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"');
  assert.equal(csvCell('+1-404-555-1212'), "'+1-404-555-1212");
});

test('csv output includes fixed headers and one line per ticket', () => {
  const csv = eventReportCsv(event, [{ id: 'order-1', status: 'paid', buyerName: 'Buyer', buyerEmail: 'b@example.com', tickets: [{ code: 'A' }, { code: 'B' }] }]);
  assert.equal(csv.split('\n').length, 3);
  assert.ok(csv.startsWith(EVENT_REPORT_HEADERS.join(',')));
});
