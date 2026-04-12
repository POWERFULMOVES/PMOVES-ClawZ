# PMOVES.AI Integration Dossier

_Last updated: 2026-04-10_

## Module
- Name: PMOVES-ClawZ
- Path: PMOVES-ClawZ
- Upstream: OpenClaw (forked, PMOVES.AI edition)

## Purpose in PMOVES.AI
ClawZ is the multi-channel agent gateway for PMOVES.AI. It wraps the OpenClaw
runtime (Telegram / Mattermost / Nextcloud Talk / Claude web bridge / etc.) and
exposes a single HTTP + WebSocket control plane (`openclaw-gateway`) plus a
companion `openclaw-cli` container that shares the gateway's network namespace.

Inside PMOVES.AI, ClawZ serves three roles:
1. **Channel fan-in/fan-out** — routes messages from user-facing channels into
   agent workflows and returns responses via the same adapters.
2. **Event publisher** — emits lifecycle events (`message:received`,
   `message:sent`, `channel:connected/disconnected`) onto the PMOVES NATS bus
   through the `nats-bridge` extension at `extensions/nats-bridge/`.
3. **Model provider host** — ships the bundled NVIDIA provider catalog at
   `extensions/nvidia/` so OpenClaw runtime can call NVIDIA-hosted Nemotron /
   Llama endpoints. **Default routing:** the catalog's `NVIDIA_BASE_URL` points
   at NVIDIA's hosted API (`https://integrate.api.nvidia.com/v1`). To route
   through the local PMOVES NIM container instead (`http://nvidia-nim:8000/v1`)
   or via TensorZero's gateway, operators must override `NVIDIA_BASE_URL` in
   the plugin runtime environment or register a separate provider entry
   (TBD follow-up — tracked as future work, not wired in this integration).

## PMOVES Overlay Surface
- **Overlay path:** repo-root submodule `PMOVES-ClawZ/` (no `pmoves-integrations/`
  overlay — ClawZ is a first-class submodule with its own `docker-compose.yml`).
- **Compose/profile wiring:** services `openclaw-gateway` and `openclaw-cli`
  defined in `PMOVES-ClawZ/docker-compose.yml`. The gateway attaches to both
  `pmoves_api` and `pmoves_bus` external networks so it can accept API traffic
  from Kong/Supabase tier services and publish to NATS on `pmoves_bus`. The CLI
  sidecar inherits the gateway's network namespace via
  `network_mode: service:openclaw-gateway`, so it does not attach networks
  directly.
- **Published host ports:** `OPENCLAW_GATEWAY_PORT` (default **18789**, control
  UI + HTTP API + WebSocket) and `OPENCLAW_BRIDGE_PORT` (default **18790**,
  companion bridge socket). Both bind behaviour is controlled by
  `OPENCLAW_GATEWAY_BIND` (values: `lan` | `loopback` | `custom` | `tailnet` |
  `auto`), defaulting to `lan` for host browser access.
- **Profile:** recommended profile label `agents` (aligns with Agent Zero /
  Archon / Mesh Agent) so a single `--profile agents` pulls ClawZ along with
  the rest of the agent tier. Optional dedicated `openclaw` profile for
  isolated bring-up.

## Env Inputs (from PMOVES env.shared)
The gateway consumes the following env vars, all sourced from the standard
PMOVES secrets pipeline (`make -C pmoves secrets-funnel`):

| Variable | Purpose | Source |
|---|---|---|
| `OPENCLAW_IMAGE` | Container image tag (default `openclaw:local`) | `env.shared` |
| `OPENCLAW_GATEWAY_PORT` | Host port for HTTP + WS gateway (default `18789`) | `env.shared` |
| `OPENCLAW_BRIDGE_PORT` | Host port for bridge socket (default `18790`) | `env.shared` |
| `OPENCLAW_GATEWAY_BIND` | Bind mode (`lan` / `loopback` / `custom` / `tailnet` / `auto`) | `env.shared` |
| `OPENCLAW_GATEWAY_TOKEN` | Bearer token for HTTP auth on gateway control plane | CHIT → env.shared |
| `OPENCLAW_CONFIG_DIR` | Host path mounted to `/home/node/.openclaw` | `env.shared` |
| `OPENCLAW_WORKSPACE_DIR` | Host path mounted to `/home/node/.openclaw/workspace` | `env.shared` |
| `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS` | Allow unauthenticated WS on private bind | `env.shared` (dev only) |
| `OPENCLAW_TZ` | Container timezone | `env.shared` |
| `NVIDIA_API_KEY` | Auth for bundled NVIDIA provider catalog | CHIT → env.shared |
| `NATS_URL` | NATS connection URL for `nats-bridge` extension (default `nats://nats:pmoves@nats:4222`) | `env.shared` |
| `CLAUDE_AI_SESSION_KEY` / `CLAUDE_WEB_SESSION_KEY` / `CLAUDE_WEB_COOKIE` | Claude.ai web bridge creds | CHIT → env.shared (optional) |

- `JWT_SECRET` / Supabase keys are **not** currently consumed by the gateway —
  ClawZ auth is `OPENCLAW_GATEWAY_TOKEN` (bearer). Supabase touchpoints are TBD
  (needs runtime verification).

## Contracts and Topics

### NATS subjects published
Emitted by `extensions/nats-bridge/src/nats-publisher.ts` via fire-and-forget
connect/publish/flush/close. Failures are logged and swallowed so the bridge
never blocks message routing.

| Subject | Trigger | Payload shape |
|---|---|---|
| `openclaw.message.received.v1` | OpenClaw runtime `message:received` event on any channel adapter | `{ channel: string, message_id?: string, author?: string, content_length: number, timestamp: ISO-8601 }` |
| `openclaw.message.sent.v1` | OpenClaw runtime `message:sent` event | `{ channel: string, message_id?: string, author?: string, content_length: number, timestamp: ISO-8601 }` |
| `openclaw.channel.connected.v1` | OpenClaw runtime `channel:connected` **or** `channel:disconnected` event | `{ channel: string, status: "connected" \| "disconnected", timestamp: ISO-8601 }` |

All three subjects follow the PMOVES `<domain>.<noun>.<verb>.v<major>` naming
convention and are versioned with `.v1`. Schemas are loosely typed (no Avro /
protobuf registry yet). Content bodies are intentionally **not** published —
only metadata — so PII never lands on the bus.

### NATS subjects subscribed
None in the current code. The `nats-bridge` extension is publish-only. No
`nc.subscribe()` / `JetStream consumer` calls exist in the submodule as of the
integration dossier date. _TBD (future work): subscribe to
`agent.graphiti.signed.v1` for trail attribution feedback._

### Supabase schema/tables touched
None directly. No `SUPABASE_URL` / `PGREST` / `supabase-js` imports found in
the submodule. If/when ClawZ persists channel state to Supabase, it will go
through Kong at `http://supabase-kong:8000/rest/v1` per the standard PMOVES
consumer URL convention. _TBD (needs runtime verification)._

### MCP endpoints/skills
No dedicated MCP server is exposed by the gateway. The `src/gateway/` tree
includes plugin-http routing and a control UI but does not register MCP tools
in the canonical `POST /mcp/command` pattern used by Agent Zero. OpenClaw's
own plugin system (`openclaw/plugin-sdk`) is the integration point for custom
tools. _TBD: wire ClawZ tools through Agent Zero's MCP surface if cross-agent
tool invocation becomes a requirement._

## Boot Order and Health

### Dependency order
1. **NATS** (`pmoves_bus` network) must be healthy — `nats-bridge` extension
   attempts connection at startup and per-event publish.
2. **Supabase** (optional for current code, required if ClawZ ever persists
   state).
3. **`openclaw-gateway`** — starts with `node dist/index.js gateway --bind $OPENCLAW_GATEWAY_BIND --port 18789`.
4. **`openclaw-cli`** — `depends_on: openclaw-gateway`, shares its network
   namespace via `network_mode: service:openclaw-gateway`.

### Health endpoints
Exposed by `src/gateway/server-http.ts` on the gateway port (default 18789):

| Path | Kind | Used by |
|---|---|---|
| `GET /health` | liveness | docker health scripts, Prometheus |
| `GET /healthz` | liveness | compose healthcheck (node `fetch('http://127.0.0.1:18789/healthz')`) |
| `GET /ready` | readiness | orchestrator pre-flight |
| `GET /readyz` | readiness | Kubernetes manifests in `scripts/k8s/manifests/deployment.yaml` |

Healthcheck interval: 30s, timeout 5s, retries 5, `start_period: 20s`.

### Smoke targets
- `curl -fsS http://127.0.0.1:18789/healthz` — host-side liveness probe.
- `curl -fsS http://127.0.0.1:18789/readyz` — host-side readiness probe.
- Inside PMOVES: the fleet-wide health sweep `/health:check-all` should include
  ClawZ once the service is wired into the main service catalog.

## Hardening Notes
- **Image pinning / provenance:** currently `openclaw:local` (locally built)
  or overridden via `OPENCLAW_IMAGE`. Needs a pinned SHA published to GHCR
  before production. _TBD (CI image publish lane)._
- **Secrets source:** `OPENCLAW_GATEWAY_TOKEN`, `NVIDIA_API_KEY`, and Claude
  session keys come from the CHIT → env.shared funnel. They appear in the
  container as plain env vars; no `*_FILE` secret mount is used today.
- **Network/security policy:** `openclaw-cli` drops `NET_RAW` and `NET_ADMIN`
  and sets `no-new-privileges:true`. The gateway container itself does **not**
  currently drop caps or set `read_only: true` — matches upstream OpenClaw
  defaults. Once attached to `pmoves_api` / `pmoves_bus` (internal bridge
  networks), lateral movement is limited to services on those networks.
- **Auth model:** Bearer token via `OPENCLAW_GATEWAY_TOKEN`. Private-WS access
  can be loosened with `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1` — **dev only,
  must remain unset in production**.
- **Sandbox option:** The compose file includes commented-out mounts for
  `/var/run/docker.sock` and `DOCKER_GID` group_add, intended for sandbox
  isolation. These remain opt-in and should only be enabled on trusted
  hosts with `--build-arg OPENCLAW_INSTALL_DOCKER_CLI=1`.

## Source Documentation
- Upstream docs entrypoint: `PMOVES-ClawZ/README.md`, `docs/install/docker.md`
- Extension entrypoints: `extensions/nvidia/` (model provider),
  `extensions/nats-bridge/` (event publisher)
- PMOVES docs index reference: `pmoves/docs/SUBMODULE_DOCS_DOSSIER.md`
- Service catalog entry: _TBD (pending addition to `.claude/CLAUDE.md` and
  `pmoves/docs/TOPOLOGY.md`)_

## Owner / Audit
- Owning lane: Agents tier (Agent Zero / Archon / ClawZ)
- Last integration audit run: 2026-04-10
- Next audit triggers:
  - Any new NATS subject added to `extensions/nats-bridge/src/nats-publisher.ts`
  - Supabase integration landing
  - MCP tool registration landing
  - Image publish workflow landing
