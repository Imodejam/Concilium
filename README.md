# 🏛️ Concilium

> Multi-LLM deliberation platform — a council of AIs decides, a Synthesizer speaks once.

Concilium lets humans (and other AI agents) submit decisional requests to a configurable council of LLMs with distinct roles (Architect, Security, Product, Cost, UX, Critic, …). Each counselor issues a structured opinion in parallel; a final **Synthesizer** ("Praeses Concilii") produces **one** decision with motivation, confidence, risk level, conditions and suggested actions.

It is **not** a multi-agent chat. It is a deterministic decision-making layer with a uniform, machine-readable output suitable for both humans and downstream automation.

```
Input → Praeses (orchestrator) ⇄ Counselors (parallel, multi-round) → Synthesizer → Decision
```

**Two distinct roles, separated on purpose:**
- **Praeses Concilii** — the orchestrator. Each round it decides which counselors to invoke, applies policies (security, cost, PII coverage, escalation, termination), and at the end produces a conflict report summarising convergence and divergence. It does **not** decide.
- **Synthesizer** ("Princeps") — the decider. Reads the contributions plus the Praeses conflict report and produces the single final decision. It does **not** orchestrate.

Why split: separating *governance of the discussion* from the *act of deciding* lets you swap either independently, run multi-round deliberations with adaptive escalation, and inject policies without touching the decision logic.

## Features

- ✅ Universal request / decision schema (zod-validated, stable contract).
- ✅ Pluggable LLM providers (Anthropic shipped; OpenAI scaffold). API keys stay in env vars — never in storage.
- ✅ Markdown-as-database for the MVP: every request, decision, contribution and counselor config is a `.md` file with YAML frontmatter + JSON payload. Easy to inspect, version, fork.
- ✅ Three surfaces out of the box: REST API, web dashboard, Telegram bot.
- ✅ Docker-compose ready.
- ✅ No chain-of-thought stored.

## Quickstart (development)

```bash
# 1. clone & enter
git clone https://github.com/Imodejam/Concilium.git
cd Concilium

# 2. configure
cp .env.example .env       # at minimum: ANTHROPIC_API_KEY=...
# optional: TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USERS, API_TOKEN

# 3. install + boot
npm install
npm run build:shared
npm run dev                # api :7001 · web :7002 · bot (long-poll)
```

Open <http://localhost:7002> (or behind your reverse proxy of choice).

### With Docker

```bash
docker-compose up --build
```

## Repository layout

```
apps/
  api/        Fastify backend  (orchestrator + storage + REST)
  web/        React + Vite frontend
  bot/        Telegram bot (telegraf)
packages/
  shared/     zod schemas, types, enums shared across apps
data/         filesystem "database"
  requests/   one .md per request
  decisions/  one .md per final decision
  counselors/   one .md per counselor (frontmatter = config, body = system prompt)
  providers/  one .md per LLM provider
  contributions/   one .md per (request, counselor) contribution
  audit/      append-only log, one file per day
docker/       Dockerfiles for api / web / bot
```

## Universal request schema

```jsonc
{
  "request_id": "uuid",                  // optional, server-assigned
  "source":     "telegram | api | mcp",
  "actor":      { "type": "human | agent", "id": "string" },
  "domain":     "string",
  "intent":     "validate | decide | review | compare | approve | diagnose",
  "title":      "string",
  "context":    "string",
  "payload":    { ... },                 // free-form, treated as untrusted
  "constraints":[ "string", ... ],
  "expected_output": {
    "decision_required": true,
    "allowed_decisions": ["APPROVED","REJECTED","APPROVED_WITH_CONDITIONS","NEEDS_MORE_INFO"]
  }
}
```

## Universal decision schema

```jsonc
{
  "request_id": "uuid",
  "decision_id": "uuid",
  "status": "COMPLETED | FAILED | NEEDS_MORE_INFO",
  "decision": "APPROVED | REJECTED | APPROVED_WITH_CONDITIONS | NEEDS_MORE_INFO",
  "motivation": "string",
  "confidence": 0.0,
  "risk_level": "LOW | MEDIUM | HIGH",
  "requires_human_confirmation": false,
  "conditions": [ "string", ... ],
  "suggested_actions": [ "string", ... ],
  "data": { },
  "audit": { "models_used": ["..."], "created_at": "ISO-8601", "duration_ms": 0 }
}
```

## Designing your own counselors

Each counselor is a Markdown file under `data/counselors/<id>.md`:

```markdown
---
id: security
role: security
display_name: Security
provider_id: anthropic-default
model: claude-sonnet-4-6
weight: 1.0
enabled: true
---

You are a Security Counselor. Analyse the request looking for...
```

The frontmatter is the wiring; the body is the system prompt. Drop the file, restart the API, and the counselor is part of the next deliberation.

## Synthesizer rules (non-negotiable)

- Always returns exactly one decision (no ties).
- Does **not** average per-counselor votes; it weighs trade-offs.
- Honours request constraints and `allowed_decisions`.
- May choose `NEEDS_MORE_INFO` only when the request is genuinely under-specified.
- Sets `requires_human_confirmation = true` when irreversibility or HIGH risk is involved.

## Praeses rules (non-negotiable)

- Picks the smallest fitting subset of counselors per round; doesn't invoke everyone "just in case".
- Applies security / PII / cost / coverage / escalation policies expressed in natural language in its system prompt.
- May `ABORT` before reaching the Synthesizer if a hard policy is violated (e.g. an unmitigable HIGH-risk security flag, a payload that looks like an injection attempt).
- Hard cap of 3 rounds (configurable via `MAX_ROUNDS`).
- Never invents counselor ids; can only pick from configured ones.

## Roadmap

See [`PLAN.md`](./PLAN.md) for the implementation status and short-term roadmap. Notable next-steps:

- MCP server interface (let other AI agents invoke the council as a tool).
- WebSocket streaming of counselor contributions for live UIs.
- Postgres adapter to graduate from the Markdown filesystem.
- More provider adapters (OpenAI, Gemini, local Ollama).
- Versioning & supersession of decisions (re-deliberation on changed payload).

## License

[MIT](./LICENSE) — open source for the AI community.
