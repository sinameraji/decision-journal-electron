import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'
import type { UpdateStatus } from '@shared/ipc-contract'

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

/**
 * Whether the user is watching for an answer.
 *
 * The launch check runs on its own and nobody asked it a question, so a
 * failure there is not news — GitHub being briefly unreachable, or a release
 * tag existing before its binaries finish uploading, would otherwise greet the
 * user with an error about a check they never requested. Those failures stay
 * silent and the row falls back to offering a check. A failure the user asked
 * for is reported, because they are waiting on an answer.
 */
let userAsked = false
/** Which action failed, so the message can say the right thing. */
let phase: 'check' | 'download' = 'check'

function broadcast(status: UpdateStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('app:update-status', status)
    }
  }
}

autoUpdater.on('checking-for-update', () => {
  broadcast({ state: 'checking' })
})

autoUpdater.on('update-available', (info) => {
  const notes =
    typeof info.releaseNotes === 'string'
      ? info.releaseNotes
      : Array.isArray(info.releaseNotes)
        ? info.releaseNotes.map((n) => (typeof n === 'string' ? n : n.note)).join('\n')
        : ''
  broadcast({ state: 'available', version: info.version, releaseNotes: notes })
})

autoUpdater.on('update-not-available', () => {
  broadcast({ state: 'not-available' })
})

autoUpdater.on('download-progress', (progress) => {
  broadcast({ state: 'downloading', percent: Math.round(progress.percent) })
})

autoUpdater.on('update-downloaded', (info) => {
  broadcast({ state: 'downloaded', version: info.version })
})

autoUpdater.on('error', (err) => {
  // The detail is for whoever is reading a terminal, never for the user: they
  // asked whether an update exists, not how the lookup failed.
  console.error(`[updater] ${phase} failed: ${err.message}`)
  broadcast(userAsked ? { state: 'error', phase } : { state: 'idle' })
})

export async function checkForUpdates(options?: { userAsked?: boolean }): Promise<void> {
  userAsked = options?.userAsked ?? false
  phase = 'check'
  await autoUpdater.checkForUpdates()
}

export async function downloadUpdate(): Promise<void> {
  // There is no automatic download — autoDownload is off — so reaching here
  // always means the user pressed the button.
  userAsked = true
  phase = 'download'
  await autoUpdater.downloadUpdate()
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}
