export const COLS = 17
export const ROWS = 17
export const START_LENGTH = 4

export type Point = { x: number; y: number }
export type Dir = 'up' | 'down' | 'left' | 'right'
export type WallMode = 'solid' | 'wrap'
export type Status = 'playing' | 'dead' | 'won'

export type GameState = {
  snake: Point[]
  dir: Dir
  queued: Dir[]
  food: Point
  score: number
  status: Status
  growing: boolean
  prevTail: Point | null
  tick: number
}

const DELTA: Record<Dir, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

export function opposite(dir: Dir): Dir {
  if (dir === 'up') return 'down'
  if (dir === 'down') return 'up'
  if (dir === 'left') return 'right'
  return 'left'
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function tickInterval(score: number): number {
  return Math.max(72, 156 - Math.floor(score / 2) * 8)
}

export function paceLabel(score: number): string {
  if (score < 4) return 'Unhurried'
  if (score < 10) return 'Awake'
  if (score < 18) return 'Hungry'
  return 'Relentless'
}

function keyOf(p: Point): string {
  return `${p.x},${p.y}`
}

export function spawnFood(snake: Point[], rng: () => number, head: Point): Point {
  const taken = new Set(snake.map(keyOf))
  const open: Point[] = []
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!taken.has(`${x},${y}`)) open.push({ x, y })
    }
  }
  if (open.length === 0) return { x: -1, y: -1 }
  const far = open.filter((cell) => Math.abs(cell.x - head.x) + Math.abs(cell.y - head.y) > 3)
  const pool = far.length > 0 ? far : open
  const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length))
  return pool[index]!
}

export function createGame(rng: () => number = Math.random): GameState {
  const midY = Math.floor(ROWS / 2)
  const headX = Math.floor(COLS / 2)
  const snake: Point[] = []
  for (let i = 0; i < START_LENGTH; i++) snake.push({ x: headX - i, y: midY })
  return {
    snake,
    dir: 'right',
    queued: [],
    food: spawnFood(snake, rng, snake[0]!),
    score: 0,
    status: 'playing',
    growing: false,
    prevTail: null,
    tick: 0,
  }
}

export function queueDir(state: GameState, next: Dir): GameState {
  if (state.status !== 'playing') return state
  const last = state.queued.length > 0 ? state.queued[state.queued.length - 1]! : state.dir
  if (next === last || next === opposite(last)) return state
  if (state.queued.length >= 2) return state
  return { ...state, queued: [...state.queued, next] }
}

export function step(state: GameState, mode: WallMode, rng: () => number = Math.random): GameState {
  if (state.status !== 'playing') return state

  let dir = state.dir
  let queued = state.queued
  if (queued.length > 0) {
    dir = queued[0]!
    queued = queued.slice(1)
  }

  const head = state.snake[0]!
  let x = head.x + DELTA[dir].x
  let y = head.y + DELTA[dir].y

  if (mode === 'wrap') {
    x = (x + COLS) % COLS
    y = (y + ROWS) % ROWS
  } else if (x < 0 || y < 0 || x >= COLS || y >= ROWS) {
    return { ...state, dir, queued, status: 'dead', growing: false }
  }

  const willEat = x === state.food.x && y === state.food.y
  const body = willEat ? state.snake : state.snake.slice(0, -1)
  if (body.some((part) => part.x === x && part.y === y)) {
    return { ...state, dir, queued, status: 'dead', growing: false }
  }

  const nextHead = { x, y }
  const snake = [nextHead, ...body]
  const prevTail = willEat ? null : (state.snake[state.snake.length - 1] ?? null)
  const tick = state.tick + 1

  if (!willEat) {
    return { ...state, snake, dir, queued, growing: false, prevTail, tick }
  }

  const food = spawnFood(snake, rng, nextHead)
  if (food.x < 0) {
    return {
      ...state,
      snake,
      dir,
      queued,
      food,
      score: state.score + 1,
      status: 'won',
      growing: true,
      prevTail: null,
      tick,
    }
  }

  return {
    ...state,
    snake,
    dir,
    queued,
    food,
    score: state.score + 1,
    growing: true,
    prevTail: null,
    tick,
  }
}

function lerpAxis(from: number, to: number, t: number, span: number, wrap: boolean): number {
  let delta = to - from
  if (wrap) {
    if (delta > span / 2) delta -= span
    if (delta < -span / 2) delta += span
  }
  return from + delta * t
}

function lerpPoint(from: Point, to: Point, t: number, walls: WallMode): Point {
  const wrap = walls === 'wrap'
  return {
    x: lerpAxis(from.x, to.x, t, COLS, wrap),
    y: lerpAxis(from.y, to.y, t, ROWS, wrap),
  }
}

/** Grid-space points from head to tail, including the in-between slide of a tick. */
export function bodyPoints(
  state: Pick<GameState, 'snake' | 'growing' | 'prevTail'>,
  t: number,
  walls: WallMode,
): Point[] {
  const { snake, growing, prevTail } = state
  if (snake.length === 0) return []
  const points: Point[] = []
  const push = (point: Point) => {
    const last = points[points.length - 1]
    if (last && last.x === point.x && last.y === point.y) return
    points.push(point)
  }

  const head = snake[0]!
  push(lerpPoint(snake[1] ?? head, head, t, walls))

  for (let i = 1; i < snake.length - 1; i++) {
    if (growing) push(snake[i]!)
    else push(lerpPoint(snake[i + 1]!, snake[i]!, t, walls))
  }

  const tail = snake[snake.length - 1]!
  if (growing || !prevTail) push(tail)
  else push(lerpPoint(prevTail, tail, t, walls))

  return points
}

const DIRS: Dir[] = ['up', 'down', 'left', 'right']

function foodDistance(head: Point, food: Point, mode: WallMode): number {
  const dx = Math.abs(head.x - food.x)
  const dy = Math.abs(head.y - food.y)
  if (mode === 'wrap') return Math.min(dx, COLS - dx) + Math.min(dy, ROWS - dy)
  return dx + dy
}

/** A short-sighted preview snake. It prefers fruit and refuses an obvious crash. */
export function chooseDir(state: GameState, mode: WallMode, rng: () => number): Dir {
  const last = state.queued.length > 0 ? state.queued[state.queued.length - 1]! : state.dir
  let best: Dir | null = null
  let bestScore = Infinity

  for (const dir of DIRS) {
    if (dir === opposite(last)) continue
    const trial = step({ ...state, queued: [dir] }, mode, rng)
    if (trial.status === 'dead') continue
    const head = trial.snake[0]!
    const toward = foodDistance(head, state.food, mode)
    const score = toward + (dir === state.dir ? 0 : 0.15)
    if (score < bestScore) {
      bestScore = score
      best = dir
    }
  }

  return best ?? state.dir
}
