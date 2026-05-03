<p align="center">
  <img src="docs/logo-wordmark.png" alt="Concilium" width="420" />
</p>

<p align="center">
  <b>An open-source council of LLMs that produces a single, verifiable decision out of many opinions.</b>
</p>

<p align="center">
  <a href="https://<redacted-host>">Live demo</a> ·
  <a href="#quickstart">Quickstart</a> ·
  <a href="#use-cases">Use cases</a> ·
  <a href="#telegram-integration">Telegram bot</a> ·
  <a href="#how-the-deliberation-works">How it works</a>
</p>

---

## What Concilium is for

When you ask one LLM a hard question — "is this news true?", "should we adopt Postgres?", "is this contract risky?" — you get one answer, with one model's bias. Asking three different models on your own and trying to reconcile them by hand is slow and not auditable.

Concilium turns that workflow into infrastructure.

You submit a request. A configurable **council of LLMs** — Claude Opus, GPT-4o, Gemini, local CLIs, anything you wire in — deliberates in parallel. A **Praeses Concilii** orchestrates the discussion across rounds, and a separate **Princeps** synthesises the contributions into one structured decision with motivation, confidence and risk level.

The output is the same JSON shape no matter what you asked or which models were heard. You can plug it into any downstream pipeline: a backend, a workflow, another agent, a human approval queue.

> The point of running several models is **not** consensus. It is **independent failure modes**: when models trained on different corpora and reward functions all converge, the answer is meaningfully more reliable than any of them alone — and when they diverge, that disagreement is information you would otherwise never have seen.

## Use cases

- 📰 **Fact-checking** — submit a claim, get a verdict (APPROVED / REJECTED / NEEDS_MORE_INFO) backed by every model in the council. Try it on news, on social posts, on AI-generated text.
- 💼 **Business / product judgment** — "should we adopt X?", "is this market viable?", with a structured trade-off analysis instead of a single opinion.
- ⚖️ **Contract & policy review** — pass a clause, get an APPROVED_WITH_CONDITIONS reply with the conditions made explicit and machine-readable.
- 🏗️ **Architecture & code-review decisions** — invoke domain counselors (Architect, Security, Cost) and a multi-provider Critic to stress-test the proposal.
- 🤖 **Agent governance layer** — let an autonomous agent submit risky actions to Concilium first; the council returns the same JSON envelope and the agent acts on it (or escalates to a human when `requires_human_confirmation = true`).

## Key features

- 🏛️ **Multi-LLM council** — Anthropic Claude (HTTP), OpenAI (HTTP), Claude Code CLI subscription, OpenAI Codex CLI subscription. Adding a provider is a config file plus a thin adapter.
- 🧭 **Praeses ↔ Princeps separation** — the orchestrator (who decides _how_ the council deliberates) is independent from the synthesiser (who decides _what_ the council concludes). You can swap either without touching the other.
- 🔁 **Multi-round deliberation** — the Praeses can decide to invoke more counselors, escalate to a Critic when the first round disagrees, ABORT before reaching the synthesiser if a hard policy is violated, or CONCLUDE early when contributions converge.
- 📜 **Universal request / decision schema** — zod-validated, stable contract. Same JSON envelope for fact-check, code review, contract analysis or anything else.
- 💾 **Markdown-as-database** — every request, decision, contribution, counselor config and provider config is a `.md` file with YAML frontmatter + JSON payload. Inspect with `cat`, version with git, fork by copying a file.
- 🌐 **Three surfaces out of the box** — REST API, web dashboard with a live deliberation view, Telegram bot.
- 🧾 **Append-only audit log** — one JSON event per round per counselor, queryable per request.
- 🚫 **No chain-of-thought stored** — only the structured outputs, by design (privacy + cost).
- 🐳 Docker-compose ready.
- 📜 MIT license.

## Telegram integration

Concilium ships with a Telegram bot ([`apps/bot`](./apps/bot)) so you can convene the council straight from your phone.

```
/start             welcome and command list
/new <title>       submit a new decision request
/status            list your last 5 requests with their state
/decision <id>     show the final decision (motivation · confidence · risk · conditions)
/debug   <id>     per-counselor contributions
```

The bot uses Telegram's native menu API, so the blue "menu" button next to the input area lists every command with its description. Access is gated by a per-user allowlist via the `TELEGRAM_ALLOWED_USERS` env var.

A typical flow:
1. You send `/new Verify the claim that <X>`.
2. The bot replies with the `request_id` and the council starts deliberating in the background.
3. You poll with `/status` or wait — when the decision lands, `/decision <id>` returns the formatted verdict, `/debug <id>` shows what each counselor said.

You can also follow the same deliberation in real time on the web dashboard at `/requests/<id>/live`: the page polls the API every 2.5 s and shows each counselor moving from `thinking…` to `responded` as the contributions arrive.

## Quickstart

```bash
# 1. clone & enter
git clone https://github.com/Imodejam/Concilium.git
cd Concilium

# 2. configure
cp .env.example .env
#   set at least:
#     ANTHROPIC_API_KEY=...
#     OPENAI_API_KEY=...                # optional but recommended for diversity
#     TELEGRAM_BOT_TOKEN=...            # optional
#     TELEGRAM_ALLOWED_USERS=<your_id>  # optional
#     API_TOKEN=...                     # optional bearer for write API endpoints

# 3. install + boot
npm install
npm run build:shared
npm run dev   # api :7001 · web :7002 · bot (long-poll)
```

Open <http://localhost:7002> (or behind your reverse proxy of choice).

### With Docker

```bash
docker-compose up --build
```

## How the deliberation works

```
                         ┌──────────────────────┐
   request →             │  Praeses Concilii    │
                         │  (LLM orchestrator)  │
                         └──────────┬───────────┘
                                    │ INVOKE / CONCLUDE / ABORT
        ┌───────────────┬───────────┴─────────────┬───────────────┐
        ▼               ▼                         ▼               ▼
   ┌────────┐      ┌────────┐                ┌────────┐      ┌────────┐
   │Critic  │      │Critic  │                │Security│  ...  │ Cost  │
   │(Claude)│      │(GPT-4o)│                │(Claude)│      │(Haiku) │
   └────┬───┘      └────┬───┘                └────┬───┘      └────┬───┘
        └───────────────┴──── contributions ──────┴───────────────┘
                                    │ + Praeses conflict_report
                                    ▼
                         ┌──────────────────────┐
                         │      Princeps        │
                         │   (LLM synthesiser)  │
                         └──────────┬───────────┘
                                    ▼
                         decision · motivation · confidence
                         risk_level · conditions · suggested_actions
```

- **Praeses Concilii** — round by round, picks _which_ counselors to invoke, applies policies (security / PII / coverage / multi-provider diversity / escalation / termination), writes a final conflict report. Does **not** decide. Hard cap of 3 rounds (`MAX_ROUNDS`).
- **Counselors** — LLMs with a role. Each emits a structured `CounselorOutput` (recommendation + confidence + risk + summary + risks + conditions). Run in parallel within a round.
- **Princeps** (Synthesiser) — reads the contributions plus the Praeses conflict report and produces ONE final `DecisionOutput`. Never averages votes; weighs trade-offs.

Policies live in natural language inside the Praeses' system prompt — there is no YAML rule engine. Mandatory ones include "in round 1 invoke ALL counselors whose role is relevant" and "when several counselors share a role across providers (e.g. Critic on Anthropic AND on OpenAI), invoke ALL of them" — the council's reason to exist is the diversity of model families, not cost minimisation.

## Universal request schema

```jsonc
{
  "request_id": "uuid",                   // optional, server-assigned
  "source":     "telegram | api | mcp",
  "actor":      { "type": "human | agent", "id": "string" },
  "domain":     "string",
  "intent":     "validate | decide | review | compare | approve | diagnose",
  "title":      "string",
  "context":    "string",
  "payload":    { ... },                  // free-form, treated as untrusted
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

## Repository layout

```
apps/
  api/        Fastify backend (orchestrator + storage + REST)
  web/        React + Vite frontend (dashboard + live view)
  bot/        Telegram bot (telegraf)
packages/
  shared/     zod schemas, types, enums shared across apps
data/
  requests/        one .md per request
  decisions/       one .md per final decision
  counselors/      one .md per counselor (frontmatter = config, body = system prompt)
  providers/       one .md per LLM provider
  contributions/   one .md per (request, counselor) contribution
  audit/           append-only log, one file per day
docker/            Dockerfiles for api / web / bot
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

You are a Security Counselor. Analyse the request looking for…
```

The frontmatter is the wiring (which provider, which model, which role); the body is the system prompt. Drop the file, restart the API, and the counselor is part of the next deliberation.

## Synthesiser rules (non-negotiable)

- Always returns exactly one decision (no ties).
- Does **not** average per-counselor votes; it weighs trade-offs.
- Honours request constraints and `allowed_decisions`.
- May choose `NEEDS_MORE_INFO` only when the request is genuinely under-specified.
- Sets `requires_human_confirmation = true` when irreversibility or HIGH risk is involved.

## Praeses rules (non-negotiable)

- Round 1: invokes ALL counselors whose role is relevant — never a minimal subset.
- Multi-provider diversity is mandatory: when several counselors share a role across providers, all of them are invoked.
- May `ABORT` before reaching the Synthesiser if a hard policy is violated (HIGH-risk security flag, payload that looks like an injection attempt).
- Hard cap of 3 rounds, configurable via `MAX_ROUNDS`.
- Cannot invent counselor ids; can only pick from configured ones.

## Roadmap

See [`PLAN.md`](./PLAN.md) for the implementation status. Notable next-steps:

- MCP server interface (let other AI agents invoke the council as a tool).
- Server-Sent Events for live streaming of contributions (currently 2.5 s polling on the live page).
- Postgres / SQLite adapter to graduate from the Markdown filesystem.
- More provider adapters (Gemini, local Ollama).
- Versioning & supersession of decisions (re-deliberation on changed payload).

## License

[MIT](./LICENSE) — open source for the AI community.
