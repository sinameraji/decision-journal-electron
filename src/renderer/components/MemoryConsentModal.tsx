/**
 * The disclosure shown before memory extraction is switched on. Shared by
 * Settings and the Memory page so the two entry points can never drift into
 * telling the user different things.
 */
export default function MemoryConsentModal({
  onCancel,
  onAccept
}: {
  onCancel: () => void
  onAccept: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-sm">
      <div className="w-[480px] rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
        <h3 className="font-serif text-[20px] font-medium text-text">Turn on memory?</h3>
        <div className="mt-3 space-y-2.5 text-[12.5px] leading-relaxed text-text-muted">
          <p>
            Each new or changed decision will be sent to the OpenRouter model you selected, which
            proposes memories. The results are stored encrypted on this Mac.
          </p>
          <p>
            This is different from chat: it happens automatically after you save, not only when
            you press send. Past decisions are <span className="font-medium text-text">not</span>{' '}
            included — there is no backfill unless you ask for one and pick the entries.
          </p>
          <p>
            Extraction only ever runs on models whose providers enforce zero data retention. Unlike
            chat, there is no option to override that, because nothing here asks you first.
          </p>
          <p>
            Nothing proposed is used until you approve it, and approving a memory still does not
            send it to a chat — each conversation decides that separately. You can exclude an
            individual decision before saving it.
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-[12.5px] text-text-muted hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-3 py-1.5 text-[12.5px] text-accent-text hover:opacity-90 dark:border-border dark:bg-transparent dark:text-text"
          >
            I understand — turn it on
          </button>
        </div>
      </div>
    </div>
  )
}
