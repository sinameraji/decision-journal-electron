export interface CatalogEntry {
  id: string
  label: string
  paramCount: string
  sizeGB: number
  minRamGB: number
  recommendedRamGB: number
  description: string
  tags: string[]
}

export const MODEL_CATALOG: CatalogEntry[] = [
  {
    id: 'llama3.2:1b',
    label: 'Llama 3.2 1B',
    paramCount: '1.2B',
    sizeGB: 1.3,
    minRamGB: 4,
    recommendedRamGB: 8,
    description: 'Meta’s smallest Llama. Instant replies on any Mac from the last few years.',
    tags: ['tiny', 'fastest']
  },
  {
    id: 'gemma2:2b',
    label: 'Gemma 2 2B',
    paramCount: '2.6B',
    sizeGB: 1.6,
    minRamGB: 4,
    recommendedRamGB: 8,
    description: 'Google’s small chat model. Good quality-to-size ratio.',
    tags: ['tiny']
  },
  {
    id: 'qwen2.5:3b',
    label: 'Qwen 2.5 3B',
    paramCount: '3.1B',
    sizeGB: 1.9,
    minRamGB: 6,
    recommendedRamGB: 8,
    description: 'Strong reasoning for its size. A sensible middle choice.',
    tags: ['small']
  },
  {
    id: 'llama3.2:3b',
    label: 'Llama 3.2 3B',
    paramCount: '3.2B',
    sizeGB: 2.0,
    minRamGB: 6,
    recommendedRamGB: 8,
    description: 'A noticeable quality step up from 1B, still fast on most Macs.',
    tags: ['small', 'recommended']
  },
  {
    id: 'phi3:mini',
    label: 'Phi-3 Mini',
    paramCount: '3.8B',
    sizeGB: 2.3,
    minRamGB: 6,
    recommendedRamGB: 8,
    description: 'Microsoft’s small model. Tuned for instruction-following and reasoning.',
    tags: ['small']
  },
  {
    id: 'mistral:7b',
    label: 'Mistral 7B',
    paramCount: '7.2B',
    sizeGB: 4.4,
    minRamGB: 8,
    recommendedRamGB: 16,
    description: 'Classic mid-size chat model. Needs a Mac with comfortable RAM headroom.',
    tags: ['medium']
  },
  {
    id: 'llama3.1:8b',
    label: 'Llama 3.1 8B',
    paramCount: '8.0B',
    sizeGB: 4.7,
    minRamGB: 8,
    recommendedRamGB: 16,
    description: 'High-quality chat, closer to cloud models. Best on 16GB+ Apple Silicon.',
    tags: ['medium', 'quality']
  }
]

export function catalogEntryById(id: string): CatalogEntry | undefined {
  return MODEL_CATALOG.find((m) => m.id === id)
}
