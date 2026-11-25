import { COLS, ROWS, bodyPoints, type GameState, type WallMode } from './logic.ts'

export type Phase = 'ready' | 'playing' | 'paused' | 'over' | 'won'

export type PaintInput = {
  state: GameState
  progress: number
  walls: WallMode
  phase: Phase
  shake: number
  time: number
  burst: { x: number; y: number; at: number } | null
  now: number
}

type Px = { x: number; y: number }

export function paint(canvas: HTMLCanvasElement, input: PaintInput): boolean {
  const rect = canvas.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return true
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const width = Math.max(1, Math.round(rect.width * dpr))
  const height = Math.max(1, Math.round(rect.height * dpr))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return false

  const inset = 16 * dpr
  const grid = Math.min(width, height) - inset * 2
  const cell = grid / COLS
  const originX = (width - grid) / 2
  const originY = (height - grid) / 2

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#241f1a'
  ctx.fillRect(0, 0, width, height)

  const sheen = ctx.createLinearGradient(0, 0, 0, height)
  sheen.addColorStop(0, 'rgba(255, 244, 220, 0.05)')
  sheen.addColorStop(0.45, 'rgba(255, 244, 220, 0)')
  ctx.fillStyle = sheen
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  if (input.shake > 0) {
    const mag = input.shake * cell * 0.18
    ctx.translate(Math.sin(input.time * 78) * mag, Math.cos(input.time * 63) * mag)
  }

  ctx.save()
  ctx.beginPath()
  ctx.rect(originX, originY, grid, grid)
  ctx.clip()

  ctx.strokeStyle = 'rgba(244, 234, 216, 0.055)'
  ctx.lineWidth = Math.max(1, dpr * 0.6)
  ctx.beginPath()
  for (let i = 0; i <= COLS; i++) {
    const x = originX + i * cell
    ctx.moveTo(x, originY)
    ctx.lineTo(x, originY + grid)
  }
  for (let i = 0; i <= ROWS; i++) {
    const y = originY + i * cell
    ctx.moveTo(originX, y)
    ctx.lineTo(originX + grid, y)
  }
  ctx.stroke()

  if (input.state.food.x >= 0) drawFood(ctx, center(input.state.food, originX, originY, cell), cell, input.time)

  const points = bodyPoints(input.state, input.progress, input.walls)
  const dead = input.phase === 'over'
  const body = dead ? '#b7ab9e' : '#f3e6cf'
  const head = dead ? '#d9d0c4' : '#fff8ee'
  const shifts =
    input.walls === 'wrap'
      ? [
          [0, 0],
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]
      : [[0, 0]]

  for (const [sx, sy] of shifts) {
    const px = points.map((point) =>
      center(point, originX + sx! * COLS * cell, originY + sy! * ROWS * cell, cell),
    )
    strokeSnake(ctx, px, cell, 'rgba(0, 0, 0, 0.28)', cell * 0.08)
    strokeSnake(ctx, px, cell, body, 0)
    drawHead(ctx, px, cell, head, input.state.dir, dead)
  }

  if (input.burst) {
    const age = input.now - input.burst.at
    if (age >= 0 && age < 320) drawBurst(ctx, center(input.burst, originX, originY, cell), cell, age / 320)
  }

  ctx.restore()

  ctx.strokeStyle = 'rgba(244, 234, 216, 0.14)'
  ctx.lineWidth = Math.max(1, dpr)
  ctx.strokeRect(originX + ctx.lineWidth, originY + ctx.lineWidth, grid - ctx.lineWidth * 2, grid - ctx.lineWidth * 2)
  ctx.restore()

  if (input.phase === 'over') {
    ctx.fillStyle = 'rgba(70, 18, 10, 0.22)'
    ctx.fillRect(0, 0, width, height)
  } else if (input.phase === 'paused') {
    ctx.fillStyle = 'rgba(18, 16, 14, 0.2)'
    ctx.fillRect(0, 0, width, height)
  }

  return true
}

function center(point: { x: number; y: number }, originX: number, originY: number, cell: number): Px {
  return {
    x: originX + (point.x + 0.5) * cell,
    y: originY + (point.y + 0.5) * cell,
  }
}

function drawFood(ctx: CanvasRenderingContext2D, at: Px, cell: number, time: number) {
  const radius = cell * 0.23 * (1 + 0.045 * Math.sin(time * 3.2))
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)'
  ctx.beginPath()
  ctx.ellipse(at.x, at.y + radius * 0.95, radius * 0.72, radius * 0.28, 0, 0, Math.PI * 2)
  ctx.fill()

  const fruit = ctx.createRadialGradient(at.x - radius * 0.35, at.y - radius * 0.4, radius * 0.15, at.x, at.y, radius)
  fruit.addColorStop(0, '#ffd0c2')
  fruit.addColorStop(0.45, '#ef6a4c')
  fruit.addColorStop(1, '#b43322')
  ctx.fillStyle = fruit
  ctx.beginPath()
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2)
  ctx.fill()

  ctx.save()
  ctx.translate(at.x + radius * 0.15, at.y - radius * 0.95)
  ctx.rotate(-0.6)
  ctx.fillStyle = '#6f8f55'
  ctx.beginPath()
  ctx.ellipse(0, 0, radius * 0.42, radius * 0.2, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function strokeSnake(ctx: CanvasRenderingContext2D, points: Px[], cell: number, color: string, drop: number) {
  if (points.length === 0) return
  ctx.save()
  ctx.translate(0, drop)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = cell * 0.74
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  traceRuns(ctx, points, cell)
  ctx.restore()
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  points: Px[],
  cell: number,
  color: string,
  dir: GameState['dir'],
  dead: boolean,
) {
  const head = points[0]
  if (!head) return
  const radius = cell * 0.46
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(head.x, head.y, radius, 0, Math.PI * 2)
  ctx.fill()

  const forward = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[dir]
  const side = { x: -forward.y, y: forward.x }
  const eye = Math.max(cell * 0.085, 1.6)
  ctx.fillStyle = dead ? '#5c564e' : '#2a2118'
  for (const sign of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(
      head.x + forward.x * cell * 0.18 + side.x * cell * 0.15 * sign,
      head.y + forward.y * cell * 0.18 + side.y * cell * 0.15 * sign,
      eye,
      0,
      Math.PI * 2,
    )
    ctx.fill()
  }
}

function traceRuns(ctx: CanvasRenderingContext2D, points: Px[], cell: number) {
  let run: Px[] = []
  const flush = () => {
    if (run.length === 0) return
    trace(ctx, run)
    if (run.length === 1) ctx.fill()
    else ctx.stroke()
    run = []
  }
  for (const point of points) {
    const prev = run[run.length - 1]
    if (prev && Math.hypot(point.x - prev.x, point.y - prev.y) > cell * 1.75) flush()
    run.push(point)
  }
  flush()
}

function trace(ctx: CanvasRenderingContext2D, points: Px[]) {
  ctx.beginPath()
  const first = points[0]!
  if (points.length === 1) {
    ctx.arc(first.x, first.y, ctx.lineWidth / 2, 0, Math.PI * 2)
    return
  }
  ctx.moveTo(first.x, first.y)
  if (points.length === 2) {
    ctx.lineTo(points[1]!.x, points[1]!.y)
    return
  }
  for (let i = 1; i < points.length - 1; i++) {
    const current = points[i]!
    const next = points[i + 1]!
    ctx.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2)
  }
  const last = points[points.length - 1]!
  ctx.lineTo(last.x, last.y)
}

function drawBurst(ctx: CanvasRenderingContext2D, at: Px, cell: number, progress: number) {
  ctx.strokeStyle = `rgba(225, 90, 58, ${1 - progress})`
  ctx.lineWidth = Math.max(1.5, cell * 0.06)
  ctx.beginPath()
  ctx.arc(at.x, at.y, cell * (0.2 + progress * 0.85), 0, Math.PI * 2)
  ctx.stroke()
}
