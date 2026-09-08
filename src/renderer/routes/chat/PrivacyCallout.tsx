import { Lock, Globe } from 'lucide-react'

/**
 * Shown on the model picker. The copy has to stay true for both providers, so
 * it states the local guarantee and the online exception side by side rather
 * than claiming nothing ever leaves the machine.
 */
export default function PrivacyCallout({ onlineEnabled }: { onlineEnabled: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-bg-elevated px-4 py-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-bg text-text">
          <Lock size={14} strokeWidth={1.75} />
        </div>
        <div className="text-[12.5px] leading-relaxed text-text-muted">
          <span className="font-medium text-text">Local models are private.</span> A local model
          runs entirely on your Mac. Your messages, your decisions, and the replies never leave
          this machine — no API calls, no logs, no telemetry.
        </div>
      </div>

      {onlineEnabled && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-amber-500/40 bg-bg text-amber-600 dark:text-amber-400">
            <Globe size={14} strokeWidth={1.75} />
          </div>
          <div className="text-[12.5px] leading-relaxed text-text-muted">
            <span className="font-medium text-text">Online models are not.</span> When you pick an
            online model, the messages in that chat and any decisions you attach are sent to
            OpenRouter and the model provider, billed to your own OpenRouter account. Requests are
            pinned to zero-data-retention routes, but that is a provider policy — not on-device
            processing. Nothing else in your journal is sent.
          </div>
        </div>
      )}
    </div>
  )
}
