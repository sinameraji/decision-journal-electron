import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Pause, Play, Square, Trash2, Loader2, AlertTriangle } from 'lucide-react'

type Phase = 'idle' | 'recording' | 'paused' | 'transcribing' | 'error'

export default function RecorderPopover({
  onTranscribed,
  onClose
}: {
  onTranscribed: (text: string) => void
  onClose: () => void
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [vuLevel, setVuLevel] = useState(0)

  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number>(0)
  const audioCtxRef = useRef<AudioContext | null>(null)

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    cancelAnimationFrame(animFrameRef.current)
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop()
    }
    stream.current?.getTracks().forEach((t) => t.stop())
    audioCtxRef.current?.close()
    mediaRecorder.current = null
    stream.current = null
    audioCtxRef.current = null
    analyserRef.current = null
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  const startTimer = () => {
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)
  }

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const startVuMeter = (analyser: AnalyserNode) => {
    const buf = new Uint8Array(analyser.fftSize)
    const tick = () => {
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128
        sum += v * v
      }
      setVuLevel(Math.min(1, Math.sqrt(sum / buf.length) * 8))
      animFrameRef.current = requestAnimationFrame(tick)
    }
    tick()
  }

  const startRecording = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true }
      })
      stream.current = s

      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(s)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      const recorder = new MediaRecorder(s)
      mediaRecorder.current = recorder
      chunks.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data)
      }

      recorder.onstop = async () => {
        stopTimer()
        cancelAnimationFrame(animFrameRef.current)
        setPhase('transcribing')

        try {
          const blob = new Blob(chunks.current, { type: recorder.mimeType })
          const samples = await decodeToFloat32(blob)
          // Copy into a fresh ArrayBuffer: `samples.buffer` is typed
          // ArrayBufferLike, which can be a SharedArrayBuffer and is not
          // structured-cloneable across the IPC boundary.
          const buffer = new ArrayBuffer(samples.byteLength)
          new Float32Array(buffer).set(samples)
          const text = await window.api.transcription.transcribe(buffer)
          onTranscribed(text)
          onClose()
        } catch (err) {
          setPhase('error')
          setErrorMsg(err instanceof Error ? err.message : 'Transcription failed')
        }
      }

      recorder.start()
      setElapsed(0)
      startTimer()
      startVuMeter(analyser)
      setPhase('recording')
    } catch (err) {
      setPhase('error')
      setErrorMsg(
        err instanceof Error
          ? err.message.includes('Permission')
            ? 'Microphone permission denied. Check System Settings > Privacy > Microphone.'
            : err.message
          : 'Could not access microphone'
      )
    }
  }, [onTranscribed, onClose])

  const pauseRecording = () => {
    mediaRecorder.current?.pause()
    stopTimer()
    cancelAnimationFrame(animFrameRef.current)
    setPhase('paused')
  }

  const resumeRecording = () => {
    mediaRecorder.current?.resume()
    startTimer()
    if (analyserRef.current) startVuMeter(analyserRef.current)
    setPhase('recording')
  }

  const stopRecording = () => {
    mediaRecorder.current?.stop()
    stream.current?.getTracks().forEach((t) => t.stop())
  }

  const deleteRecording = () => {
    cleanup()
    chunks.current = []
    setElapsed(0)
    setVuLevel(0)
    setPhase('idle')
  }

  useEffect(() => {
    startRecording()
  }, [startRecording])

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  return (
    <div className="absolute bottom-full right-0 z-40 mb-2 w-[260px] rounded-xl border border-border bg-bg-elevated p-4 shadow-xl">
      {phase === 'idle' && (
        <div className="flex items-center gap-2 text-[12.5px] text-text-muted">
          <Loader2 size={14} className="animate-spin" />
          Starting microphone...
        </div>
      )}

      {(phase === 'recording' || phase === 'paused') && (
        <div>
          <div className="flex items-center gap-3">
            {phase === 'recording' && (
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            )}
            {phase === 'paused' && (
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            )}
            <span className="font-mono text-[18px] font-medium tabular-nums text-text">
              {mm}:{ss}
            </span>
          </div>

          {phase === 'recording' && (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-75"
                style={{ width: `${Math.max(5, vuLevel * 100)}%` }}
              />
            </div>
          )}

          <div className="mt-4 flex items-center gap-2">
            {phase === 'recording' ? (
              <IconBtn onClick={pauseRecording} label="Pause">
                <Pause size={14} />
              </IconBtn>
            ) : (
              <IconBtn onClick={resumeRecording} label="Resume">
                <Play size={14} />
              </IconBtn>
            )}
            <IconBtn onClick={stopRecording} label="Done" accent>
              <Square size={12} fill="currentColor" />
            </IconBtn>
            <IconBtn onClick={deleteRecording} label="Discard" danger>
              <Trash2 size={14} />
            </IconBtn>
          </div>
        </div>
      )}

      {phase === 'transcribing' && (
        <div className="flex items-center gap-2.5 text-[12.5px] text-text">
          <Loader2 size={14} className="animate-spin" />
          Transcribing...
        </div>
      )}

      {phase === 'error' && (
        <div>
          <div className="flex items-center gap-2 text-[12.5px] text-red-500">
            <AlertTriangle size={14} />
            {errorMsg}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2.5 py-1 text-[12px] text-text-muted hover:text-text"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase('idle')
                startRecording()
              }}
              className="rounded-md border border-border px-2.5 py-1 text-[12px] text-text hover:bg-nav-active"
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function IconBtn({
  onClick,
  label,
  accent,
  danger,
  children
}: {
  onClick: () => void
  label: string
  accent?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={[
        'flex h-8 w-8 items-center justify-center rounded-full border transition-colors',
        danger
          ? 'border-red-500/30 text-red-500 hover:bg-red-500/10'
          : accent
            ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))] text-accent-text hover:opacity-90 dark:bg-transparent dark:border-border dark:text-text'
            : 'border-border text-text-muted hover:text-text hover:bg-nav-active'
      ].join(' ')}
    >
      {children}
    </button>
  )
}

async function decodeToFloat32(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer()

  // Decode audio using a standard AudioContext (avoids 1-frame OfflineAudioContext quirks)
  const tempCtx = new AudioContext({ sampleRate: 16000 })
  const decoded = await tempCtx.decodeAudioData(arrayBuffer)
  await tempCtx.close()

  // Resample to 16 kHz mono
  const numSamples = Math.ceil(decoded.duration * 16000)
  const offlineCtx = new OfflineAudioContext(1, numSamples, 16000)
  const source = offlineCtx.createBufferSource()
  source.buffer = decoded
  source.connect(offlineCtx.destination)
  source.start()

  const rendered = await offlineCtx.startRendering()
  // Copy data to a clean Float32Array (avoids shared-buffer issues across IPC)
  return new Float32Array(rendered.getChannelData(0))
}
