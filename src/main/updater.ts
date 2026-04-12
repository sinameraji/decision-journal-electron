import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'
import type { UpdateStatus } from '@shared/ipc-contract'

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

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
  broadcast({ state: 'error', message: err.message })
})

export async function checkForUpdates(): Promise<void> {
  await autoUpdater.checkForUpdates()
}

export async function downloadUpdate(): Promise<void> {
  await autoUpdater.downloadUpdate()
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}
