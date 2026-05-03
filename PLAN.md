# Senatum — Implementation Plan (MVP)

_Owner: claudebot — last updated 2026-05-03_

## Vision (one-liner)
Piattaforma di deliberazione multi-LLM. Una richiesta decisionale viene inviata a più "senatori" (LLM con ruolo) in parallelo; un **Synthesizer** (Princeps Senatus) produce sempre una decisione finale unica con motivazione, confidenza, livello di rischio.

## Source of truth della spec
[`/home/progetti/obsidian-vault/raw/docs/senatum-mvp-spec_2026-05-03.md`](../obsidian-vault/raw/docs/senatum-mvp-spec_2026-05-03.md) — immutabile.

## Stack scelto
| Layer | Tech | Note |
|---|---|---|
| Backend | Node 20 + TypeScript + Fastify | leggero, OpenAPI nativo, validazione zod-ts |
| Frontend | React 18 + TypeScript + Vite + TailwindCSS | coerente con Piratopoly |
| Bot | telegraf 4 | pattern noto, allowlist via env |
| LLM | `@anthropic-ai/sdk` (Claude Sonnet) | default; skeleton OpenAI per fallback |
| Validation | zod (sia API che storage) | schemi unici in `packages/shared` |
| Storage MVP | filesystem `.md` (frontmatter YAML + JSON), `gray-matter` | `/data/{requests,decisions,senators,providers,contributions,audit}` |
| Container | docker-compose | api+web+bot, volume `/data` condiviso |
| Reverse proxy | Nginx | endpoint pubblico `<redacted-host>` |
| Dev runner | systemd `senatum.service` | analogo a `piratopoly.service` |

## Layout repo
```
senatum/
├── apps/
│   ├── api/          # Fastify backend
│   ├── web/          # React + Vite frontend
│   └── bot/          # Telegram bot (telegraf)
├── packages/
│   └── shared/       # tipi + zod schemi + costanti
├── data/             # storage Markdown (volume in Docker)
├── docker/           # Dockerfile per api/web/bot
├── docker-compose.yml
├── package.json      # workspaces
└── PLAN.md
```

## Porte dev
- API: `7001` (HTTP, JSON)
- Web (Vite): `7002`
- Bot: nessuna porta HTTP (long-poll Telegram)
- Nginx: 443 → 7002 (web), `/api` → 7001

## Roadmap (sequenza)

### Fase 1 — Foundations
- [ ] **Init monorepo** + npm workspaces + tsconfig base + `.gitignore`
- [ ] **Nginx** `<redacted-host>` + certbot Let's Encrypt
- [ ] `packages/shared`: schemi zod per Input/Output/Senator/Provider + costanti enum
- [ ] `apps/api`: skeleton Fastify, CORS, health endpoint

### Fase 2 — Core domain
- [ ] **Storage filesystem** in `apps/api/src/storage/`: read/write `.md` con `gray-matter`
- [ ] **LLM provider** abstraction `apps/api/src/llm/` con Anthropic adapter (retry+timeout, no CoT)
- [ ] **Orchestrator** `apps/api/src/orchestrator/`: senatori in parallelo → contributi → Synthesizer → decisione → audit
- [ ] **Senatori default** in `data/senators/` (Architect, Security, Product, Cost, UX, Critic, Synthesizer)
- [ ] **Endpoints API**: `POST /requests`, `GET /requests`, `GET /requests/:id`, `GET /decisions`, `GET /decisions/:id`, `GET/POST /senators`, `GET/POST /providers`

### Fase 3 — Surfaces
- [ ] `apps/web`: layout shell + 4 pagine (`/decisions`, `/decisions/:id`, `/requests/new`, `/configuration`)
- [ ] `apps/bot`: comandi `/new`, `/status`, `/decision`, `/debug` con allowlist

### Fase 4 — Operations
- [ ] `docker-compose.yml` con build multi-stage per api/web/bot
- [ ] `senatum.service` systemd per dev locale
- [ ] Smoke test: curl health, end-to-end POST /requests → decisione, accesso da `https://<redacted-host>/`

## Decisioni di scope (MVP) — non negoziabili
- **No DB**: solo file Markdown finché Stefano non chiederà la migrazione.
- **No auth utenti**: API protetta con bearer token statico (env `API_TOKEN`); bot Telegram limitato ad allowlist user_id.
- **No code-runner**: i senatori producono **solo** JSON strutturato.
- **No CoT salvato**: dopo `JSON.parse` del response, scartare il testo grezzo.
- **Senatori in parallelo** (non sequenziale): più veloce, costo accettabile a 5-7 senatori.
- **Provider default Anthropic Claude Sonnet** (eccellente reasoning, prompt caching nativo).

## Fuori scope MVP (TODO futuri)
- Versioning richieste / decisioni
- Migrazione storage SQL/Postgres
- Multi-tenant (più organizzazioni)
- WebSocket per stream contributi in tempo reale (per ora polling)
- MCP server per esporre Senatum agli agenti AI come tool
- Integrazione email/Slack
- UI in lingue diverse da italiano

## Schemi chiave (definiti in `packages/shared`)

### Input universale
Vedi `packages/shared/src/schemas/request.ts` (zod).

### Output universale
Vedi `packages/shared/src/schemas/decision.ts` (zod).

### Senator config
`/data/senators/{id}.md`: frontmatter con `id`, `role`, `model`, `provider`, `api_key_ref`, `weight` (informativo, non usato dal Synthesizer per la media); body Markdown con system prompt.

### Provider config
`/data/providers/{id}.md`: frontmatter con `id`, `kind` (anthropic|openai), `api_key_ref`, `default_model`.

## Convenzioni
- Tutti i file `.md` in `/data/` hanno frontmatter YAML + body con sezioni Markdown + uno o più blocchi ` ```json ` per il payload strutturato.
- Audit append-only: `data/audit/YYYY-MM-DD.md` con una entry per evento.
- Naming UUID per `request_id` e `decision_id`.

## Rischi noti
- Costo LLM in fase di test: 5-7 senatori × ogni richiesta. Cap: usare Claude Haiku per i senatori "leggeri" (Cost, UX) e Sonnet per critici (Security, Synthesizer).
- Prompt injection nel `payload` della richiesta: i senatori devono trattare il payload come dato non fidato. Già coperto dal prompt di sistema.
- File concorrenti su `/data`: bassissimo rischio in MVP single-instance, ma usare `flock` se passiamo a multi-istanza.
