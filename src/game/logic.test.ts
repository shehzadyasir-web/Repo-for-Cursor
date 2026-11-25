import { describe, expect, it } from 'vitest'
import {
  COLS,
  ROWS,
  bodyPoints,
  chooseDir,
  createGame,
  mulberry32,
  opposite,
  paceLabel,
  queueDir,
  spawnFood,
  step,
  tickInterval,
  type GameState,
} from './logic.ts'

function at(x: number, y: number) {
  return { x, y }
}

function playing(partial: Partial<GameState> & Pick<GameState, 'snake' | 'dir'>): GameState {
  const head = partial.snake[0]!
  return {
    queued: [],
    score: 0,
    status: 'playing',
    growing: false,
    prevTail: null,
    tick: 0,
    ...partial,
    snake: partial.snake,
    dir: partial.dir,
    food: partial.food ?? spawnFood(partial.snake, () => 0, head),
  }
}

describe('snake rules', () => {
  it('starts on the board, facing right, with fruit off the body', () => {
    const game = createGame(mulberry32(1))
    expect(game.snake).toHaveLength(4)
    expect(game.dir).toBe('right')
    expect(game.status).toBe('playing')
    for (const part of game.snake) {
      expect(part.x).toBeGreaterThanOrEqual(0)
      expect(part.x).toBeLessThan(COLS)
      expect(part.y).toBeGreaterThanOrEqual(0)
      expect(part.y).toBeLessThan(ROWS)
      expect(part).not.toEqual(game.food)
    }
  })

  it('moves one cell and remembers the tail it left', () => {
    const before = playing({
      snake: [at(3, 3), at(2, 3), at(1, 3), at(0, 3)],
      dir: 'right',
      food: at(10, 10),
    })
    const after = step(before, 'solid', () => 0)
    expect(after.status).toBe('playing')
    expect(after.snake[0]).toEqual(at(4, 3))
    expect(after.snake).toHaveLength(4)
    expect(after.prevTail).toEqual(at(0, 3))
    expect(after.growing).toBe(false)
  })

  it('grows when it eats and never drops fruit on itself', () => {
    const before = playing({
      snake: [at(3, 3), at(2, 3), at(1, 3), at(0, 3)],
      dir: 'right',
      food: at(4, 3),
    })
    const after = step(before, 'solid', mulberry32(4))
    expect(after.score).toBe(1)
    expect(after.snake).toHaveLength(5)
    expect(after.growing).toBe(true)
    expect(after.prevTail).toBeNull()
    expect(after.snake.some((part) => part.x === after.food.x && part.y === after.food.y)).toBe(false)
  })

  it('dies on a solid wall and wraps when edges are open', () => {
    const before = playing({
      snake: [at(COLS - 1, 1), at(COLS - 2, 1), at(COLS - 3, 1), at(COLS - 4, 1)],
      dir: 'right',
      food: at(1, 8),
    })
    const crashed = step(before, 'solid')
    expect(crashed.status).toBe('dead')
    expect(crashed.snake[0]).toEqual(before.snake[0])

    const wrapped = step(before, 'wrap')
    expect(wrapped.status).toBe('playing')
    expect(wrapped.snake[0]).toEqual(at(0, 1))
  })

  it('may chase its own tail, and dies on any other part of the body', () => {
    const chase = playing({
      snake: [at(2, 3), at(3, 3), at(3, 2), at(2, 2)],
      dir: 'up',
      food: at(8, 8),
    })
    const lived = step(chase, 'solid')
    expect(lived.status).toBe('playing')
    expect(lived.snake[0]).toEqual(at(2, 2))

    const bite = playing({
      snake: [at(2, 2), at(2, 3), at(3, 3), at(3, 2), at(3, 1), at(2, 1)],
      dir: 'right',
      food: at(8, 8),
    })
    expect(step(bite, 'solid').status).toBe('dead')
  })

  it('refuses to reverse and keeps two turns waiting', () => {
    let state = playing({
      snake: [at(4, 4), at(3, 4), at(2, 4), at(1, 4)],
      dir: 'right',
      food: at(8, 8),
    })
    state = queueDir(state, 'left')
    expect(state.queued).toEqual([])
    state = queueDir(state, 'up')
    state = queueDir(state, 'left')
    state = queueDir(state, 'down')
    expect(state.queued).toEqual(['up', 'left'])
    const turned = step(state, 'solid')
    expect(turned.dir).toBe('up')
    expect(turned.queued).toEqual(['left'])
  })

  it('wins when the last empty cell is eaten', () => {
    const cells: { x: number; y: number }[] = []
    for (let y = 0; y < ROWS; y++) {
      const xs = Array.from({ length: COLS }, (_, x) => x)
      if (y % 2 === 1) xs.reverse()
      for (const x of xs) cells.push({ x, y })
    }
    const food = cells.pop()!
    const snake = cells.reverse()
    const before = playing({ snake, dir: 'right', food })
    const after = step(before, 'solid', () => 0)
    expect(after.status).toBe('won')
    expect(after.snake).toHaveLength(COLS * ROWS)
    expect(after.score).toBe(1)
  })

  it('slides from the old pose to the new one', () => {
    const before = playing({
      snake: [at(3, 3), at(2, 3), at(1, 3), at(0, 3)],
      dir: 'right',
      food: at(10, 10),
    })
    const after = step(before, 'solid', () => 0)
    expect(bodyPoints(after, 0, 'solid')).toEqual(before.snake)
    expect(bodyPoints(after, 1, 'solid')).toEqual(after.snake)

    const eating = playing({
      snake: [at(3, 3), at(2, 3), at(1, 3), at(0, 3)],
      dir: 'right',
      food: at(4, 3),
    })
    const grown = step(eating, 'solid', () => 0.2)
    expect(bodyPoints(grown, 0, 'solid')).toEqual(eating.snake)
    expect(bodyPoints(grown, 1, 'solid')).toEqual(grown.snake)
  })

  it('picks a preview turn that is not a reversal', () => {
    let state = createGame(mulberry32(5))
    for (let i = 0; i < 40 && state.status === 'playing'; i++) {
      const dir = chooseDir(state, 'solid', () => 0)
      expect(dir).not.toBe(opposite(state.dir))
      state = step({ ...state, queued: [dir] }, 'solid', mulberry32(i + 3))
    }
    expect(state.tick).toBeGreaterThan(0)
  })

  it('speeds up, then holds a floor', () => {
    expect(tickInterval(0)).toBeGreaterThan(tickInterval(8))
    expect(tickInterval(80)).toBe(72)
    expect(paceLabel(0)).toBe('Unhurried')
    expect(paceLabel(20)).toBe('Relentless')
    const sample = mulberry32(9)()
    expect(sample).toBeGreaterThanOrEqual(0)
    expect(sample).toBeLessThan(1)
  })
})
