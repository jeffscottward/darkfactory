# Gemini CLI bootstrap

This file is the Gemini-specific entry point for DarkFactory. It explains how to load the repository and produce trustworthy evidence; it is not a second policy document.

## Authority and context

At the start of a task, read `AGENTS.md`, then `ARCHITECTURE.md`, then `CONVENTIONS.md`. `AGENTS.md` owns mandatory execution policy, `ARCHITECTURE.md` owns system boundaries and decisions, and `CONVENTIONS.md` owns implementation rules. This adapter may add only Gemini bootstrap and evidence mechanics. If a nested `GEMINI.md` is discovered, treat it as local context for that subtree; it cannot weaken or replace the root canonical documents. Explicit higher-priority task instructions still apply.

Keep Gemini's working context focused. Locate the relevant contract, feature boundary, tests, and public surface before opening implementation files. Prefer the repository entry points and existing patterns over broad reconstruction or a new parallel convention. Never load `.env` values, credentials, tokens, private keys, production payloads, or other secrets into prompts or evidence.

## Reproducible bootstrap

Run from the repository root. `make setup` installs the lockfile-resolved dependencies with the pnpm version pinned by the repository. It does not start services, seed or reset a database, generate credentials, or modify application state. A compatible ready-to-use environment is also described by `.devcontainer/devcontainer.json`: Node 22 on Bookworm, Python 3.12, and Docker access through the host daemon.

Use `make lint`, `make test`, and `make verify` as portable command adapters. They delegate to the canonical root pnpm scripts rather than defining competing workflows. While iterating, run the narrowest existing package or test command that observes the changed contract; run a wider Make target only when the task's lifecycle requirements call for it. Do not bypass, weaken, or reinterpret a failing gate.

## Gemini evidence discipline

Before editing, state the observable outcome and identify the command, test, parse, or browser flow that can prove it. After editing, execute that proof at the current working revision. Record the exact command, its exit status, and the relevant observed result. Distinguish direct observation from inference, and never call skipped, cancelled, timed-out, blocked, stale, or unrun work green. Configuration presence, generated files, badges, and earlier agent summaries are not substitutes for a current run.

For documentation or configuration changes, validate the actual consumer format and discovery path instead of inventing artificial application tests. For behavior changes, use an existing test that covers the contract and add a test only when the new observable behavior is otherwise undefended. For UI changes, exercise the rendered route and relevant viewport or accessibility state. If verification is blocked by an external dependency, report the exact blocker, the checks that did run, and the concrete rerun condition without fabricating completion.

End with a concise change summary, the observed verification evidence, and any remaining risk. Do not claim repository-wide health from a narrow check; name its scope precisely.
