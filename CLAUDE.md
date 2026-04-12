# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Decision Journal is an offline-only, encrypted Electron desktop app (macOS) for recording decisions and reviewing outcomes over time. It makes **zero network requests** by design — a network kill-switch in the main process blocks all outbound traffic except `file://`, `localhost`, whitelisted Whisper model downloads, and Ollama docs links. Local AI features (Ollama chat, Whisper transcription) run entirely on-device.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start electron-vite dev mode with HMR (renderer on port 5173) |
| `npm run build` | Bundle main/preload/renderer into `out/` |
| `npm run typecheck` | `tsc --noEmit` against both `tsconfig.node.json` and `tsconfig.web.json` |
| `npm run dist:mac:local` | Unsigned universal DMG in `release/` for local smoke-testing |
| `npm run dist:mac` | Signed + notarized build (CI only — requires signing secrets) |

There is no test suite or linter configured. Type checking (`npm run typecheck`) is the primary code-correctness gate.

## Architecture

Three-process Electron app built with electron-vite:

- **Main process** (`src/main/`) — window management, IPC handlers, SQLCipher database, encryption vault, Ollama/Whisper clients, network kill-switch, CSP enforcement.
- **Preload** (`src/preload/index.ts`) — `contextBridge` exposing `window.api`. This is the only surface the renderer can access. Context isolation and sandbox are both enabled.
- **Renderer** (`src/renderer/`) — React 18 + TypeScript app with hash routing (`file://`-compatible), Zustand state stores, Tailwind CSS with CSS-variable tokens.
- **Shared** (`src/shared/`) — `ipc-contract.ts` defines the full `Api` interface and types used by both main and preload.

### IPC flow

All renderer-to-main communication goes through `window.api` (defined in `src/shared/ipc-contract.ts`, bridged in `src/preload/index.ts`, handled in `src/main/ipc.ts`). The renderer never imports Node or SQLite directly.

### Encryption model

Read `CONTRIBUTING.md` "How the crypto is set up" before touching `src/main/crypto/` or `src/main/db/`. Summary: a random 256-bit master key encrypts the SQLCipher DB. The master key is double-wrapped (Argon2id-derived PIN key + macOS `safeStorage`/Keychain). Touch ID adds a third wrap as an alternative unlock path.

Key files: `vault.ts` (key wrapping), `kdf.ts` (Argon2id params), `keychain.ts` (safeStorage), `db/open.ts` (SQLCipher PRAGMA key).

### State management

Separate Zustand stores per concern in `src/renderer/store/`: `auth`, `theme`, `decisions`, `chat`, `transcription`, `commandPalette`.

### Path aliases

- `@shared` — resolves to `src/shared/` (available in main, preload, and renderer)
- `@` — resolves to `src/renderer/` (renderer only)

## Coding conventions

- **No network dependencies.** Never add a dependency that makes network calls. If it phones home, it doesn't ship.
- **Tailwind classes inline on JSX** — no CSS modules. Colors and spacing come from CSS variables in `src/renderer/styles/globals.css`; add tokens there rather than hardcoding hex values.
- **All renderer-to-main communication through `window.api`** — add new IPC methods to the contract in `src/shared/ipc-contract.ts`, implement in `src/main/ipc.ts`, bridge in `src/preload/index.ts`.
- **Releases are CI-only** — signing secrets live in GitHub Actions secrets, never in local `.env` files. Tag push (`v*`) triggers the release workflow.

## How to create a release

1. Update `version` in `package.json` (follow semver: patch for fixes, minor for features, major for breaking changes)
2. Commit the version bump: `git commit -am "chore: bump version to X.Y.Z"`
3. Push to main: `git push origin main`
4. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`
5. Monitor the release workflow in GitHub Actions
6. Once complete, edit the release on GitHub to add release notes describing what changed

### Release infrastructure

- GitHub Actions workflow at `.github/workflows/release.yml` triggers on `v*` tags
- Builds a universal (arm64 + x86_64) signed and notarized DMG
- Requires 5 secrets in GitHub Actions: `MACOS_CERTIFICATE`, `MACOS_CERTIFICATE_PWD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- Output artifacts land on the GitHub Releases page as downloadable DMGs

## Data on disk

All user data lives in `~/Library/Application Support/Decision Journal/`:
- `decisions.db` — encrypted SQLCipher database
- `vault.json` — wrapped encryption keys, failed attempt counters, cooldown state
- `whisper/` — downloaded Whisper model files
