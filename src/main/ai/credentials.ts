/**
 * OpenRouter API key storage.
 *
 * The key lives in its own file, wrapped with macOS `safeStorage` (Keychain).
 * It is deliberately *not* stored in the encrypted journal database and *not*
 * part of `vault:export`, so a portable backup never carries the credential.
 * The plaintext key never crosses the IPC boundary back to the renderer.
 */

import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { isEncryptionAvailable, keychainUnwrap, keychainWrap } from '../crypto/keychain'

interface CredentialFile {
  version: 1
  /** safeStorage-wrapped key material, base64. */
  openrouterKey: string | null
  /** Last 4 characters of the key, kept in the clear for display only. */
  openrouterKeyHint: string | null
}

const EMPTY: CredentialFile = { version: 1, openrouterKey: null, openrouterKeyHint: null }

function credentialsPath(): string {
  return join(app.getPath('userData'), 'online-credentials.json')
}

async function read(): Promise<CredentialFile> {
  try {
    const raw = await fs.readFile(credentialsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<CredentialFile>
    return {
      version: 1,
      openrouterKey: typeof parsed.openrouterKey === 'string' ? parsed.openrouterKey : null,
      openrouterKeyHint:
        typeof parsed.openrouterKeyHint === 'string' ? parsed.openrouterKeyHint : null
    }
  } catch {
    return { ...EMPTY }
  }
}

async function write(file: CredentialFile): Promise<void> {
  await fs.writeFile(credentialsPath(), JSON.stringify(file, null, 2), {
    encoding: 'utf8',
    mode: 0o600
  })
}

/** OpenRouter keys look like `sk-or-v1-<hex>`; accept anything plausible. */
export function looksLikeOpenRouterKey(key: string): boolean {
  return /^sk-or-[A-Za-z0-9._-]{16,}$/.test(key.trim())
}

export async function setOpenRouterKey(
  key: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = key.trim()
  if (!looksLikeOpenRouterKey(trimmed)) {
    return { ok: false, error: 'That does not look like an OpenRouter API key.' }
  }
  if (!isEncryptionAvailable()) {
    return {
      ok: false,
      error: 'macOS Keychain is unavailable, so the key cannot be stored securely.'
    }
  }
  await write({
    version: 1,
    openrouterKey: keychainWrap(Buffer.from(trimmed, 'utf8')),
    openrouterKeyHint: trimmed.slice(-4)
  })
  return { ok: true }
}

export async function clearOpenRouterKey(): Promise<void> {
  await write({ ...EMPTY })
  try {
    await fs.rm(credentialsPath(), { force: true })
  } catch {
    // best-effort
  }
}

export async function getOpenRouterKeyStatus(): Promise<{
  hasKey: boolean
  keyHint: string | null
  /** A key is on disk but cannot be decrypted by this build. */
  unreadable: boolean
}> {
  const file = await read()
  if (file.openrouterKey === null) return { hasKey: false, keyHint: null, unreadable: false }

  // Reporting a saved key that no longer decrypts sends the user hunting for a
  // network problem. The usual cause is the app being re-signed under a
  // different Apple team, which invalidates the Keychain ACL.
  const readable = (await readOpenRouterKey()) !== null
  return {
    hasKey: readable,
    keyHint: file.openrouterKeyHint,
    unreadable: !readable
  }
}

/**
 * Main-process only. Returns the plaintext key, or null when none is stored.
 * Callers must never forward the result to the renderer or into a log.
 */
export async function readOpenRouterKey(): Promise<string | null> {
  const file = await read()
  if (!file.openrouterKey) return null
  if (!isEncryptionAvailable()) return null
  try {
    return keychainUnwrap(file.openrouterKey).toString('utf8')
  } catch {
    return null
  }
}
