# Decision Journal

[![macOS](https://img.shields.io/badge/macOS-11%2B-000000?logo=apple&logoColor=white)](https://github.com/sinameraji/decision-journal-electron/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/sinameraji/decision-journal-electron)](https://github.com/sinameraji/decision-journal-electron/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/sinameraji/decision-journal-electron/total)](https://github.com/sinameraji/decision-journal-electron/releases/latest)
[![Offline Only](https://img.shields.io/badge/network-offline%20only-green)]()
[![Encrypted](https://img.shields.io/badge/encryption-AES--256%20%2B%20Argon2id-purple)]()

[**Download for Mac**](https://github.com/sinameraji/decision-journal-electron/releases/latest/download/Decision.Journal-0.2.0-universal.dmg)

A private, offline journal for the decisions you make — and the ones you want to get better at.

Inspired by [Farnam Street's decision journal practice](https://fs.blog/decision-journal/): write down a decision as you're making it, come back to it months later, log how it actually played out, and slowly build a real picture of your own judgment over time.

Built for macOS by [Sina Meraji](https://github.com/sinameraji).

## Why this exists

Most journaling apps want your data in their cloud. This one is the opposite. Decision Journal is designed from the ground up for the kind of thinking you'd never want leaking — career pivots, relationships, money, risk, the honest stuff you'd normally only trust to a paper notebook.

- **Everything stays on your Mac.** There is no account. There is no cloud. The app makes **zero network requests** — if you pull the plug on your wifi, nothing changes.
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

> **Heads up:** this early version is the foundation — the encryption, unlock flow, theming, and the shell are all in place. The full decision-capture and review flows are next. See the [Roadmap](#roadmap) below for what's coming.

- **Decisions** — the main list of everything you've recorded.
- **New Decision** — capture a decision as you make it: what you're deciding, what you considered, what you expect to happen, and when to revisit.
- **Reviews** — come back to past decisions and log how things actually turned out. This is where the real learning happens.
- **Analytics** — see patterns in your own decision quality over time.
- **Chat** — a local AI coach (powered by Ollama, running entirely on your machine — still no network) to talk through past decisions, check for bias, and think through opportunity costs.
- **Settings** — toggle Touch ID, lock instantly, change your theme.

## What your data looks like on disk

All of your data lives in one place on your Mac: `~/Library/Application Support/Decision Journal/`.

- `decisions.db` — your encrypted journal. Open it with any SQLite tool without the right key and it'll just say "file is not a database."
- `vault.json` — the wrapped encryption key. Useless on its own.

If you ever want a fresh start, quit the app and delete those two files.

## Privacy & security in plain English

- **Offline only.** The app blocks all network traffic at the OS level. There is no telemetry, no crash reporting, no auto-update, no "anonymous analytics."
- **Encrypted at rest.** Your journal is stored in an encrypted SQLite database (SQLCipher). The encryption key is a random 256-bit key generated once on your first launch.
- **Your PIN protects the key, and macOS protects the PIN.** Your 6-digit PIN is run through a slow key-stretching function (Argon2id) and used to encrypt the real key. That encrypted blob is then encrypted *again* using macOS's built-in Keychain, which is tied to your Mac login password and the Secure Enclave. So even if someone copies your database file, they can't brute-force the PIN — they'd need to also unlock your Mac account.
- **Touch ID is convenience, not a replacement.** When you enable Touch ID, your fingerprint just provides a quicker path to the same encryption key. Your PIN is still the source of truth.
- **Quantum computers?** The crypto here is symmetric (AES-256, SHA-512, Argon2id) with no key exchange over any wire, so the "harvest now, decrypt later" attack that Signal-style end-to-end messaging has to worry about doesn't apply.

## Roadmap

This first release is the foundation. What's next, roughly in order:

- Full decision-capture flow — title, context, options considered, expected outcome, review date, confidence level
- Review flow — log actual outcomes, compare to what you predicted
- Search and filtering across your journal
- Analytics — calibration curves, decision quality trends, base-rate vs. actual
- **Local AI coach via Ollama** — chat with your past decisions, ask for second opinions, get bias checks, all running on-device with no network traffic
- Opportunity-cost analysis
- Game-theoretic helpers for high-uncertainty, high-consequence choices
- Encrypted export/backup

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
