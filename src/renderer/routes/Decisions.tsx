import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import type { Decision } from '@shared/ipc-contract'
import DecisionCard from '../components/DecisionCard'
import ReauthModal from '../components/ReauthModal'

export default function Decisions() {
  const navigate = useNavigate()
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [toDelete, setToDelete] = useState<Decision | null>(null)

  const refresh = useCallback(async () => {
    const rows = await window.api.decisions.list()
    setDecisions(rows)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleConfirmDelete = async () => {
    if (!toDelete) return
    const id = toDelete.id
    setToDelete(null)
    await window.api.decisions.delete(id)
    await refresh()
  }

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

      {decisions.length === 0 ? (
        <div className="mt-16 rounded-2xl border border-dashed border-border bg-bg-elevated/40 px-8 py-16 text-center">
          <p className="font-serif text-[22px] text-text">No decisions yet</p>
          <p className="mt-2 text-[13px] text-text-muted">
            Capture the first decision you're thinking through right now.
          </p>
          <button
            type="button"
            onClick={() => navigate('/new')}
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-4 py-2.5 text-[13px] font-medium text-accent-text transition-colors hover:opacity-90 dark:bg-transparent dark:border-border dark:text-text"
          >
            <Plus size={15} strokeWidth={2} />
            New Decision
          </button>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-3 pb-10">
          {decisions.map((d) => (
            <DecisionCard key={d.id} decision={d} onRequestDelete={setToDelete} />
          ))}
        </div>
      )}

      {toDelete && (
        <ReauthModal
          title="Delete this decision?"
          description={`"${
            toDelete.title.length > 80
              ? toDelete.title.slice(0, 80) + '…'
              : toDelete.title
          }" will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete"
          reason="Confirm deleting a decision"
          danger
          onCancel={() => setToDelete(null)}
          onConfirmed={handleConfirmDelete}
        />
      )}
    </div>
  )
}
