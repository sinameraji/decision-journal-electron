import { useCallback, useState } from 'react'
import Markdown from 'react-markdown'
import { Check, Copy } from 'lucide-react'
import type { ChatMsg } from '@shared/ipc-contract'

interface Props {
  message: ChatMsg
  streaming?: boolean
}

export default function Message({ message, streaming }: Props) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    if (!isAssistant || streaming) return
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [isAssistant, streaming, message.content])

  return (
    <div className={`group flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'relative max-w-[85%] break-words rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed',
          isUser
            ? 'whitespace-pre-wrap rounded-br-md bg-[rgb(var(--accent))] text-accent-text dark:border dark:border-border dark:bg-bg-elevated dark:text-text'
            : 'rounded-bl-md border border-border bg-bg-elevated text-text',
          'select-text'
        ].join(' ')}
      >
        {isUser ? (
          message.content
        ) : (
          <div className="prose-chat">
            <Markdown>{message.content}</Markdown>
          </div>
        )}
        {streaming && (
          <span className="ml-0.5 inline-block h-[13px] w-[2px] translate-y-[2px] animate-pulse bg-current" />
        )}
        {isAssistant && !streaming && (
          <button
            type="button"
            onClick={handleCopy}
            title="Copy to clipboard"
            className="absolute -bottom-1 -right-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-border bg-bg text-text-muted opacity-0 shadow-sm transition-opacity hover:text-text group-hover:opacity-100"
          >
            {copied ? <Check size={10} strokeWidth={2.5} /> : <Copy size={10} strokeWidth={2} />}
          </button>
        )}
      </div>
    </div>
  )
}
