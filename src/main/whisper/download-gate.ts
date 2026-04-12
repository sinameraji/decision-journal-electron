const ALLOWED_MODEL_URLS = [
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin'
]

const ALLOWED_CDN_PREFIXES = [
  'https://cdn-lfs.huggingface.co/',
  'https://cdn-lfs-us-1.huggingface.co/',
  'https://cdn-lfs-eu-1.huggingface.co/',
  'https://cas-bridge.xethub.hf.co/'
]

const GATE_TIMEOUT_MS = 120_000

let gateOpen = false
let timer: ReturnType<typeof setTimeout> | null = null

export function openDownloadGate(): void {
  gateOpen = true
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    gateOpen = false
    timer = null
  }, GATE_TIMEOUT_MS)
}

export function closeDownloadGate(): void {
  gateOpen = false
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

export function isUrlAllowedByGate(url: string): boolean {
  if (!gateOpen) return false
  if (ALLOWED_MODEL_URLS.some((allowed) => url.startsWith(allowed))) return true
  if (ALLOWED_CDN_PREFIXES.some((prefix) => url.startsWith(prefix))) return true
  return false
}
