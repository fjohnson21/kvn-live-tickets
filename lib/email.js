const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

function eventDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  }).format(date);
}

function productDescription(event, ticket) {
  return (event.products || []).find(product => product.id === ticket.productId)?.description || '';
}

function apparelText(ticket) {
  const apparel = ticket.apparel || ticket.includedApparel;
  if (!apparel) return '';
  const name = apparel.name || 'Drop 001 T-shirt';
  return `${name}${apparel.size ? ` — Size ${apparel.size}` : ''}`;
}

export function buildTicketConfirmation({ order, event, baseUrl }) {
  const safeBaseUrl = String(baseUrl || '').replace(/\/$/, '');
  const date = eventDate(event.date);
  const location = [event.venue, event.location].filter(Boolean).join(' • ');
  const tickets = order.tickets || [];
  const hasIncludedApparel = tickets.some(ticket => Boolean(ticket.apparel || ticket.includedApparel));
  const shippingNotice = 'Your included Drop 001 shirt will ship on October 15, 2026, to the mailing address provided at checkout.';
  const htmlTickets = tickets.map(ticket => {
    const qrUrl = `${safeBaseUrl}/api/tickets/${encodeURIComponent(ticket.code)}/qr.svg`;
    const description = productDescription(event, ticket);
    const apparel = apparelText(ticket);
    return `<section style="margin:20px 0;padding:20px;border:1px solid #dedede;border-radius:12px">`
      + `<h2 style="margin:0 0 8px">${escapeHtml(ticket.ticketName)}</h2>`
      + `<p style="font-size:18px;font-weight:700;letter-spacing:1px">${escapeHtml(ticket.code)}</p>`
      + (description ? `<p>${escapeHtml(description)}</p>` : '')
      + (apparel ? `<p><strong>Included apparel:</strong> ${escapeHtml(apparel)}</p>` : '')
      + `<p><a href="${escapeHtml(qrUrl)}">Open your ticket QR code</a></p>`
      + `<img width="180" height="180" alt="Ticket QR code" src="${escapeHtml(qrUrl)}">`
      + `</section>`;
  }).join('');
  const textTickets = tickets.map(ticket => {
    const qrUrl = `${safeBaseUrl}/api/tickets/${encodeURIComponent(ticket.code)}/qr.svg`;
    return [
      ticket.ticketName,
      `Ticket code: ${ticket.code}`,
      productDescription(event, ticket),
      apparelText(ticket) ? `Included apparel: ${apparelText(ticket)}` : '',
      `Ticket QR: ${qrUrl}`
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  return {
    subject: `Your tickets: ${event.title}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#111">`
      + `<p style="color:#e2252b;font-weight:700;letter-spacing:2px">ORDER CONFIRMED</p>`
      + `<h1>You're in.</h1>`
      + `<p>Thank you${order.buyerName ? `, ${escapeHtml(order.buyerName)}` : ''}. Keep this email available for event check-in.</p>`
      + `<p><strong>Order:</strong> ${escapeHtml(order.id)}</p>`
      + `<p><strong>${escapeHtml(event.title)}</strong><br>${escapeHtml(date)}<br>${escapeHtml(location)}</p>`
      + htmlTickets
      + `<p><strong>Wear the movement:</strong> Make your Drop 001 “Not Self Made — Made By God” look your own.</p>`
      + (hasIncludedApparel ? `<p><strong>Shipping:</strong> ${shippingNotice}</p>` : '')
      + `<p><strong>Refund policy:</strong> Refunds are available only if the event is canceled.</p>`
      + `<p>Your purchase helps build infrastructure that creates greater awareness of the Kingdom of God and supports the Acts 2:44 All Things in Common initiative.</p>`
      + `</div>`,
    text: [
      'ORDER CONFIRMED — YOU\'RE IN.',
      `Order: ${order.id}`,
      event.title,
      date,
      location,
      textTickets,
      'Wear the movement: Make your Drop 001 “Not Self Made — Made By God” look your own.',
      hasIncludedApparel ? `Shipping: ${shippingNotice}` : '',
      'Refund policy: Refunds are available only if the event is canceled.',
      'Your purchase helps build infrastructure that creates greater awareness of the Kingdom of God and supports the Acts 2:44 All Things in Common initiative.'
    ].filter(Boolean).join('\n\n')
  };
}

export async function sendTicketConfirmation({
  order,
  event,
  apiKey,
  from = 'KVN Live Tickets <passes@tickets.kvnlive.com>',
  baseUrl,
  force = false,
  fetchImpl = fetch,
  now = () => new Date().toISOString()
}) {
  if (!force && order.confirmationEmail?.status === 'sent') {
    return { status: 'skipped', reason: 'already_sent' };
  }
  if (!apiKey) {
    return { status: 'not_configured', provider: 'resend', failedAt: now(), error: 'RESEND_API_KEY is not configured.' };
  }
  if (!order.buyerEmail) {
    return { status: 'failed', provider: 'resend', failedAt: now(), error: 'The order does not have a buyer email address.' };
  }

  try {
    const content = buildTicketConfirmation({ order, event, baseUrl });
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [order.buyerEmail], ...content })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data.message || data.error || 'Unknown provider error';
      return {
        status: 'failed', provider: 'resend', failedAt: now(),
        error: `Resend rejected the confirmation email (${response.status}): ${detail}`
      };
    }
    return { status: 'sent', provider: 'resend', messageId: data.id || '', sentAt: now() };
  } catch (error) {
    return { status: 'failed', provider: 'resend', failedAt: now(), error: `Email delivery request failed: ${error.message}` };
  }
}

function recordTicketConfirmation(order, result) {
  if (result.status === 'skipped') return result;
  order.confirmationEmail = result;
  order.confirmationEmailAttempts ||= [];
  order.confirmationEmailAttempts.push({ ...result });
  return result;
}

export async function deliverTicketConfirmation(options) {
  const result = await sendTicketConfirmation(options);
  return recordTicketConfirmation(options.order, result);
}

export function createTicketConfirmationDispatcher() {
  const inFlight = new Map();
  return async function dispatch(options) {
    const key = options.order.id;
    let operation = !options.force && inFlight.get(key);
    if (!operation) {
      operation = sendTicketConfirmation(options);
      if (!options.force) inFlight.set(key, operation);
    }
    try {
      const result = await operation;
      return recordTicketConfirmation(options.order, result);
    } finally {
      if (!options.force && inFlight.get(key) === operation) inFlight.delete(key);
    }
  };
}
