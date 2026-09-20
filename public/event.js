import { availabilityLabel, earlyReleasePriceSummary, sizeOptionLabel } from './catalog-view.js';
import { selectionQuantityState } from './quantity-model.js';

const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
const esc = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
let event, organization, cart = [];
const draftSelections = new Map();
const cartId = localStorage.getItem('kvn_cart_id') || `cart_${Math.random().toString(36).slice(2)}`;
localStorage.setItem('kvn_cart_id', cartId);
const slug = new URLSearchParams(location.search).get('slug');

function apparelConfig(product) {
  const source = product.includedApparel || {};
  const mode = ['none', 'optional', 'included'].includes(source.mode) ? source.mode : source.enabled ? 'included' : 'none';
  return { mode, name: source.name || 'T-shirt', price: Number(source.price || 0), sizes: source.sizes || [], sizeInventory: source.sizeInventory || {} };
}
function passSelections(quantity, config, prior = []) {
  return Array.from({ length: quantity }, (_, index) => {
    if (config.mode === 'none') return { apparelSelected: false, apparelSize: null };
    if (config.mode === 'included') return { apparelSelected: true, apparelSize: prior[index]?.apparelSize || null };
    return { apparelSelected: prior[index]?.apparelSelected === true, apparelSize: prior[index]?.apparelSelected ? prior[index].apparelSize || null : null };
  });
}
async function init() {
  const response = await fetch(`/api/events/${encodeURIComponent(slug || '')}`), data = await response.json();
  if (!response.ok) { page.innerHTML = '<div class="shell section"><h1>Event not found.</h1><a href="/">Back to events</a></div>'; return; }
  event = data.event; organization = data.organization;
  document.documentElement.style.setProperty('--accent', event.theme?.accent || '#e2252b');
  document.title = `${event.title} • KVN Live Tickets`;
  cart = JSON.parse(localStorage.getItem(`cart_${event.id}`) || '[]').map(item => {
    const product = event.products.find(candidate => candidate.id === item.id);
    if (product?.type !== 'ticket') return item;
    const legacy = Array.isArray(item.apparelSizes) ? item.apparelSizes.map(size => ({ apparelSelected: true, apparelSize: size })) : item.ticketSelections;
    return { ...item, key: product.id, ticketSelections: passSelections(item.quantity, apparelConfig(product), legacy) };
  });
  renderPage(); renderCart();
}
function products(type) { return event.products.filter(product => product.type === type); }
function productDescription(description) {
  const parts = String(description || '').split(' • ').filter(Boolean);
  return `<ul class="pass-benefits">${parts.map((part, index) => `<li class="${index === 0 && /ROWS/.test(part) ? 'seating-highlight' : ''}">${esc(part)}</li>`).join('')}</ul>`;
}
function renderProducts(type) {
  const list = products(type); if (!list.length) return '<p class="muted">No items available in this section.</p>';
  return `<div class="products">${list.map(product => {
    const config = apparelConfig(product);
    const apparelCopy = product.type === 'ticket' && config.mode === 'included' ? `<p class="bundle-note">Includes ${esc(config.name)} — choose one size per pass.</p>` : product.type === 'ticket' && config.mode === 'optional' ? `<p class="bundle-note">Optional ${esc(config.name)}: ${money(config.price)} per pass.</p>` : '';
    const standaloneSize = product.options?.size ? `<select id="size-${product.id}">${product.options.size.map(size => `<option>${esc(size)}</option>`).join('')}</select>` : '<span></span>';
    const soldOut = Number(product.available || 0) <= 0, pricing = earlyReleasePriceSummary(product);
    const priceHtml = pricing.active ? `<div class="product-price"><span class="regular-price">${money(pricing.regularPrice)}</span> ${money(pricing.currentPrice)}</div><div class="early-release-note">${esc(pricing.label)} • Applied automatically</div>` : `<div class="product-price">${money(pricing.currentPrice)}</div>`;
    return `<article class="product-card"><div><span class="badge">${esc(product.badge || product.type)}</span><h3>${esc(product.name)}</h3>${productDescription(product.description)}<small class="availability">${esc(availabilityLabel(product))}</small>${apparelCopy}</div><div>${priceHtml}<div class="product-actions">${product.type === 'apparel' ? standaloneSize : '<span></span>'}<label class="quantity-control">Quantity<input type="number" id="qty-${product.id}" value="0" min="0" max="${product.maxPerOrder || 20}" step="${product.quantityStep || 1}" inputmode="numeric" ${soldOut ? 'disabled' : ''}></label><button class="btn primary" id="select-${product.id}" onclick="add('${product.id}')" disabled>${soldOut ? 'Sold Out' : 'Select Pass'}</button></div><div id="passes-${product.id}" class="pass-config"></div></div></article>`;
  }).join('')}</div>`;
}
function renderPage() {
  const blocks = event.layout || [], heroStyle = event.media?.hero ? `style="background-image:linear-gradient(#0009,#000d),url('${event.media.hero}')"` : '';
  page.innerHTML = `<section class="event-hero" ${heroStyle}><div class="shell"><span class="kicker">${esc(organization?.name || 'KVN PARTNER EVENT')}</span><h1>${esc(event.title)}</h1><p>${esc(event.description)}</p><div class="inline-actions"><button class="btn primary" onclick="document.querySelector('[data-type=tickets]')?.scrollIntoView()">Get Tickets</button><button class="btn" onclick="drawerOpen(true)">View Cart</button></div></div></section><div class="shell">${blocks.filter(block => block.type !== 'hero').map(blockHtml).join('')}</div>`;
  for (const product of event.products) {
    const input = document.getElementById(`qty-${product.id}`);
    if (!input) continue;
    input.addEventListener('input', () => refreshProductSelection(product.id));
    refreshProductSelection(product.id);
  }
}
function blockHtml(block) {
  if (block.type === 'tickets') return `<section class="layout-block" data-type="tickets"><span class="kicker">TICKETS</span><h2>${esc(block.title)}</h2><p class="muted">${esc(block.body)}</p>${renderProducts('ticket')}</section>`;
  if (block.type === 'apparel') return `<section class="layout-block"><span class="kicker">APPAREL</span><h2>${esc(block.title)}</h2><p class="muted">${esc(block.body)}</p>${renderProducts('apparel')}</section>`;
  if (block.type === 'details') return `<section class="layout-block"><span class="kicker">EVENT DETAILS</span><h2>${esc(block.title)}</h2><p>${esc(block.body)}</p><p class="muted">${esc(event.venue)} • ${esc(event.location)}</p></section>`;
  if (block.type === 'image') return `<section class="layout-block visual-image-block ${esc(block.width || 'full')}"><h2>${esc(block.title)}</h2>${event.media?.hero ? `<img src="${event.media.hero}" alt="${esc(block.title)}">` : ''}<p class="muted">${esc(block.body)}</p></section>`;
  if (block.type === 'cta') return `<section class="layout-block"><h2>${esc(block.title)}</h2><p>${esc(block.body)}</p><button class="btn primary" onclick="document.querySelector('[data-type=tickets]')?.scrollIntoView()">Get Tickets</button></section>`;
  return `<section class="layout-block"><h2>${esc(block.title)}</h2><p class="muted">${esc(block.body)}</p></section>`;
}
function renderPassEditor(productId) {
  const product = event.products.find(candidate => candidate.id === productId), config = apparelConfig(product), { quantity } = selectionQuantityState(document.getElementById(`qty-${productId}`).value, product), selections = passSelections(quantity, config, draftSelections.get(productId));
  draftSelections.set(productId, selections); const target = document.getElementById(`passes-${productId}`);
  if (!target || quantity === 0 || config.mode === 'none') { if (target) target.innerHTML = ''; return; }
  target.innerHTML = `<strong>Choose a shirt size for each pass</strong>${selections.map((selection, index) => `<div class="pass-row"><span>Pass ${index + 1}</span>${config.mode === 'optional' ? `<label class="check-row"><input type="checkbox" data-pass-selected="${index}" ${selection.apparelSelected ? 'checked' : ''}> Add ${esc(config.name)} (${money(config.price)})</label>` : `<span>${esc(config.name)} included</span>`}<label class="pass-size ${config.mode === 'optional' && !selection.apparelSelected ? 'hidden' : ''}">Size<select data-pass-size="${index}"><option value="">Select size</option>${config.sizes.map(size => `<option value="${esc(size)}" ${selection.apparelSize === size ? 'selected' : ''}>${esc(sizeOptionLabel(size))}</option>`).join('')}</select></label></div>`).join('')}`;
  target.querySelectorAll('[data-pass-selected]').forEach(input => input.addEventListener('change', () => { const index = Number(input.dataset.passSelected); selections[index] = { apparelSelected: input.checked, apparelSize: input.checked ? selections[index].apparelSize : null }; draftSelections.set(productId, selections); renderPassEditor(productId); }));
  target.querySelectorAll('[data-pass-size]').forEach(select => select.addEventListener('change', () => { selections[Number(select.dataset.passSize)].apparelSize = select.value || null; draftSelections.set(productId, selections); }));
}
function refreshProductSelection(productId) {
  const product = event.products.find(candidate => candidate.id === productId);
  const input = document.getElementById(`qty-${productId}`), button = document.getElementById(`select-${productId}`);
  if (!product || !input || !button) return;
  const state = selectionQuantityState(input.value, product);
  button.disabled = Number(product.available || 0) <= 0 || !state.canSelect;
  if (product.type === 'ticket') renderPassEditor(productId);
}
window.add = function add(productId) {
  const product = event.products.find(candidate => candidate.id === productId), state = selectionQuantityState(document.getElementById(`qty-${productId}`).value, product), quantity = state.quantity;
  if (!state.canSelect) { alert('Choose a valid quantity before selecting this pass.'); return; }
  if (product.type === 'ticket') {
    const ticketSelections = passSelections(quantity, apparelConfig(product), draftSelections.get(productId));
    if (ticketSelections.some(selection => selection.apparelSelected && !selection.apparelSize)) { alert('Choose a T-shirt size for every selected pass.'); return; }
    const item = { key: product.id, id: product.id, quantity, ticketSelections }, existing = cart.findIndex(candidate => candidate.key === product.id);
    if (existing >= 0) cart[existing] = item; else cart.push(item);
  } else {
    const size = document.getElementById(`size-${productId}`)?.value || null, key = `${productId}:${size || ''}`, existing = cart.find(candidate => candidate.key === key);
    if (existing) existing.quantity += quantity; else cart.push({ key, id: productId, size, quantity });
  }
  save(); renderCart(); drawerOpen(true);
};
function itemSummary(product, item) {
  if (product.type !== 'ticket') return { lines: item.size ? [`Size ${item.size}`] : [], total: product.price * item.quantity };
  const config = apparelConfig(product), selections = passSelections(item.quantity, config, item.ticketSelections), pricing = earlyReleasePriceSummary(product), discountedQuantity = pricing.active ? Math.min(item.quantity, Number(product.earlyRelease.remaining) || 0) : 0, lines = config.mode === 'none' ? [] : selections.map((selection, index) => selection.apparelSelected ? `Pass ${index + 1}: ${config.name} — ${selection.apparelSize}` : `Pass ${index + 1}: No apparel`), optionalCount = config.mode === 'optional' ? selections.filter(selection => selection.apparelSelected).length : 0;
  if(discountedQuantity>0)lines.unshift(`${discountedQuantity} pass${discountedQuantity===1?'':'es'} receive${discountedQuantity===1?'s':''} the automatic first-200 price`);
  return { lines, total: pricing.currentPrice * discountedQuantity + pricing.regularPrice * (item.quantity-discountedQuantity) + config.price * optionalCount };
}
function save() { localStorage.setItem(`cart_${event.id}`, JSON.stringify(cart)); trackCart(); }
function renderCart() {
  cartCount.textContent = cart.reduce((total, item) => total + item.quantity, 0); cartRows.innerHTML = cart.length ? '' : '<p class="muted">Your cart is empty.</p>'; let total = 0;
  for (const item of cart) { const product = event.products.find(candidate => candidate.id === item.id); if (!product) continue; const summary = itemSummary(product, item); total += summary.total; const row = document.createElement('div'); row.className = 'cart-row'; row.innerHTML = `<div><strong>${item.quantity} × ${esc(product.name)}</strong>${summary.lines.map(line => `<div class="muted">${esc(line)}</div>`).join('')}<button class="btn small" onclick="removeItem('${esc(item.key)}')">Remove</button></div><strong>${money(summary.total)}</strong>`; cartRows.appendChild(row); }
  cartTotal.textContent = money(total);
}
window.removeItem = key => { cart = cart.filter(item => item.key !== key); save(); renderCart(); };
function drawerOpen(open) { drawer.classList.toggle('open', open); } window.drawerOpen = drawerOpen;
openCart.onclick = () => drawerOpen(true); closeCart.onclick = () => drawerOpen(false); backdrop.onclick = () => drawerOpen(false); buyerEmail.addEventListener('change', () => trackCart());
async function trackCart(status = 'open') { if (!event) return; const amount = cart.reduce((total, item) => { const product = event.products.find(candidate => candidate.id === item.id); return product ? total + itemSummary(product, item).total : total; }, 0); try { await fetch('/api/carts/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cartId, eventId: event.id, items: cart, email: buyerEmail.value, amount, status }) }); } catch {} }
const addressSuffixes = ['Line1', 'Line2', 'City', 'State', 'PostalCode', 'Country'];
function readAddress(prefix) { return { line1: document.getElementById(`${prefix}Line1`).value, line2: document.getElementById(`${prefix}Line2`).value, city: document.getElementById(`${prefix}City`).value, state: document.getElementById(`${prefix}State`).value, postalCode: document.getElementById(`${prefix}PostalCode`).value, country: document.getElementById(`${prefix}Country`).value }; }
function syncMailing() { const same = mailingSameAsBilling.checked; for (const suffix of addressSuffixes) { const target = document.getElementById(`mailing${suffix}`); if (same) target.value = document.getElementById(`billing${suffix}`).value; target.disabled = same; } mailingFields.classList.toggle('muted', same); }
mailingSameAsBilling.addEventListener('change', syncMailing); addressSuffixes.forEach(suffix => document.getElementById(`billing${suffix}`).addEventListener('input', syncMailing)); syncMailing();
function customerPayload() { return { name: buyerName.value, email: buyerEmail.value, cellPhone: buyerPhone.value, billingAddress: readAddress('billing'), mailingSameAsBilling: mailingSameAsBilling.checked, mailingAddress: readAddress('mailing') }; }
function validateCheckoutCustomer(customer) { if (!customer.name.trim()) return 'Enter your full name.'; if (!/^\S+@\S+\.\S+$/.test(customer.email)) return 'Enter a valid email.'; if (!customer.cellPhone.trim()) return 'Enter your cell phone number.'; for (const [label, address] of [['Billing', customer.billingAddress], ['Mailing', customer.mailingAddress]]) for (const key of ['line1', 'city', 'state', 'postalCode', 'country']) if (!String(address[key] || '').trim()) return `${label} address is incomplete.`; return ''; }
checkout.onclick = async () => { checkoutError.textContent = ''; if (!cart.length) { checkoutError.textContent = 'Add at least one item.'; return; } syncMailing(); const customer = customerPayload(), customerError = validateCheckoutCustomer(customer); if (customerError) { checkoutError.textContent = customerError; return; } checkout.disabled = true; const response = await fetch('/api/create-checkout-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: event.id, cart, customer, discountCode: discountCode.value, cartId }) }), data = await response.json(); if (response.ok) location.href = data.url; else { checkoutError.textContent = data.error; checkout.disabled = false; } };
init();
