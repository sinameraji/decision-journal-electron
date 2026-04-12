import { Download, RefreshCw, ExternalLink, Terminal } from 'lucide-react'
import { useState } from 'react'
import { useChatStore } from '../../store/chat'
import PrivacyCallout from './PrivacyCallout'

export default function NotInstalled() {
  const refresh = useChatStore((s) => s.refresh)
  const [checking, setChecking] = useState(false)

  async function handleCheck() {
    setChecking(true)
    await refresh()
    setChecking(false)
  }

  function handleOpen(url: string) {
    void window.api.ollama.openExternal(url)
  }

  return (
    <div className="mx-auto max-w-[720px] pb-12">
      <h1 className="font-serif text-[34px] font-medium leading-tight tracking-tight text-text">
        Chat
      </h1>
      <p className="mt-1 text-[13px] text-text-muted">
        A local AI coach that only ever runs on your Mac.
      </p>

      <div className="mt-8 rounded-2xl border border-border bg-bg-elevated p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-bg text-text">
            <Download size={18} strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-[20px] font-medium text-text">
              You need Ollama to chat
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
              Ollama runs open-source AI models directly on your Mac. Decision Journal uses it
              to power this chat without sending anything over the network. It’s free, about
              150 MB to install, and takes less than a minute.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleOpen('https://ollama.com/download')}
                className="inline-flex items-center gap-2 rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-3.5 py-2 text-[12.5px] font-medium text-accent-text hover:opacity-90 dark:border-border dark:bg-transparent dark:text-text"
              >
                <Download size={14} strokeWidth={2} />
                Download Ollama
                <ExternalLink size={12} strokeWidth={2} className="opacity-70" />
              </button>
              <button
                type="button"
                onClick={handleCheck}
                disabled={checking}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-bg px-3 py-2 text-[12.5px] text-text hover:bg-nav-active disabled:opacity-50"
              >
                <RefreshCw
                  size={14}
                  strokeWidth={2}
                  className={checking ? 'animate-spin' : ''}
                />
                {checking ? 'Checking…' : 'I installed it — check again'}
              </button>
            </div>

            <div className="mt-6 rounded-lg border border-border bg-bg px-4 py-3">
              <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wide text-text-muted">
                <Terminal size={12} strokeWidth={2} />
                After installing
              </div>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-[12.5px] leading-relaxed text-text-muted">
                <li>Open the Ollama app at least once so it can start its background service.</li>
                <li>Come back here and click “check again”.</li>
                <li>Pick a small model — we’ll recommend ones that fit your Mac.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <PrivacyCallout />
      </div>

      <div className="mt-6 text-center text-[11.5px] text-text-muted">
        <button
          type="button"
          onClick={() => handleOpen('https://github.com/ollama/ollama')}
          className="underline-offset-2 hover:text-text hover:underline"
        >
          What is Ollama?
        </button>
      </div>
    </div>
  )
}
