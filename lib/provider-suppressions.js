import { normEmail } from './marketing.js';

const failure = () => Object.assign(new Error('Cannot verify Resend provider-wide suppression list. Do not send this campaign.'), { statusCode: 503 });

// Read-only, paginated suppression reconciliation. An incomplete or failed page
// blocks sending; never assume that an empty partial result means no suppressions.
export async function loadResendSuppressions(env = process.env, fetchImpl = fetch) {
  if (!env.RESEND_API_KEY) throw failure();
  const all = new Set();
  let after = null;
  const seen = new Set();
  for (let page = 0; page < 500; page++) {
    const url = new URL('https://api.resend.com/suppressions');
    url.searchParams.set('limit', '100');
    if (after) url.searchParams.set('after', after);
    let response, payload;
    try {
      response = await fetchImpl(url.toString(), {
        headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, Accept: 'application/json' },
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) throw failure();
      payload = await response.json();
    } catch { throw failure(); }
    if (!Array.isArray(payload?.data) || typeof payload?.has_more !== 'boolean' || payload.data.length > 100) throw failure();
    for (const item of payload.data) {
      if (!item || typeof item.id !== 'string' || typeof item.email !== 'string') throw failure();
      all.add(normEmail(item.email));
    }
    if (!payload.has_more) return all;
    after = payload.data.at(-1)?.id;
    if (!after || seen.has(after)) throw failure();
    seen.add(after);
  }
  throw failure();
}
