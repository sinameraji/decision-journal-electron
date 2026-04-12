import type { ChatMsg } from '@shared/ipc-contract'

interface Props {
  message: ChatMsg
  streaming?: boolean
}

export default function Message({ message, streaming }: Props) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed',
          isUser
            ? 'rounded-br-md bg-[rgb(var(--accent))] text-accent-text dark:border dark:border-border dark:bg-bg-elevated dark:text-text'
            : 'rounded-bl-md border border-border bg-bg-elevated text-text'
        ].join(' ')}
      >
        {message.content}
        {streaming && (
          <span className="ml-0.5 inline-block h-[13px] w-[2px] translate-y-[2px] animate-pulse bg-current" />
        )}
      </div>
    </div>
  )
}
