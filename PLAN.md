# Concilium — Implementation Plan (MVP)

_Owner: claudebot — last updated 2026-05-03_

## Vision (one-liner)
Multi-LLM deliberation platform. A decision request is dispatched to several "counselors" (LLMs, often from different providers). A **Praeses Concilii** orchestrates the deliberation across rounds; a separate **Synthesizer** ("Princeps") takes the final decision. Two distinct roles on purpose: governance of the discussion is decoupled from the act of deciding.

## Stack
| Layer | Tech | Notes |
|---|---|---|
| Backend | Node 20 + TypeScript + Fastify | lightweight, native OpenAPI, zod-ts validation |
| Frontend | React 18 + TypeScript + Vite + TailwindCSS | |
| Bot | telegraf 4 | well-known pattern, env-based allowlist |
| LLM | `@anthropic-ai/sdk` (Claude Sonnet) | default; OpenAI / CLI providers pluggable |
| Validation | zod (API + storage) | single source of truth in `packages/shared` |
| Storage MVP | filesystem `.md` (YAML frontmatter + JSON), `gray-matter` | `/data/{requests,decisions,counselors,providers,contributions,audit}` |
| Container | docker-compose | api + web + bot, shared `/data` volume |
| Reverse proxy | Nginx | public endpoint `<redacted-host>` |
| Dev runner | systemd `concilium.service` | |

## Repo layout
```
concilium/
├── apps/
│   ├── api/          # Fastify backend
│   ├── web/          # React + Vite frontend
│   └── bot/          # Telegram bot (telegraf)
├── packages/
│   └── shared/       # types + zod schemas + constants
├── data/             # Markdown storage (Docker volume)
├── docker/           # Dockerfiles for api/web/bot
├── docker-compose.yml
├── package.json      # workspaces
└── PLAN.md
```

## Dev ports
- API: `7001` (HTTP, JSON)
- Web (Vite): `7002`
- Bot: no HTTP port (Telegram long-poll)
- Nginx: 443 → 7002 (web), `/api` → 7001

## Roadmap

### Phase 1 — Foundations
- [x] Init monorepo + npm workspaces + base tsconfig + `.gitignore`
- [x] Nginx `<redacted-host>` + Let's Encrypt certbot
- [x] `packages/shared`: zod schemas for Input/Output/Counselor/Provider + enum constants
- [x] `apps/api`: Fastify skeleton, CORS, health endpoint

### Phase 2 — Core domain
- [x] Filesystem **storage** in `apps/api/src/storage/`: read/write `.md` with `gray-matter`
- [x] **LLM provider** abstraction `apps/api/src/llm/` with Anthropic adapter (retry + timeout, no CoT)
- [x] **Orchestrator** `apps/api/src/orchestrator/`: parallel counselors → contributions → Synthesizer → decision → audit
- [x] **Default counselors** in `data/counselors/` (Architect, Security, Product, Cost, UX, Critic, Synthesizer)
- [x] **API endpoints**: `POST /requests`, `GET /requests`, `GET /requests/:id`, `GET /decisions`, `GET /decisions/:id`, `GET/POST /counselors`, `GET/POST /providers`

### Phase 3 — Surfaces
- [x] `apps/web`: layout shell + 4 pages (`/decisions`, `/decisions/:id`, `/requests/new`, `/configuration`)
- [x] `apps/bot`: `/new`, `/status`, `/decision`, `/debug` commands with allowlist

### Phase 4 — Operations
- [x] `docker-compose.yml` with multi-stage build for api/web/bot
- [x] `concilium.service` systemd for local dev
- [x] Smoke test: curl health, end-to-end POST /requests → decision, public access via `https://<redacted-host>/`

## Scope decisions (MVP) — non-negotiable
- **No DB**: Markdown files only until a migration is requested.
- **No user auth**: API protected by a static bearer token (env `API_TOKEN`); the Telegram bot is restricted by user_id allowlist.
- **No code-runner**: counselors produce **only** structured JSON.
- **No CoT stored**: after `JSON.parse`-ing the response, raw text is discarded.
- **Counselors run in parallel** within a round (not sequential).
- **Multi-round deliberation**: hard cap 3 rounds (env `MAX_ROUNDS`). Praeses decides each round whether to INVOKE more counselors, CONCLUDE (hand off to Synthesizer), or ABORT.
- **Praeses ↔ Synthesizer separation**: two independent counselor roles in `data/counselors/`. The Praeses is hybrid (deterministic skeleton in the orchestrator + adaptive LLM call). All policies (security/cost/PII/coverage/escalation) live in the Praeses' system prompt, not in YAML.
- **Default provider Anthropic Claude Sonnet** (excellent reasoning, native prompt caching).

## Out of scope (future TODOs)
- Versioning of requests / decisions
- Migration to SQL / Postgres storage
- Multi-tenant (several organisations)
- WebSocket for live streaming of contributions (currently polling)
- MCP server to expose Concilium to AI agents as a tool
- Email / Slack integrations
- UI localisation

## Key schemas (defined in `packages/shared`)

### Universal input
See `packages/shared/src/schemas/request.ts` (zod).

### Universal output
See `packages/shared/src/schemas/decision.ts` (zod).

### Counselor config
`/data/counselors/{id}.md`: frontmatter with `id`, `role`, `model`, `provider_id`, `weight` (informational, not used by the Synthesizer for averaging); body Markdown is the system prompt.

### Provider config
`/data/providers/{id}.md`: frontmatter with `id`, `kind` (anthropic | openai | claude-code | openai-codex), `api_key_ref`, `default_model`.

## Conventions
- All `.md` files under `/data/` use a YAML frontmatter + a Markdown body with sections + one or more ` ```json ` blocks for the structured payload.
- Audit is append-only: `data/audit/YYYY-MM-DD.md` with one entry per event.
- UUID naming for `request_id` and `decision_id`.

## Known risks
- LLM cost during testing: 5–7 counselors × every request. Cap: use Claude Haiku for "lightweight" counselors (Cost, UX) and Sonnet for critical ones (Security, Synthesizer).
- Prompt injection in the request `payload`: counselors must treat the payload as untrusted data. Already covered by the system prompt.
- Concurrent file writes on `/data`: extremely low risk on a single MVP instance, but use `flock` if we move to multi-instance.
