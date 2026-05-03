---
id: anthropic-default
kind: anthropic
display_name: Anthropic (Claude)
api_key_ref: ANTHROPIC_API_KEY
default_model: claude-sonnet-4-6
enabled: true
---

# Provider: Anthropic (Claude)

Provider di default per Senatum. Le chiavi NON sono in chiaro qui; il backend
risolve `api_key_ref` leggendo la variabile d'ambiente `ANTHROPIC_API_KEY`.
