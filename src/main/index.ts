import { app, BrowserWindow, shell, session, nativeImage } from 'electron'
import { join } from 'node:path'
import { clearSessionOnQuit, registerIpcHandlers } from './ipc'
import { applyThemeMode, loadThemePreference, wireNativeThemeBroadcast } from './theme'
import { isUrlAllowedByGate } from './whisper/download-gate'

let mainWindow: BrowserWindow | null = null

const ALLOWED_URL_PREFIXES = ['file://', 'devtools://', 'chrome-extension://', 'chrome-devtools://']

function installNetworkKillSwitch(): void {
  const ses = session.defaultSession

  const isAllowed = (url: string): boolean => {
    if (!url) return true
    if (url.startsWith('data:') || url.startsWith('blob:')) return true
    for (const p of ALLOWED_URL_PREFIXES) {
      if (url.startsWith(p)) return true
    }
    if (!app.isPackaged) {
      if (url.startsWith('http://localhost') || url.startsWith('ws://localhost')) return true
      if (url.startsWith('http://127.0.0.1') || url.startsWith('ws://127.0.0.1')) return true
    }
    if (isUrlAllowedByGate(url)) return true
    return false
  }

  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    if (isAllowed(details.url)) {
      callback({ cancel: false })
    } else {
      console.warn('[network-kill-switch] blocked', details.url)
      callback({ cancel: true })
    }
  })

  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'media') {
      callback(true)
      return
    }
    callback(false)
  })
}

function installCsp(): void {
  const ses = session.defaultSession
  ses.webRequest.onHeadersReceived((details, callback) => {
    const devConnect = !app.isPackaged ? ' ws://localhost:* http://localhost:*' : ''
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; ` +
            `script-src 'self'${!app.isPackaged ? " 'unsafe-inline' 'unsafe-eval'" : ''}; ` +
            `style-src 'self' 'unsafe-inline'; ` +
            `img-src 'self' data:; ` +
            `font-src 'self' data:; ` +
            `connect-src 'self'${devConnect}; ` +
            `object-src 'none'; ` +
            `base-uri 'self'; ` +
            `form-action 'none'; ` +
            `frame-ancestors 'none';`
        ]
      }
    })
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 660,
    minWidth: 880,
    minHeight: 560,
    show: false,
    backgroundColor: '#f3ecd9',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed =
      url.startsWith('file://') ||
      (!app.isPackaged && url.startsWith('http://localhost'))
    if (!allowed) {
      event.preventDefault()
    }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.setName('Decision Journal')

app.whenReady().then(async () => {
  const iconPath = join(__dirname, '../../build/icon.icns')
  app.dock?.setIcon(nativeImage.createFromPath(iconPath))

  installNetworkKillSwitch()
  installCsp()
  registerIpcHandlers()

  const theme = await loadThemePreference()
  applyThemeMode(theme)

  createWindow()
  wireNativeThemeBroadcast(() => mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault())
})

app.on('window-all-closed', () => {
  clearSessionOnQuit()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  clearSessionOnQuit()
})
