import os from 'node:os'
import type { CatalogEntry } from '@shared/models'
import type { HardwareProfile, ModelFit } from '@shared/ipc-contract'

export function getHardwareProfile(): HardwareProfile {
  const totalRamGB = Math.round((os.totalmem() / 1024 ** 3) * 10) / 10
  const rawArch = os.arch()
  const arch: HardwareProfile['arch'] =
    rawArch === 'arm64' ? 'arm64' : rawArch === 'x64' ? 'x64' : 'other'
  const cpu = os.cpus()?.[0]?.model ?? 'Unknown CPU'
  return { totalRamGB, arch, cpuModel: cpu }
}

export interface Classification {
  fit: ModelFit
  reason: string
}

export function classifyModel(model: CatalogEntry, profile: HardwareProfile): Classification {
  // Intel Macs run local models much slower than Apple Silicon. Bump the
  // recommended threshold up by one tier so we steer Intel users toward
  // smaller models.
  const intelPenalty = profile.arch === 'x64' ? 4 : 0
  const minNeeded = model.minRamGB + intelPenalty
  const recommended = model.recommendedRamGB + intelPenalty

  if (profile.totalRamGB < minNeeded) {
    return {
      fit: 'too-big',
      reason: `Needs ~${minNeeded} GB of RAM — your Mac has ${profile.totalRamGB} GB.`
    }
  }

  if (profile.totalRamGB < recommended) {
    const archNote = profile.arch === 'x64' ? ' on Intel Macs' : ''
    return {
      fit: 'tight',
      reason: `Will run, but may be slow${archNote}. Comfortable on ${recommended} GB+.`
    }
  }

  return {
    fit: 'ok',
    reason: `Runs comfortably on your Mac (${profile.totalRamGB} GB RAM).`
  }
}
