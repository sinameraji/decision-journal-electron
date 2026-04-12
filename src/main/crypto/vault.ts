import { promises as fs } from 'node:fs'
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'
import { DEFAULT_KDF_PARAMS, deriveKey, newSalt, type KdfParams } from './kdf'
import { keychainUnwrap, keychainWrap, isEncryptionAvailable } from './keychain'

const VAULT_VERSION = 1
const PIN_REGEX = /^\d{6}$/
const MAX_ATTEMPTS_BEFORE_COOLDOWN = 5
const BASE_COOLDOWN_MS = 30_000
const MAX_COOLDOWN_MS = 10 * 60_000

interface WrappedBlob {
  ivB64: string
  ciphertextB64: string
  tagB64: string
}

export interface VaultFile {
  version: number
  kdf: KdfParams
  pinWrappedMasterKey: WrappedBlob
  safeStorageDoubleWrapped: string | null
  touchIdWrappedMasterKey: string | null
  failedAttempts: number
  cooldownUntil: number | null
}

function aesGcmEncrypt(key: Buffer, plaintext: Buffer): WrappedBlob {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    ivB64: iv.toString('base64'),
    ciphertextB64: ciphertext.toString('base64'),
    tagB64: tag.toString('base64')
  }
}

function aesGcmDecrypt(key: Buffer, blob: WrappedBlob): Buffer {
  const iv = Buffer.from(blob.ivB64, 'base64')
  const ciphertext = Buffer.from(blob.ciphertextB64, 'base64')
  const tag = Buffer.from(blob.tagB64, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

export function isValidPinFormat(pin: string): boolean {
  return PIN_REGEX.test(pin)
}

function cooldownForAttempts(attempts: number): number {
  const overflow = attempts - MAX_ATTEMPTS_BEFORE_COOLDOWN
  if (overflow < 0) return 0
  const ms = BASE_COOLDOWN_MS * Math.pow(2, Math.floor(overflow / MAX_ATTEMPTS_BEFORE_COOLDOWN))
  return Math.min(ms, MAX_COOLDOWN_MS)
}

export class Vault {
  constructor(private readonly vaultPath: string) {}

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.vaultPath)
      return true
    } catch {
      return false
    }
  }

  async read(): Promise<VaultFile> {
    const raw = await fs.readFile(this.vaultPath, 'utf8')
    return JSON.parse(raw) as VaultFile
  }

  async write(file: VaultFile): Promise<void> {
    await fs.writeFile(this.vaultPath, JSON.stringify(file, null, 2), {
      encoding: 'utf8',
      mode: 0o600
    })
  }

  async getStatus() {
    if (!(await this.exists())) {
      return {
        initialized: false,
        cooldownUntil: null,
        failedAttempts: 0,
        touchIdEnabled: false
      }
    }
    const file = await this.read()
    return {
      initialized: true,
      cooldownUntil: file.cooldownUntil,
      failedAttempts: file.failedAttempts,
      touchIdEnabled: file.touchIdWrappedMasterKey !== null
    }
  }

  async create(pin: string): Promise<Buffer> {
    if (!isValidPinFormat(pin)) {
      throw new Error('PIN must be exactly 6 digits')
    }
    if (await this.exists()) {
      throw new Error('Vault already exists')
    }
    const kdf: KdfParams = {
      algorithm: 'argon2id',
      memoryCost: DEFAULT_KDF_PARAMS.memoryCost,
      timeCost: DEFAULT_KDF_PARAMS.timeCost,
      parallelism: DEFAULT_KDF_PARAMS.parallelism,
      saltB64: newSalt()
    }
    const masterKey = randomBytes(32)
    const pinKey = await deriveKey(pin, kdf)
    const pinWrapped = aesGcmEncrypt(pinKey, masterKey)

    let safeStorageDoubleWrapped: string | null = null
    if (isEncryptionAvailable()) {
      const innerBlob = Buffer.from(JSON.stringify(pinWrapped), 'utf8')
      safeStorageDoubleWrapped = keychainWrap(innerBlob)
    }

    const file: VaultFile = {
      version: VAULT_VERSION,
      kdf,
      pinWrappedMasterKey: pinWrapped,
      safeStorageDoubleWrapped,
      touchIdWrappedMasterKey: null,
      failedAttempts: 0,
      cooldownUntil: null
    }
    await this.write(file)
    pinKey.fill(0)
    return masterKey
  }

  async unlock(pin: string): Promise<
    | { ok: true; masterKey: Buffer }
    | { ok: false; error: 'cooldown' | 'wrong-pin' | 'invalid-format'; cooldownUntil?: number; failedAttempts?: number }
  > {
    if (!isValidPinFormat(pin)) return { ok: false, error: 'invalid-format' }
    const file = await this.read()

    const now = Date.now()
    if (file.cooldownUntil && file.cooldownUntil > now) {
      return { ok: false, error: 'cooldown', cooldownUntil: file.cooldownUntil }
    }

    let innerBlob: WrappedBlob = file.pinWrappedMasterKey
    if (file.safeStorageDoubleWrapped && isEncryptionAvailable()) {
      try {
        const decoded = keychainUnwrap(file.safeStorageDoubleWrapped)
        innerBlob = JSON.parse(decoded.toString('utf8')) as WrappedBlob
      } catch {
        // fall back to the on-disk blob; means Keychain is unavailable on this machine
      }
    }

    const pinKey = await deriveKey(pin, file.kdf)
    try {
      const masterKey = aesGcmDecrypt(pinKey, innerBlob)
      pinKey.fill(0)
      if (file.failedAttempts !== 0 || file.cooldownUntil !== null) {
        file.failedAttempts = 0
        file.cooldownUntil = null
        await this.write(file)
      }
      return { ok: true, masterKey }
    } catch {
      pinKey.fill(0)
      file.failedAttempts += 1
      const cooldown = cooldownForAttempts(file.failedAttempts)
      file.cooldownUntil = cooldown > 0 ? Date.now() + cooldown : null
      await this.write(file)
      return {
        ok: false,
        error: 'wrong-pin',
        cooldownUntil: file.cooldownUntil ?? undefined,
        failedAttempts: file.failedAttempts
      }
    }
  }

  async changePin(currentPin: string, newPin: string): Promise<Buffer> {
    if (!isValidPinFormat(newPin)) throw new Error('New PIN must be exactly 6 digits')
    const result = await this.unlock(currentPin)
    if (!result.ok) throw new Error('Current PIN incorrect')
    const masterKey = result.masterKey

    const kdf: KdfParams = {
      algorithm: 'argon2id',
      memoryCost: DEFAULT_KDF_PARAMS.memoryCost,
      timeCost: DEFAULT_KDF_PARAMS.timeCost,
      parallelism: DEFAULT_KDF_PARAMS.parallelism,
      saltB64: newSalt()
    }
    const pinKey = await deriveKey(newPin, kdf)
    const pinWrapped = aesGcmEncrypt(pinKey, masterKey)
    pinKey.fill(0)

    const file = await this.read()
    file.kdf = kdf
    file.pinWrappedMasterKey = pinWrapped
    if (isEncryptionAvailable()) {
      file.safeStorageDoubleWrapped = keychainWrap(Buffer.from(JSON.stringify(pinWrapped), 'utf8'))
    } else {
      file.safeStorageDoubleWrapped = null
    }
    file.failedAttempts = 0
    file.cooldownUntil = null
    await this.write(file)
    return masterKey
  }

  async enableTouchId(masterKey: Buffer): Promise<void> {
    if (!isEncryptionAvailable()) throw new Error('safeStorage unavailable; cannot enable Touch ID')
    const file = await this.read()
    file.touchIdWrappedMasterKey = keychainWrap(masterKey)
    await this.write(file)
  }

  async disableTouchId(): Promise<void> {
    const file = await this.read()
    file.touchIdWrappedMasterKey = null
    await this.write(file)
  }

  async unlockWithStoredTouchIdKey(): Promise<Buffer> {
    const file = await this.read()
    if (!file.touchIdWrappedMasterKey) throw new Error('Touch ID not enabled')
    return keychainUnwrap(file.touchIdWrappedMasterKey)
  }

  async exportPortable(): Promise<string> {
    const file = await this.read()
    const portable: VaultFile = {
      version: file.version,
      kdf: file.kdf,
      pinWrappedMasterKey: file.pinWrappedMasterKey,
      safeStorageDoubleWrapped: null,
      touchIdWrappedMasterKey: null,
      failedAttempts: 0,
      cooldownUntil: null
    }
    return JSON.stringify(portable, null, 2)
  }

  async writePortable(portableJson: string): Promise<void> {
    const parsed = JSON.parse(portableJson) as VaultFile
    const file: VaultFile = {
      version: parsed.version,
      kdf: parsed.kdf,
      pinWrappedMasterKey: parsed.pinWrappedMasterKey,
      safeStorageDoubleWrapped: null,
      touchIdWrappedMasterKey: null,
      failedAttempts: 0,
      cooldownUntil: null
    }
    await this.write(file)
  }

  async sealLocally(): Promise<void> {
    if (!isEncryptionAvailable()) return
    const file = await this.read()
    const innerBlob = Buffer.from(JSON.stringify(file.pinWrappedMasterKey), 'utf8')
    file.safeStorageDoubleWrapped = keychainWrap(innerBlob)
    await this.write(file)
  }
}

export function constantTimeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
