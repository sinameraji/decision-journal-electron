import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import type { Decision } from '@shared/ipc-contract'
import DecisionCard from '../components/DecisionCard'

export default function Decisions() {
  const navigate = useNavigate()
  const [decisions, setDecisions] = useState<Decision[]>([])

  useEffect(() => {
    window.api.decisions.list().then(setDecisions)
  }, [])

  return (
    <div className="mx-auto max-w-[780px]">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-[34px] font-medium leading-tight tracking-tight text-text">
            Your Decisions
          </h1>
          <p className="mt-1 text-[13px] text-text-muted">
            {decisions.length} decision{decisions.length === 1 ? '' : 's'} recorded
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/new')}
          className="mt-2 flex items-center gap-2 rounded-lg border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-4 py-2.5 text-[13px] font-medium text-accent-text transition-colors hover:opacity-90 dark:bg-transparent dark:border-border dark:text-text"
        >
          <Plus size={15} strokeWidth={2} />
          New Decision
        </button>
      </div>

      <div className="mt-8 flex flex-col gap-3 pb-10">
        {decisions.map((d) => (
          <DecisionCard key={d.id} decision={d} />
        ))}
      </div>
    </div>
  )
}
