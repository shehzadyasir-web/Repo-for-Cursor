import type { WallMode } from './logic.ts'

const BEST = 'snake-best'
const SOUND = 'snake-sound'
const WALLS = 'snake-walls'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private mode and blocked storage still leave the game playable.
  }
}

export function readBest(): number {
  const value = Number(read(BEST))
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.floor(value)
}

export function writeBest(score: number) {
  write(BEST, String(Math.max(0, Math.floor(score))))
}

export function readSound(): boolean {
  const value = read(SOUND)
  if (value === '0') return false
  if (value === '1') return true
  return true
}

export function writeSound(on: boolean) {
  write(SOUND, on ? '1' : '0')
}

export function readWalls(): WallMode {
  return read(WALLS) === 'wrap' ? 'wrap' : 'solid'
}

export function writeWalls(mode: WallMode) {
  write(WALLS, mode)
}
