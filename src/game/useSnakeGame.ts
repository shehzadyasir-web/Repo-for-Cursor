import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { playDie, playEat, playStart, playWin, unlockAudio } from './audio.ts'
import type { Phase } from './draw.ts'
import { paint } from './draw.ts'
import {
  START_LENGTH,
  chooseDir,
  createGame,
  mulberry32,
  paceLabel,
  queueDir,
  step,
  tickInterval,
  type Dir,
  type GameState,
  type WallMode,
} from './logic.ts'
import { readBest, readSound, readWalls, writeBest, writeSound, writeWalls } from './storage.ts'

export type { Phase }

export type View = {
  phase: Phase
  score: number
  best: number
  length: number
  pace: string
  walls: WallMode
  sound: boolean
  newBest: boolean
}

type Burst = { x: number; y: number; at: number }

type Session = {
  player: GameState
  attract: GameState
  phase: Phase
  walls: WallMode
  sound: boolean
  best: number
  markAtStart: number
  newBest: boolean
  lastTick: number
  attractTick: number
  frozen: number
  shakeUntil: number
  burst: Burst | null
  rng: () => number
  attractRng: () => number
  pointer: { x: number; y: number; id: number } | null
  reduce: boolean
  canvasFailed: boolean
}

const ATTRACT_MS = 188

function loadSession(): Session {
  const now = typeof performance === 'undefined' ? 0 : performance.now()
  const attractRng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0)
  const best = readBest()
  return {
    player: createGame(),
    attract: createGame(attractRng),
    phase: 'ready',
    walls: readWalls(),
    sound: readSound(),
    best,
    markAtStart: best,
    newBest: false,
    lastTick: now,
    attractTick: now,
    frozen: 1,
    shakeUntil: 0,
    burst: null,
    rng: Math.random,
    attractRng,
    pointer: null,
    reduce:
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    canvasFailed: false,
  }
}

function toView(session: Session): View {
  const idle = session.phase === 'ready'
  const score = idle ? 0 : session.player.score
  return {
    phase: session.phase,
    score,
    best: session.best,
    length: idle ? START_LENGTH : session.player.snake.length,
    pace: paceLabel(score),
    walls: session.walls,
    sound: session.sound,
    newBest: session.newBest && (session.phase === 'over' || session.phase === 'won'),
  }
}

function initialView(): View {
  return {
    phase: 'ready',
    score: 0,
    best: readBest(),
    length: START_LENGTH,
    pace: paceLabel(0),
    walls: readWalls(),
    sound: readSound(),
    newBest: false,
  }
}

type Api = {
  start: (dir?: Dir) => void
  turn: (dir: Dir) => void
  togglePause: () => void
  setWalls: (walls: WallMode) => void
  toggleSound: () => void
}

function keyToDir(key: string): Dir | null {
  if (key === 'ArrowUp' || key === 'w' || key === 'W') return 'up'
  if (key === 'ArrowDown' || key === 's' || key === 'S') return 'down'
  if (key === 'ArrowLeft' || key === 'a' || key === 'A') return 'left'
  if (key === 'ArrowRight' || key === 'd' || key === 'D') return 'right'
  return null
}

function progressOf(current: Session, now: number) {
  if (current.reduce) return 1
  if (current.phase === 'paused' || current.phase === 'over' || current.phase === 'won') return current.frozen
  const interval = current.phase === 'ready' ? ATTRACT_MS : tickInterval(current.player.score)
  const since = current.phase === 'ready' ? current.attractTick : current.lastTick
  return Math.min(1, Math.max(0, (now - since) / interval))
}

export function useSnakeGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sessionRef = useRef<Session | null>(null)
  const apiRef = useRef<Api>({
    start() {},
    turn() {},
    togglePause() {},
    setWalls() {},
    toggleSound() {},
  })
  const [view, setView] = useState<View>(initialView)
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    const current = sessionRef.current ?? loadSession()
    sessionRef.current = current
    const publish = () => setView(toView(current))

    const start = (dir?: Dir) => {
      if (current.phase === 'playing') return
      unlockAudio()
      let player = createGame(current.rng)
      if (dir) player = queueDir(player, dir)
      current.player = player
      current.phase = 'playing'
      current.lastTick = performance.now()
      current.frozen = 0
      current.newBest = false
      current.markAtStart = current.best
      current.burst = null
      current.shakeUntil = 0
      if (current.sound) playStart()
      publish()
    }

    const togglePause = () => {
      const now = performance.now()
      if (current.phase === 'playing') {
        current.frozen = progressOf(current, now)
        current.phase = 'paused'
        publish()
        return
      }
      if (current.phase === 'paused') {
        const interval = tickInterval(current.player.score)
        current.lastTick = now - current.frozen * interval
        current.phase = 'playing'
        publish()
        return
      }
      start()
    }

    const turn = (dir: Dir) => {
      unlockAudio()
      if (current.phase === 'ready') {
        start(dir)
        return
      }
      if (current.phase === 'paused') {
        const interval = tickInterval(current.player.score)
        current.lastTick = performance.now() - current.frozen * interval
        current.phase = 'playing'
        current.player = queueDir(current.player, dir)
        publish()
        return
      }
      if (current.phase !== 'playing') return
      current.player = queueDir(current.player, dir)
    }

    const setWalls = (walls: WallMode) => {
      if (current.phase === 'playing' || current.phase === 'paused') return
      current.walls = walls
      writeWalls(walls)
      current.attract = createGame(current.attractRng)
      current.attractTick = performance.now()
      publish()
    }

    const toggleSound = () => {
      current.sound = !current.sound
      writeSound(current.sound)
      unlockAudio()
      if (current.sound) playStart()
      publish()
    }

    apiRef.current = { start, turn, togglePause, setWalls, toggleSound }

    let frame = 0
    const loop = (now: number) => {
      if (!document.hidden && current.phase === 'ready' && now - current.attractTick >= ATTRACT_MS) {
        const dir = chooseDir(current.attract, current.walls, current.attractRng)
        const next = step({ ...current.attract, queued: [dir] }, current.walls, current.attractRng)
        current.attract = next.status === 'playing' ? next : createGame(current.attractRng)
        current.attractTick = now
      }

      if (!document.hidden && current.phase === 'playing' && now - current.lastTick >= tickInterval(current.player.score)) {
        const prevFood = current.player.food
        const prevScore = current.player.score
        const next = step(current.player, current.walls, current.rng)
        current.player = next
        current.lastTick = now
        if (next.status !== 'playing') {
          current.phase = next.status === 'won' ? 'won' : 'over'
          current.frozen = 1
          current.shakeUntil = next.status === 'won' ? 0 : now + 260
          if (next.score > current.markAtStart) current.newBest = true
          if (next.score > current.best) {
            current.best = next.score
            writeBest(current.best)
          }
          if (current.sound) {
            if (next.status === 'won') playWin()
            else playDie()
          }
          publish()
        } else if (next.score !== prevScore) {
          current.burst = { x: prevFood.x, y: prevFood.y, at: now }
          if (next.score > current.markAtStart) current.newBest = true
          if (next.score > current.best) {
            current.best = next.score
            writeBest(current.best)
          }
          if (current.sound) playEat()
          publish()
        }
      }

      const canvas = canvasRef.current
      if (canvas) {
        const ok = paint(canvas, {
          state: current.phase === 'ready' ? current.attract : current.player,
          progress: progressOf(current, now),
          walls: current.walls,
          phase: current.phase,
          shake: Math.max(0, current.shakeUntil - now) / 260,
          time: now / 1000,
          burst: current.phase === 'ready' ? null : current.burst,
          now,
        })
        if (!ok && !current.canvasFailed) {
          current.canvasFailed = true
          setBroken(true)
        }
      }

      frame = requestAnimationFrame(loop)
    }

    const onKey = (event: KeyboardEvent) => {
      const key = event.key
      if ((key === ' ' || key === 'Enter') && event.target instanceof HTMLButtonElement) return
      const dir = keyToDir(key)
      if (dir) {
        event.preventDefault()
        turn(dir)
        return
      }
      if (key === ' ' || key === 'Enter' || key === 'Escape') {
        if (key === 'Escape' && current.phase !== 'playing' && current.phase !== 'paused') return
        event.preventDefault()
        togglePause()
        return
      }
      if (key === 'm' || key === 'M') toggleSound()
    }

    frame = requestAnimationFrame(loop)
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const current = sessionRef.current
    if (!current || (event.target as HTMLElement).closest('button')) return
    current.pointer = { x: event.clientX, y: event.clientY, id: event.pointerId }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const current = sessionRef.current
    if (!current) return
    const startPoint = current.pointer
    current.pointer = null
    if (!startPoint || startPoint.id !== event.pointerId) return
    const dx = event.clientX - startPoint.x
    const dy = event.clientY - startPoint.y
    if (Math.hypot(dx, dy) < 28) {
      if (current.phase === 'playing' || current.phase === 'paused') apiRef.current.togglePause()
      else if (current.phase === 'ready') apiRef.current.start()
      return
    }
    if (Math.abs(dx) > Math.abs(dy)) apiRef.current.turn(dx > 0 ? 'right' : 'left')
    else apiRef.current.turn(dy > 0 ? 'down' : 'up')
  }

  const onPointerCancel = () => {
    if (sessionRef.current) sessionRef.current.pointer = null
  }

  return {
    canvasRef,
    view,
    broken,
    start: (dir?: Dir) => apiRef.current.start(dir),
    turn: (dir: Dir) => apiRef.current.turn(dir),
    togglePause: () => apiRef.current.togglePause(),
    setWalls: (walls: WallMode) => apiRef.current.setWalls(walls),
    toggleSound: () => apiRef.current.toggleSound(),
    onPointerDown,
    onPointerUp,
    onPointerCancel,
  }
}
