# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Decision Journal is a local-first, encrypted Electron desktop app (macOS) for recording decisions and reviewing outcomes over time. It makes **zero network requests by default** — a network kill-switch in the main process blocks all outbound traffic on `session.defaultSession` except `file://`, `localhost`, whitelisted Whisper model downloads, and Ollama docs links. Local AI features (Ollama chat, Whisper transcription) run entirely on-device.

The one exception is **optional online AI** (`src/main/ai/`): the user can turn on OpenRouter chat, supply their own API key, and attach specific decisions to a conversation. It is off by default, off after upgrade, and off again after a restore. It does not use the default session — it has its own non-persistent session with its own strict origin gate. Never widen that gate, and never route journal content through the default session.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start electron-vite dev mode with HMR (renderer on port 5173) |
| `npm run build` | Bundle main/preload/renderer into `out/` |
| `npm run typecheck` | `tsc --noEmit` against both `tsconfig.node.json` and `tsconfig.web.json` |
| `npm test` | Vitest unit tests (`src/**/__tests__/*.test.ts`). No network, no credentials. |
| `OPENROUTER_KEY=sk-or-... npm run test:live` | **Paid**, opt-in integration test against the real OpenRouter API. Never runs in CI. ~$0.004 per run; it prints the cost. |
| `npm run dist:mac:local` | Unsigned universal DMG in `release/` for local smoke-testing |
| `npm run dist:mac` | Signed + notarized build (CI only — requires signing secrets) |

There is no linter configured. `npm run typecheck`, `npm test` and `npm run build` are the correctness gates, and `.github/workflows/ci.yml` runs all three on every PR.

Unit tests cover the pure, high-risk logic in the AI and memory layers (SSE framing, provider error classification, the URL allowlist, prompt construction, memory proposal validation). Modules that import `electron` cannot be imported from a test, which is why the pure parts live in `src/main/ai/endpoints.ts`, `src/main/ai/errors.ts` and `src/main/memory/validate.ts` rather than inside their clients. Keep it that way when adding logic worth testing.

The native SQLite module is compiled against Electron's ABI, so it cannot load under plain-node Vitest. Database behaviour (migrations, suppression, source invalidation) is therefore not covered by the unit suite and has to be checked by running the app.

`src/main/ai/__livetest__/openrouter.live.ts` is the paid integration test. It runs inside Electron against a throwaway `userData` directory and an invented fixture, so it can never touch a real journal. Run it after changing anything in the request path — it exercises the gated session, SSE parsing, ZDR routing, structured extraction and error mapping against the live API, which unit tests cannot. It is what caught the validator's search corpus drifting from the prompt.

## Architecture

Three-process Electron app built with electron-vite:

- **Main process** (`src/main/`) — window management, IPC handlers, SQLCipher database, encryption vault, Ollama/Whisper/OpenRouter clients, network kill-switch, CSP enforcement.
- **Preload** (`src/preload/index.ts`) — `contextBridge` exposing `window.api`. This is the only surface the renderer can access. Context isolation and sandbox are both enabled.
- **Renderer** (`src/renderer/`) — React 18 + TypeScript app with hash routing (`file://`-compatible), Zustand state stores, Tailwind CSS with CSS-variable tokens.
- **Shared** (`src/shared/`) — `ipc-contract.ts` defines the full `Api` interface and types used by both main and preload.

### IPC flow

All renderer-to-main communication goes through `window.api` (defined in `src/shared/ipc-contract.ts`, bridged in `src/preload/index.ts`, handled in `src/main/ipc.ts`). The renderer never imports Node or SQLite directly.

### Encryption model

Read `CONTRIBUTING.md` "How the crypto is set up" before touching `src/main/crypto/` or `src/main/db/`. Summary: a random 256-bit master key encrypts the SQLCipher DB. The master key is double-wrapped (Argon2id-derived PIN key + macOS `safeStorage`/Keychain). Touch ID adds a third wrap as an alternative unlock path.

Key files: `vault.ts` (key wrapping), `kdf.ts` (Argon2id params), `keychain.ts` (safeStorage), `db/open.ts` (SQLCipher PRAGMA key).

### AI provider layer (`src/main/ai/`)

Chat runs through one service for both providers. The renderer supplies identifiers and the user's text; the main process decides whether the request is authorized, builds the prompt, and owns persistence.

- `service.ts` — request lifecycle and conversation persistence. Every request is stamped with the consent generation and vault generation current at dispatch; both are rechecked before the request goes out and again before a reply is written, so a late reply cannot land in a locked or restored vault.
- `network.ts` / `endpoints.ts` — the non-persistent online session and its allowlist. `endpoints.ts` is pure so it can be tested.
- `openrouterClient.ts` — chat completions and catalog. Streaming uses a real SSE parser (`sse.ts`), never the Ollama NDJSON reader.
- `errors.ts` — maps status codes and in-stream provider errors to actionable codes. Provider bodies are inspected but never logged or shown verbatim.
- `context.ts` — builds the system prompt. Online requests include only explicitly attached decisions; local requests may also see a title-only index of recent ones.
- `decisionSections.ts` — **the single rendering of a decision**, shared by the prompt builder and the memory validator. If these two ever diverge, the validator rejects correct quotations as fabricated (this happened; see the live test). Never render a decision anywhere else.
- `credentials.ts` — the API key, wrapped with `safeStorage` in its own file. Never returned over IPC and never part of a backup.
- `settings.ts` — activation state and the consent generation counter.

Rules when touching this: online is off by default and stays off through upgrade and restore; nothing beyond attached decisions goes online; failing closed on privacy routing is correct — never retry with `zdr`/`data_collection` relaxed.

### Memory layer (`src/main/memory/`)

A second, separately authorized online feature. Enabling online chat does not enable extraction, because extraction sends a decision automatically after a save rather than only when the user presses send.

- `queue.ts` — the serialized job worker. A save enqueues and returns; saving must never depend on the network. Consent, decision revision and vault generation are rechecked before the request goes out and again before results are committed.
- `validate.ts` — the anti-hallucination gate. A JSON schema constrains the response shape only; this checks that the quoted excerpt actually appears in the decision, and takes the source field from where the quote really is rather than from what the model claimed. Its search corpus comes from `ai/decisionSections.ts` — the same text the model was shown. Pure, so it is unit-tested.
- `store.ts` — items, multi-source evidence, jobs, and suppression rules. Rejecting a proposal records a suppression so the same assertion is not re-proposed on the next edit.
- `prompt.ts` — the extraction instruction and its schema. Bump `PROMPT_VERSION` on any change; jobs record the version they were queued under and are cancelled rather than committed if it moved.
- `context.ts` — renders approved memories for a chat prompt, only for conversations that opted in.

Rules when touching this: proposals are never auto-approved; no item is displayed without a verified source excerpt; backfill is always an explicit user-selected batch; and per-decision exclusion is checked both at enqueue and again at dispatch.

**Extraction is zero-data-retention only, with no override.** Chat lets the user knowingly pick a model without a ZDR route, because they press send and see the disclosure each time. Extraction has no such moment — it runs by itself after every save — so a model without a ZDR provider is refused rather than offered. Do not add an escape hatch here to match chat's.

### Role models (`src/main/rolemodels/`)

A third optional online feature. The user names a public figure; the app confirms who they meant, then builds a sourced profile and extracts decision frameworks that appear in the chat frame picker beside the built-in lenses.

- `service.ts` — a bounded two-step flow, never an open loop. Identification is capped at `MAX_DISAMBIGUATION_ROUNDS`; when it runs out the app asks the user for a distinguishing detail rather than guessing again.
- `prompt.ts` — three passes: identify, profile, frameworks. They are separate because one combined pass ran out of output budget and returned only "known for". The profile instruction explicitly forbids narrating its own process — without that, the model filled `summary` with "web search needed…" and returned no claims.
- `validate.ts` — **no claim about a real person is stored without a resolvable http(s) citation.** The schema requires one; this enforces it anyway.

Rules when touching this: requests here send a public figure's name and **never** journal content, which is why they may enable web search — no journal-bearing request may. Extraction stays ZDR-only. Citation links open only via `rolemodels:open-source`, which refuses any URL not already stored as a source, so a model-generated link cannot be opened just because it was rendered. Avatars are initials, never downloaded images — remote images would mean opening the network gate.

### State management

Separate Zustand stores per concern in `src/renderer/store/`: `auth`, `theme`, `decisions`, `chat`, `memory`, `roleModels`, `transcription`, `commandPalette`.

### Path aliases

- `@shared` — resolves to `src/shared/` (available in main, preload, and renderer)
- `@` — resolves to `src/renderer/` (renderer only)

## Coding conventions

- **No network dependencies.** Never add a dependency that makes network calls. If it phones home, it doesn't ship.
- **Tailwind classes inline on JSX** — no CSS modules. Colors and spacing come from CSS variables in `src/renderer/styles/globals.css`; add tokens there rather than hardcoding hex values.
- **All renderer-to-main communication through `window.api`** — add new IPC methods to the contract in `src/shared/ipc-contract.ts`, implement in `src/main/ipc.ts`, bridge in `src/preload/index.ts`.
- **Releases are CI-only** — signing secrets live in GitHub Actions secrets, never in local `.env` files. Tag push (`v*`) triggers the release workflow.

## How releases work

Releases are automated via [release-please](https://github.com/googleapis/release-please). **Do not manually bump `version` in `package.json` or push tags** — release-please handles both.

1. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.) on every commit to main.
2. release-please maintains an open PR that accumulates version bumps and changelog entries.
3. When you merge that PR, release-please creates a Git tag and GitHub Release, which triggers the build.

### Release infrastructure

- **`.github/workflows/release-please.yml`** — runs on every push to main. The `release-please` job manages the version PR; the `build-mac` job only runs when a release is actually created (tag pushed). This is the **primary** release workflow.
- **`.github/workflows/release.yml`** — legacy workflow that triggers on `v*` tags or manual `workflow_dispatch`. Kept as a fallback for manual re-releases.
- Both workflows build a universal (arm64 + x86_64) signed and notarized DMG + ZIP.
- Requires 5 secrets in GitHub Actions: `MACOS_CERTIFICATE`, `MACOS_CERTIFICATE_PWD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- Output artifacts: DMG, DMG blockmap, ZIP, ZIP blockmap, and `latest-mac.yml` (used by auto-updater) on the GitHub Releases page.
- **Important:** electron-builder must run with `--publish never` in CI. Publishing is handled separately by `gh release upload`. The `publish` config in `electron-builder.yml` exists only so `electron-updater` knows where to check for updates at runtime.

### Auto-update

The app uses `electron-updater` to check for updates from GitHub Releases. The `publish` block in `electron-builder.yml` configures the update feed URL. The `latest-mac.yml` file uploaded to each release is what the updater reads to detect new versions.

## Data on disk

All user data lives in `~/Library/Application Support/Decision Journal/`:
- `decisions.db` — encrypted SQLCipher database
- `vault.json` — wrapped encryption keys, failed attempt counters, cooldown state
- `whisper/` — downloaded Whisper model files
- `online-ai.json` — online-AI activation state and consent generation (no secrets)
- `online-credentials.json` — the OpenRouter API key, wrapped by macOS `safeStorage`
- `online-catalog.json` — cached model catalog (no journal content)

Only `decisions.db` and `vault.json` are copied by `vault:export`. The credential file is deliberately excluded so a backup never carries the API key.
