import { contextBridge, ipcRenderer } from 'electron'
import type { Api, Decision, ThemeMode, UnlockResult, VaultStatus } from '@shared/ipc-contract'

const api: Api = {
  vault: {
    status: (): Promise<VaultStatus> => ipcRenderer.invoke('vault:status'),
    create: (pin: string): Promise<UnlockResult> => ipcRenderer.invoke('vault:create', pin),
    unlock: (pin: string): Promise<UnlockResult> => ipcRenderer.invoke('vault:unlock', pin),
    lock: (): Promise<void> => ipcRenderer.invoke('vault:lock'),
    changePin: (currentPin, newPin) =>
      ipcRenderer.invoke('vault:change-pin', currentPin, newPin),
    setTouchIdEnabled: (enabled, pin) =>
      ipcRenderer.invoke('vault:set-touchid', enabled, pin),
    enableTouchIdCurrentSession: () =>
      ipcRenderer.invoke('vault:enable-touchid-current-session'),
    unlockWithTouchId: () => ipcRenderer.invoke('vault:unlock-touchid')
  },
  decisions: {
    list: (): Promise<Decision[]> => ipcRenderer.invoke('decisions:list'),
    create: (input) => ipcRenderer.invoke('decisions:create', input),
    review: (input) => ipcRenderer.invoke('decisions:review', input)
  },
  analytics: {
    summary: () => ipcRenderer.invoke('analytics:summary'),
    calibration: () => ipcRenderer.invoke('analytics:calibration'),
    categoryStats: () => ipcRenderer.invoke('analytics:category-stats'),
    processOutcome: () => ipcRenderer.invoke('analytics:process-outcome'),
    cadence: (days: number) => ipcRenderer.invoke('analytics:cadence', days)
  },
  theme: {
    get: (): Promise<ThemeMode> => ipcRenderer.invoke('theme:get'),
    set: (mode: ThemeMode): Promise<void> => ipcRenderer.invoke('theme:set', mode),
    onSystemChange: (cb) => {
      const listener = (_: unknown, isDark: boolean) => cb(isDark)
      ipcRenderer.on('theme:system-changed', listener)
      return () => ipcRenderer.removeListener('theme:system-changed', listener)
    }
  },
  app: {
    version: (): Promise<string> => ipcRenderer.invoke('app:version'),
    platform: (): Promise<string> => ipcRenderer.invoke('app:platform')
  }
}

contextBridge.exposeInMainWorld('api', api)
