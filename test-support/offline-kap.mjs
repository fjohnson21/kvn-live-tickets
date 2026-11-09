// Test subprocesses must never submit credentials to the live KAP service.
// Shared-auth behavior is tested separately with injected local responses.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin === 'https://kingdomalliancepartners.com') {
    return new Response('{}', {status:503, headers:{'Content-Type':'application/json'}});
  }
  return originalFetch(input, options);
};
