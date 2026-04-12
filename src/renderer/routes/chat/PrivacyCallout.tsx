import { Lock } from 'lucide-react'

export default function PrivacyCallout() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-bg-elevated px-4 py-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-bg text-text">
        <Lock size={14} strokeWidth={1.75} />
      </div>
      <div className="text-[12.5px] leading-relaxed text-text-muted">
        <span className="font-medium text-text">Private by design.</span> This chat runs a
        model entirely on your Mac. Your messages, your decisions, and the model’s replies
        never leave this machine — no API calls, no logs, no telemetry.
      </div>
    </div>
  )
}
