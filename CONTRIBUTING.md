# Contributing to Decision Journal

Thanks for your interest. This document is for developers working on the app itself — if you just want to use Decision Journal, the [README](README.md) is what you want.

## Stack

- **Electron 33** + [electron-vite](https://electron-vite.org/) (main / preload / renderer split with fast HMR)
- **React 18 + TypeScript** in the renderer
- **Tailwind CSS** with CSS-variable tokens driving light + dark themes
- **Zustand** for small amounts of app state (auth lock status, theme)
- **react-router** (hash router, since we load over `file://` in production)
- **better-sqlite3-multiple-ciphers** — SQLCipher-compatible, synchronous, ships with prebuilt binaries
- **@node-rs/argon2** — Argon2id KDF, pure Rust, prebuilt for darwin-x64 and darwin-arm64
- **Fraunces + Inter** fonts, bundled locally via `@fontsource*` packages (nothing loaded from the network)

## Running locally

```bash
git clone https://github.com/sinameraji/decision-journal-electron.git
cd decision-journal-electron
npm install
npm run dev
```

First launch walks you through creating a 6-digit PIN. Two sample decisions are seeded into the encrypted DB on first unlock so the UI isn't empty.

## Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start electron-vite in dev mode with HMR |
| `npm run build` | Bundle main / preload / renderer into `out/` |
| `npm run typecheck` | Run `tsc --noEmit` against both `tsconfig.node.json` and `tsconfig.web.json` |
| `npm test` | Run the unit tests. No network, no credentials — this is what CI runs |
| `OPENROUTER_KEY=sk-or-... npm run test:live` | **Costs money.** Integration test against the real OpenRouter API using *your own* key (~$0.004/run, printed at the end). Opt-in, never in CI. Run it if you touch anything in the online request path |
| `npm run dist:mac:local` | Build an **unsigned** universal DMG in `release/` — handy for smoke-testing packaged builds, but macOS Gatekeeper will flag it |
| `npm run dist:mac` | Signed + notarized build. Only runs in CI — requires signing credentials |

## Directory layout

```
src/
  main/           Electron main process
    crypto/       Argon2id KDF, master-key vault, Keychain helpers
    db/           SQLCipher open + schema + seed
    index.ts      Window creation, network kill-switch, CSP
    ipc.ts        Typed IPC handlers
    theme.ts      nativeTheme bridge
  preload/        contextBridge — the only surface the renderer sees
  shared/         IPC contract shared by main + renderer
  renderer/       React app (Vite)
    components/   Sidebar, TopBar, ThemeToggle, DecisionCard, PinPad, AppShell
    routes/       Unlock, Decisions, Settings, and stubs for the rest
    store/        Zustand stores (auth, theme)
    styles/       globals.css (tokens + tailwind), fonts.css
build/
  entitlements.mac.plist       Hardened runtime entitlements
.github/workflows/release.yml  Tag-triggered signed + notarized DMG
electron-builder.yml           Universal DMG, hardened runtime, notarize
electron.vite.config.ts        Build config
```

## How the crypto is set up

If you're touching anything in `src/main/crypto/` or `src/main/db/`, read this first.

- A random 256-bit **master key** is generated on first launch. This is the key that actually encrypts the SQLCipher database via `PRAGMA key`.
- The master key is **wrapped twice**:
  1. AES-256-GCM under a key derived from the user's 6-digit PIN via Argon2id (64 MiB memory, 4 iterations, 2 lanes, 32-byte output, fresh random salt).
  2. The result is then encrypted again by Electron's `safeStorage`, which on macOS stores the wrapping key in the login keychain.
- This double-wrap is what makes the 6-digit PIN safe despite its tiny keyspace: an attacker with just the DB file can't brute-force the PIN without also having access to the user's login keychain.
- Failed unlock attempts incur an exponential cooldown (30s → 60s → 120s → ... → 10min cap) persisted in `vault.json`.
- Touch ID is an **alternative** unlock path, not a replacement. When enabled, the master key is wrapped a third time via `safeStorage` and stored alongside, and `systemPreferences.promptTouchID` gates access at unlock time. The PIN remains the source of truth.

## Verifying the offline guarantee yourself

With `npm run dev` running:

1. Open DevTools in the Electron window.
2. Run:
   ```js
   await fetch('https://example.com')
   ```
3. The request should fail and the main-process console should print `[network-kill-switch] blocked https://example.com/`.

## Verifying the DB is actually encrypted

1. Quit the app cleanly.
2. Copy `~/Library/Application Support/Decision Journal/decisions.db` somewhere.
3. `sqlite3 decisions.db "SELECT * FROM decisions;"` → expect `Error: file is not a database`.

## Releasing

Releases are cut by CI, never from a laptop. Secrets live in GitHub repository secrets (Settings → Secrets and variables → Actions) and are only exposed to the release workflow. **Do not put any of these in a local `.env` file — this repo is public and `.env*` is gitignored specifically to avoid accidents.**

### Required GitHub secrets

| Secret | What it is |
|---|---|
| `MACOS_CERTIFICATE` | Base64-encoded Developer ID Application `.p12`. Export from Keychain Access, then `base64 -i cert.p12 \| pbcopy` |
| `MACOS_CERTIFICATE_PWD` | Password you set when exporting the `.p12` |
| `APPLE_ID` | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | Generated at [appleid.apple.com → App-Specific Passwords](https://appleid.apple.com) |
| `APPLE_TEAM_ID` | 10-character Apple Developer team ID |

### Cutting a release

Releases are automated by [release-please](https://github.com/googleapis/release-please). **Do not bump `version` in `package.json` by hand, and do not push a `v*` tag** — that is the old path and it is no longer how releases happen.

1. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`) on everything that lands on `main`.
2. release-please keeps an open release PR that accumulates the version bump and changelog entries.
3. Merging that PR is what cuts the release: release-please creates the tag and GitHub Release, which triggers the macOS build job.

`.github/workflows/release-please.yml` is the primary workflow. Its `build-mac` job only runs when a release is actually created, and it:

1. Imports the Developer ID cert into an ephemeral keychain on the CI runner.
2. Runs electron-builder with `--publish never` — a universal DMG and ZIP, signed under hardened runtime and notarized with Apple.
3. Uploads the assets with `gh release upload`: the DMG, the ZIP, both blockmaps, and `latest-mac.yml`.
4. Cleans up the ephemeral keychain.

`electron-builder.yml`'s `publish` block exists only so `electron-updater` knows where to look for updates at runtime — publishing itself is done by `gh release upload`, which is why `--publish never` matters.

`.github/workflows/release.yml` is the older tag-triggered workflow. It is kept as a manual fallback for re-releasing a tag; it is not the normal path.

Users then grab the notarized DMG from the Releases page. Because it's notarized, macOS opens it without a Gatekeeper warning.

Note that a GitHub Release can be visible before its assets finish uploading. If you are checking the website download button or the updater feed right after a release, give the upload time to finish first.

## Coding conventions

- Tailwind classes belong inline on JSX — no CSS modules.
- Color and spacing come from the CSS variables defined in `src/renderer/styles/globals.css`. If you need a new color, add a token, don't hardcode a hex in a component.
- The renderer must never talk to Node or SQLite directly. Everything goes through `window.api` (defined in `src/shared/ipc-contract.ts` and implemented in `src/preload/index.ts` + `src/main/ipc.ts`).
- Don't add any dependency that makes a network call. If it does, it's not shipping.

## License

MIT © Sina Meraji
