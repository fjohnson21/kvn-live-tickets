# KV Live isolated check-in capacity results — October 30, 2026

All seven load scenarios and admission-protection assertions passed. No backend defect was reproduced, so no application correction is proposed. These are local synthetic measurements, not production load certification.

Application baseline: `6c8d0472874e526c8124e50beb0187b8c9ff0751`, containing deployed scanner merge `6f556a67547f906e094d8f7aee8b49e34bfafc17`. Local harness commit: `92e8aa5387eb314e714e5727488582c858ff14d0`. Remote harness contents were compared with the executed local file and match.

| Scenario | Requests | Seconds | Requests/sec | p95 ms | p99 ms | Max ms | Responses |
|---|---:|---:|---:|---:|---:|---:|---|
| 90-minute arrival rate, 60-second sample | 17 | 60.001 | 0.28 | 200.12 | 200.12 | 200.12 | 200: 17 |
| 60-minute arrival rate, 60-second sample | 26 | 60 | 0.43 | 37.28 | 195.15 | 195.15 | 200: 26 |
| 240-per-minute burst, 30 seconds | 120 | 29.999 | 4 | 36.37 | 87.63 | 104.06 | 200: 120 |
| 1600 admissions, 4 lanes, base store | 1600 | 18.93 | 84.52 | 88.29 | 160.63 | 1161.06 | 200: 1600 |
| 1600 admissions, 16 lanes, base store | 1600 | 14.237 | 112.39 | 221.09 | 285.67 | 959.94 | 200: 1600 |
| 1600 admissions, 4 lanes, 10 MiB padding | 1600 | 313.524 | 5.1 | 1387.86 | 1782.74 | 2662.95 | 200: 1600 |
| 100 same-ticket races, 16 sessions each | 1600 | 2.446 | 654.11 | 30.52 | 66.82 | 85.94 | 200: 100, 409: 1500 |

Every full batch persisted exactly 1,600 checked-in tickets. Every same-ticket race produced exactly one success and fifteen duplicates: 100 admissions and 1,500 expected HTTP 409 responses. No unexpected HTTP or transport failures occurred. Refunded, replaced, payment-attention, wrong-organizer, unknown-ticket, unauthenticated and missing-permission requests were rejected; none changed attendance.

Existing regression validation: **520 tests passed, zero failed or skipped**; `npm run check`, harness syntax and `git diff --check` passed. Browser tests were not rerun because no scanner/UI code changed; this is an HTTP/backend capacity test.

## Interpretation and limits

The 240/minute burst was nine times the 26.7/minute target. With 10 MiB synthetic padding, four lanes achieved approximately **306 admissions/minute**, with p95 latency **1.39 seconds** and maximum **2.66 seconds**. That is substantial local margin over the average target, but the roughly 16.6-fold throughput drop versus the small four-lane store demonstrates sensitivity to store size. This is not a measured saturation ceiling.

The two arrival-rate tests are 60-second samples (17 and 26 requests after rounding), not full 90/60-minute endurance runs. The first sample overlapped briefly with the regression suite; its latency and scheduling lag include that contention. Later scenarios ran after that suite completed. An incidental local read of synthetic attendance was used to report progress during the padded-store test.

Environment: Linux, Node v24.22.1, INTEL(R) XEON(R) PLATINUM 8573C, 9 reported logical CPUs; shared execution environment, not Render-equivalent resource certification. The generator and HTTPS proxy share this host with the server. Sixteen independent session cookies use one synthetic identity changed to staff after real login. Base store was 291,710 bytes; padded store was 10,777,470 bytes initially. Padding models byte size, not production record complexity.

Single-process synchronous store mutations serialize this endpoint, but these tests do not establish cross-process or background-writer safety. Production store size, disk characteristics, branded proxy, network conditions, session expiry/restart behavior and competing production workflows were not measured. No real tickets, customer data, production attendance mutations, or load requests to live infrastructure were used. No offline admission support is implied.

Next capacity gate: run this harness in an isolated environment matching Render compute/storage and representative synthetic record volume, with intended staff identities and concurrent background workflows. Separately complete physical iPhone/Android and venue-network/lighting rehearsal. Keep production merge/deployment behind Frank’s explicit approval.
