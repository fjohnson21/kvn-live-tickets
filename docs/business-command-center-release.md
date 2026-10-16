# Business Command Center release — October 16, 2026

Approved scope: income-first owner screen; ten business workspaces; exact Eastern sales periods; source-backed CSV; original-record apparel disposition; audited budgets, installments and partner balances; protected Social aggregates; shared reviewed action service.

OpenAI credentials and natural-language execution are explicitly deferred by the owner. Assistant readiness is disabled. New external MCP writes remain disabled pending verified OAuth and security setup. No live messages, refunds or synthetic sales were used for testing.

Final independent review found no Critical findings. Important findings were addressed in one correction pass: Stripe payment-alias consolidation retaining refund observations; confirmed new Shop refund amount/identity; reconciliation of legacy/new fulfillment and guards on changing fulfilled sizes; per-currency partner/financial display; invoice-specific payment caps and direct-reference reversal protection. Minor findings also addressed: MCP Social/finance data, Social stale/incomplete handling, audit response replay and sales-navigation race.

Verification: 65 focused backend checks passed, including all ten views and a fixture-only budget save; website focused checks 17/17 and typecheck passed; production build and byte-for-byte public asset parity passed. Social bridge and existing regressions passed 20 with one live-Postgres test skipped. A full backend run before final review passed 396/396. Final broad rerun and live deployment verification are recorded separately when complete.

Limits: historical refund amounts can be missing and are flagged; verified partner processor integration is not connected; owner-recorded finance remains separate from verified sales; Social moderation uses its own login; historic as-of finance snapshots are not claimed. Existing unrelated website copy/metadata baseline failures remain documented in owner-preview-asset-fix.md. Production browser verification has not yet been completed for this release.

Release sources: backend isolated branch codex/business-command-center; Social aggregate bridge fbc1eba from codex/kv-social-bunny-video; website source eb24b3d8a0865fc19fce9973d71ef41ff2896034. Preserve original production data, persistent disk and Site audience.
