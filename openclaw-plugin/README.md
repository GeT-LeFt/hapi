# openclaw-plugin

Mock OpenClaw-side adapter for HAPI integration work.

This package is not a real OpenClaw runtime binding yet. It is a small HTTP service that behaves like the proposed OpenClaw plugin contract from `docs/openclaw-plugin-design.md`.

What it does:

- accepts HAPI outbound commands
- enforces bearer auth
- tracks idempotency keys in memory
- signs callback events back to HAPI
- emits deterministic mock assistant and approval events

Useful env vars:

- `OPENCLAW_PLUGIN_LISTEN_HOST` default `127.0.0.1`
- `OPENCLAW_PLUGIN_LISTEN_PORT` default `3016`
- `OPENCLAW_SHARED_SECRET` shared secret used for HAPI bearer auth and callback signing
- `HAPI_BASE_URL` base URL for HAPI hub callbacks
- `OPENCLAW_PLUGIN_NAMESPACE` default `default`

Run:

```bash
cd openclaw-plugin
bun run dev
```

Current compatibility note:

- the mock plugin only exposes `/hapi/channel/*` and `/hapi/health`
- HAPI official mode must point `OPENCLAW_PLUGIN_BASE_URL` at this service and use the same `OPENCLAW_SHARED_SECRET`
