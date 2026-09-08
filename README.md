# Decision Journal

[![macOS](https://img.shields.io/badge/macOS-11%2B-000000?logo=apple&logoColor=white)](https://github.com/sinameraji/decision-journal-electron/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/sinameraji/decision-journal-electron)](https://github.com/sinameraji/decision-journal-electron/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/sinameraji/decision-journal-electron/total)](https://github.com/sinameraji/decision-journal-electron/releases/latest)
[![Offline Only](https://img.shields.io/badge/network-offline%20only-green)]()
[![Encrypted](https://img.shields.io/badge/encryption-AES--256%20%2B%20Argon2id-purple)]()

[**Download for Mac**](https://github.com/sinameraji/decision-journal-electron/releases/latest)

A private, offline journal for the decisions you make — and the ones you want to get better at.

https://github.com/user-attachments/assets/c53bd66f-695c-4a67-baa2-c5823bbfd1a7

Inspired by [Farnam Street's decision journal practice](https://fs.blog/decision-journal/): write down a decision as you're making it, come back to it months later, log how it actually played out, and slowly build a real picture of your own judgment over time.

Built for macOS by [Sina Meraji](https://github.com/sinameraji).

## Why this exists

Most journaling apps want your data in their cloud. This one is the opposite. Decision Journal is designed from the ground up for the kind of thinking you'd never want leaking — career pivots, relationships, money, risk, the honest stuff you'd normally only trust to a paper notebook.

- **Your journal stays on your Mac.** There is no account. There is no cloud. Your decisions, reviews, analytics, audio transcripts, and AI coach conversations live on-device. A network kill-switch in the main process blocks every outbound request by default — the exceptions are a small, explicit allowlist (app update checks, Whisper model downloads) documented in [Network activity](#network-activity) below, and none of those carry journal data. The one way journal content can leave this Mac is if *you* turn on **optional online AI**, add your own OpenRouter API key, and attach specific decisions to a chat. It is off by default, off after an upgrade, and off again after restoring a backup.
- **Your journal is encrypted.** The database file is locked with a key derived from your PIN and your Mac's login keychain. If someone copies the file off your disk, it looks like random noise to them.
- **You hold the only key.** There is no "forgot your PIN" flow. If you lose the PIN, your data is gone — by design.

## Install

1. Head to the [Releases page](https://github.com/sinameraji/decision-journal-electron/releases) and download the latest `Decision Journal-*.dmg`.
2. Open the DMG and drag **Decision Journal** into your Applications folder.
3. Launch it from Applications.
4. Create your 6-digit PIN. You'll use this to unlock the app every time you open it.
5. If your Mac has Touch ID, the app will offer to let you unlock with your fingerprint — your PIN still works as a fallback.

That's it. No sign-up, no email, no account to create.

## How you'll use it

- **Decisions** — the main list of everything you've recorded, with search and filtering.
- **New Decision** — capture a decision as you make it: what you're deciding, what you considered, what you expect to happen, and when to revisit. Dictate it hands-free with on-device Whisper transcription if you'd rather talk than type.
- **Reviews** — come back to past decisions and log how things actually turned out. This is where the real learning happens.
- **Analytics** — see patterns in your own decision quality over time: timeline, review status, mental-state distribution, and mental-state trends.
- **Chat** — an AI coach to talk through past decisions, check for bias, and think through opportunity costs. By default it runs a local model via Ollama, entirely on your machine. You can optionally enable an online model through your own OpenRouter account; in that mode only the messages you type and the decisions you explicitly attach are sent.
- **Settings** — toggle Touch ID, manage Whisper models, restore from backup, check for app updates, lock instantly.

## What your data looks like on disk

All of your data lives in one place on your Mac: `~/Library/Application Support/Decision Journal/`.

- `decisions.db` — your encrypted journal. Open it with any SQLite tool without the right key and it'll just say "file is not a database."
- `vault.json` — the wrapped encryption key. Useless on its own.

If you ever want a fresh start, quit the app and delete those two files.

## Network activity

The app is offline-first. A kill-switch in the main process blocks every outbound request by default. There are four narrow exceptions, all documented here. The first three never carry journal content; the fourth is the optional online AI, which is off unless you turn it on:

| Request | Who triggers it | When / how often | Destination |
|---|---|---|---|
| Check for app updates | App (automatic on launch) + user button in Settings → About. **Can be turned off** in Settings → About → "Check for updates automatically". | Once per app launch (or never, if disabled) | `github.com` (GitHub Releases feed, via `electron-updater`) |
| Download an app update | **User only** (click "Download Update") | Only when you opt in — auto-download is disabled | `github.com` (release assets) |
| Download a Whisper transcription model | **User only** (click "Download" in Settings → Transcription) | Only when you opt in, one time per model | `huggingface.co` and its CDN |
| **Optional online AI chat** — *the only request that can carry journal content* | **User only.** Requires turning on Settings → Online AI, saving your own OpenRouter API key, and confirming a per-conversation disclosure. | Only when you send a message in a chat you have switched to an online model | `openrouter.ai` and, through it, the model provider you routed to |

What's *not* a network request:
- **Your decisions, reviews, and analytics.** These stay on your Mac. Nothing is uploaded in the background, ever — there is no sync and no backup service.
- **The local AI coach.** With a local model, chat runs against an Ollama daemon on `localhost:11434` — on-device, not over the internet.
- **Audio transcription.** Whisper runs fully on-device once the model is downloaded.
- **External links.** Clicking a "learn more" link opens your default browser, which is separate from the app's network sandbox.

There is **no telemetry, no crash reporting, and no "anonymous analytics"** of any kind.

### If you turn on online AI

This is the only feature that can send journal content off your Mac, so it's worth being precise:

- **It is off by default** — on a fresh install, after an upgrade, and again after you restore a backup.
- **You bring your own key.** There is no Decision Journal account, backend, or subscription. Requests are billed to your OpenRouter account. The key is stored in your macOS Keychain, is never returned to the app's UI once saved, and is **not** included in an exported backup.
- **Only what you attach is sent.** A conversation sends the messages in that thread plus the decisions you explicitly attached to it. The rest of your journal is not included. "What gets sent" in the chat header shows the exact payload before you send it.
- **Requests are pinned to zero-data-retention routes** (`zdr: true`), providers that may train on inputs are refused (`data_collection: "deny"`), and response caching is switched off. If no compliant route exists for a model, the request **fails with an explanation** — it is never retried on a route that retains your data.
- **What we can't promise.** OpenRouter still records request metadata, and the downstream provider has its own policy. This is a provider-policy restriction, not on-device processing and not end-to-end encryption against the model provider. Once a message is sent, it cannot be recalled.
- **Turning it off** cancels anything in flight and revokes consent, so a reply that arrives late is discarded rather than saved.

## Privacy & security in plain English

- **Offline for your data by default.** See [Network activity](#network-activity) above for the full list of exceptions. App update checks and Whisper model downloads never carry journal content. Optional online AI can — but only after you enable it, add your own API key, and attach specific decisions to a chat.
- **Encrypted at rest.** Your journal is stored in an encrypted SQLite database (SQLCipher). The encryption key is a random 256-bit key generated once on your first launch.
- **Your PIN protects the key, and macOS protects the PIN.** Your 6-digit PIN is run through a slow key-stretching function (Argon2id) and used to encrypt the real key. That encrypted blob is then encrypted *again* using macOS's built-in Keychain, which is tied to your Mac login password and the Secure Enclave. So even if someone copies your database file, they can't brute-force the PIN — they'd need to also unlock your Mac account.
- **Touch ID is convenience, not a replacement.** When you enable Touch ID, your fingerprint just provides a quicker path to the same encryption key. Your PIN is still the source of truth.
- **Quantum computers?** The crypto here is symmetric (AES-256, SHA-512, Argon2id) with no key exchange over any wire, so the "harvest now, decrypt later" attack that Signal-style end-to-end messaging has to worry about doesn't apply.

## What's already shipped

- Full decision-capture flow — title, context, options considered, expected outcome, review date, confidence level, mental state
- Review flow — log actual outcomes, lessons learned, compare to what you predicted
- Search and filtering across your journal
- Analytics — decision timeline, review status, mental-state distribution, mental-state over time
- Local AI coach via Ollama — chat with your past decisions, ask for second opinions, get bias checks, all running on-device
- Optional online AI via your own OpenRouter key — off by default, zero-data-retention routing, and only the decisions you attach are sent
- On-device voice transcription via Whisper — dictate decisions hands-free, audio never leaves your Mac
- Encrypted backup and restore
- Touch ID unlock
- In-app updates via GitHub Releases (user-confirmed before download; automatic checks can be turned off in Settings)

## Roadmap

- Opportunity-cost analysis
- Game-theoretic helpers for high-uncertainty, high-consequence choices
- Calibration curves (predicted vs. actual confidence over time)

## System requirements

- macOS 11 (Big Sur) or later
- Works on both Intel and Apple Silicon Macs (universal binary)
- ~150 MB disk space

## Building from source

If you'd rather build it yourself instead of downloading the release:

```bash
git clone https://github.com/sinameraji/decision-journal-electron.git
cd decision-journal-electron
npm install
npm run dev
```

For a packaged DMG from source, see [CONTRIBUTING.md](CONTRIBUTING.md) (or open an issue if you run into trouble).

## License

MIT © Sina Meraji
