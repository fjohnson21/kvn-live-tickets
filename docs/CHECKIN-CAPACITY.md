# Isolated check-in capacity test

Run from the repository root:

```sh
npm ci --ignore-scripts
mkdir -p capacity-results
node scripts/checkin-capacity.mjs
```

The harness uses the existing disposable HTTPS fixture, the real owner login and
`/api/checkin` endpoints, and 16 independent session cookies. After authentication,
the synthetic account is changed to staff with check-in permission, matching the
browser fixture. This exercises separate sessions of one staff identity, not 16
distinct staff accounts. The fixture allowlists environment variables; no provider
keys, production data, or `.env` are inherited. No target URL is accepted.
Temporary attendance and certificates are removed on completion. TLS validation
is disabled only on the dedicated local test agent, not globally or in production.

Scenarios:

- 60-second open-loop samples at 1,600/90-minute and 1,600/60-minute rates.
- 30-second open-loop burst at 240 requests/minute.
- Complete 1,600-admission batches with four and sixteen concurrent lanes.
- Four-lane 1,600-admission batch with 10 MiB of synthetic store padding.
- 100 tickets each raced by all sixteen sessions: exactly one success and fifteen
  duplicate responses required per ticket, with persisted counts checked.
- Refunded, replaced, payment-attention, wrong-organizer, missing-ticket,
  unauthenticated and permission-denied checks; no protected ticket may be admitted.

The paced scenarios are samples, not full 60/90-minute endurance tests. Integer
sample sizes are rounded down. Batch tests are closed-loop and report achieved
throughput, not an independently established saturation ceiling. Response times
include local HTTPS/proxy handling and response-body consumption. Open-loop
scheduling lag is reported separately. There is a 15-second socket inactivity
timeout. A status of zero records a transport failure; assertions fail the run
on unexpected outcomes. JSON results are written only after all assertions pass.

The padded store tests serialization size, not a representative production data
shape. No production store size was read. Results depend on CPU, filesystem,
Node version, data size and competing work. The single-process synchronous JSON
read/modify/write path serializes requests within that process. This experiment
does not prove safety across multiple server processes or competing background
writers. Horizontal scaling must not be inferred to be safe from these results.

Not covered: Render resources and disk latency, branded proxy/WAN latency,
provider integration traffic, process restarts, session expiry, camera optics,
physical phones, venue Wi-Fi or offline admission. These measurements are not
production certification or an event-day lane staffing guarantee.
