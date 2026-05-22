# PMOVES-ClawZ — Claude Code Context (PMOVES overlay)

> Fork of [openclaw/openclaw](https://github.com/openclaw/openclaw) — multi-channel AI gateway with extensible messaging integrations. Integrated into the PMOVES.AI mesh as the **provider-routing layer** under Agent Zero orchestration.

This file holds **only PMOVES-specific overlays**. Upstream openclaw's canonical guide stays untouched:

- **[`../AGENTS.md`](../AGENTS.md)** — root rules (telegraph style). All build/test/lint/type/format commands, PR policy, plugin SDK boundaries. **The root `CLAUDE.md` is an upstream-convention symlink to `AGENTS.md` — do not edit it directly.**
- **[`../CONTRIBUTING.md`](../CONTRIBUTING.md)** — contributor workflow.
- Scoped guides in `src/{plugin-sdk,channels,plugins,gateway}/`, `extensions/`, `test/helpers*/`, `docs/`.

## PMOVES integration

ClawZ sits **between Agent Zero and the LLM provider fleet**. The activation pattern is "Agent Zero + multiple ClawZ wrapping" — each PMOVES node runs Agent Zero as orchestrator and ClawZ as the provider gateway that owns auth, model routing, and channel state. See `pmoves/docs/architecture/PMOVES_MOF_ARCHITECTURE.md` (parent repo) for the broader mesh thesis.

| Role | Service | Where |
|---|---|---|
| Orchestrator (parent) | PMOVES-Agent-Zero | MCP API on `:50051` (docked) or `:8080` (standalone) |
| Provider gateway | **PMOVES-ClawZ (this repo)** | Local gateway via `pnpm dev` / `pnpm openclaw` |
| LLM routing layer (production) | TensorZero | parent mesh, container `tensorzero-gateway:3000` |

In PMOVES production, **TensorZero is the canonical LLM gateway** for embeddings and chat completions (OpenAI-compatible routes under `/openai/v1`). ClawZ owns provider-side channels and plugin lifecycle; it does *not* duplicate TensorZero's routing function.

## Provider catalog

`extensions/` ships native plugins for each provider (`anthropic/`, `amazon-bedrock/`, `alibaba/`, `arcee/`, `anthropic-vertex/`, etc.). Each plugin owns its own auth, catalog, and runtime hooks per upstream's owner-boundary rule (see `../AGENTS.md` § Architecture).

## PMOVES-specific gotchas

- **No new provider keys in this repo.** PMOVES routes provider credentials through CHIT-encoded secrets in the parent (`pmoves/configs/secrets_manifest_v2.yaml`). ClawZ plugins consume them via env injection at runtime — do not paste API keys into `extensions/*/` or `.env*`.
- **Plugin SDK boundary is load-bearing.** Per upstream `AGENTS.md` § Architecture: plugins cross into core only via `openclaw/plugin-sdk/*` and documented barrels (`api.ts`, `runtime-api.ts`). PMOVES customizations belong in a plugin, never in core `src/**`.
- **Channels vs providers.** Channels are runtime implementations under `src/channels/**`; provider plugins live in `extensions/`. PMOVES integrations almost always belong on the provider side, not the channel side.
- **Cross-runtime.** Repo runs on Node 22+ and Bun (keep both lock paths aligned). PMOVES production is Linux-container; verify Linux pathing on PRs touching FS or platform glue.
- **Upstream symlink convention.** Root `CLAUDE.md` is a symlink to `AGENTS.md` (per upstream's "edit AGENTS.md only" policy). PMOVES context lives here, in `.claude/CLAUDE.md`, so the symlink can ride along on upstream merges without conflict.

## When to load this file

- Touching the **provider gateway plugin contract** (`src/plugin-sdk/*`, `src/gateway/protocol/*`) in a PMOVES branch.
- Adding a **PMOVES-specific provider plugin** (e.g., a TensorZero-aware fallthrough, or a PMOVES local-model provider).
- Wiring **Agent Zero ↔ ClawZ MCP traffic** — ports, auth, message flow.
- Otherwise, prefer `../AGENTS.md` directly.

## PMOVES context tags

<!-- PMOVES.AI-CONTEXT-TAGS -->
**Primary skills:** `/agents:execute`, `/agents:status`, `/model:load`, `/model:unload`, `/tensorzero:models`
**Context files (parent repo):** `.claude/CATALOG.md`, `.claude/context/tensorzero.md`, `.claude/context/agent-zero-orchestration.md`
**Domain tags:** `gateway`, `providers`, `agent-mesh`
**Context tier:** 2 (On-Demand — Major Subsystem)
<!-- /PMOVES.AI-CONTEXT-TAGS -->

## Related (parent repo)

- `pmoves/docs/architecture/PMOVES_MOF_ARCHITECTURE.md` — mesh thesis
- `.claude/context/agent-zero-orchestration.md` — orchestrator side of the contract
- Memory: `project_multiclaw_architecture.md` — activation sequence, MCP hub-spoke pattern
