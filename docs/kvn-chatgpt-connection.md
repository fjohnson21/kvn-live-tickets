# KVN chat connection readiness

The owner deferred OpenAI credential setup and asked to continue other features. Embedded chat remains disabled, with an explicit status and no command execution. No API key is created, stored or sent to the browser.

The shared action service supports reviewed event edits, lead dispositions, finance entries, apparel fulfillment, campaign drafts and existing broadcast release. Exact record snapshots, owner permissions, revisions, request IDs and audit results protect both future chat entry points. Unknown broadcast outcomes require review and are not blindly retried.

ChatGPT MCP now includes platform income and business workspace reads plus prepared/executed business actions. External edits remain OFF unless KVN_BUSINESS_EXTERNAL_WRITES_ENABLED is deliberately enabled after dependency-security review and verified owner OAuth configuration. Existing Controller OFF and scoped token verification remain enforced. The branded MCP/discovery gateway forwards only bearer authentication, never browser owner/member cookies.

Required later: resolve documented dependency findings against the actual deployed lock/version tree, configure owner OAuth issuer/JWKS/subject for the https://kvnlive.com/mcp audience, verify the genuine ChatGPT connection and scopes, and use the secure OpenAI key workflow before implementing provider-specific embedded AI. A ready endpoint is not a connected ChatGPT session.

In broadcast mode, both existing email controller tools and the new action service call the existing Broadcast preview/release service. They do not switch to the legacy per-recipient sender. Read/prepare tools do not send mail; an authorized release requires the exact preview token and recipient count.
