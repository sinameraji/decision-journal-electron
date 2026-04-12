import { modelPath, isInstalled } from './models'
import { getActiveModel } from './config'

type Whisper = import('smart-whisper').Whisper

let instance: Whisper | null = null
let loadedModelName: string | null = null

async function ensureLoaded(): Promise<Whisper> {
  const name = getActiveModel()
  if (!name) throw new Error('No active transcription model configured')
  if (!isInstalled(name)) throw new Error(`Model "${name}" is not installed`)

  if (instance && loadedModelName === name) return instance

  if (instance) {
    await instance.free()
    instance = null
    loadedModelName = null
  }

  const { Whisper } = await import('smart-whisper')
  const file = modelPath(name)
  instance = new Whisper(file, { gpu: true })
  await instance.load()
  loadedModelName = name
  return instance
}

export async function transcribe(samples: Float32Array): Promise<string> {
  const whisper = await ensureLoaded()
  const task = await whisper.transcribe(samples, {
    language: 'en',
    suppress_non_speech_tokens: true
  })
  const results = await task.result
  return results.map((r) => r.text).join(' ').trim()
}

export async function freeEngine(): Promise<void> {
  if (instance) {
    await instance.free()
    instance = null
    loadedModelName = null
  }
}
