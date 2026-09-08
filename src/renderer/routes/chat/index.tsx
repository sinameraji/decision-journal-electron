import { useEffect } from 'react'
import { useChatStore } from '../../store/chat'
import ModelSetup from './ModelSetup'
import ChatView from './ChatView'

export default function Chat() {
  const stage = useChatStore((s) => s.stage)
  const init = useChatStore((s) => s.init)

  useEffect(() => {
    void init()
  }, [init])

  if (stage === 'loading') {
    return (
      <div className="mx-auto max-w-[720px]">
        <h1 className="font-serif text-[34px] font-medium leading-tight tracking-tight text-text">
          Chat
        </h1>
        <p className="mt-1 text-[13px] text-text-muted">Checking which models are available…</p>
      </div>
    )
  }

  if (stage === 'chat') return <ChatView />
  return <ModelSetup />
}
