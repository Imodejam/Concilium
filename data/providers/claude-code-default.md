---
id: claude-code-default
kind: claude-code
display_name: Claude Code (CLI)
default_model: claude-sonnet-4-6
enabled: true
---
# Provider: Claude Code CLI

Drives the local `claude` binary via subprocess. Auth is delegated to
the binary's own login state (`~/.claude/`) — no `api_key_ref` is
required. The model used at runtime is the one configured inside
Claude Code itself; the `model` field on each counselor stays as a
human-readable label.
