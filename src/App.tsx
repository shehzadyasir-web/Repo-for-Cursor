import { useEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { Dir, WallMode } from './game/logic.ts'
import { useSnakeGame, type Phase } from './game/useSnakeGame.ts'

function Chevron({ dir }: { dir: Dir }) {
  const rotation = { up: 0, right: 90, down: 180, left: 270 }[dir]
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${rotation}deg)` }}>
      <path
        d="M6 14.5 12 8.5l6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function primaryLabel(phase: Phase): string {
  if (phase === 'paused') return 'Resume'
  if (phase === 'over' || phase === 'won') return 'Again'
  return 'Play'
}

function announce(phase: Phase, score: number, newBest: boolean): string {
  if (phase === 'ready') return 'Ready. Press Play to start.'
  if (phase === 'playing') return `Playing. Score ${score}.`
  if (phase === 'paused') return `Paused. Score ${score}.`
  if (phase === 'won') return `The board is full. Score ${score}.`
  return `Run over. Score ${score}.${newBest ? ' New best.' : ''}`
}

export default function App() {
  const game = useSnakeGame()
  const { view } = game
  const actionRef = useRef<HTMLButtonElement>(null)
  const locked = view.phase === 'playing' || view.phase === 'paused'
  const showVeil = view.phase !== 'playing'

  useEffect(() => {
    if (view.phase === 'paused' || view.phase === 'over' || view.phase === 'won') {
      actionRef.current?.focus()
    }
  }, [view.phase])

  const primary = () => {
    if (view.phase === 'paused' || view.phase === 'playing') game.togglePause()
    else game.start()
  }

  const walls = (mode: WallMode) => game.setWalls(mode)

  const steer = (event: ReactPointerEvent<HTMLButtonElement>, dir: Dir) => {
    event.preventDefault()
    game.turn(dir)
  }

  const keySteer = (event: ReactMouseEvent<HTMLButtonElement>, dir: Dir) => {
    if (event.detail === 0) game.turn(dir)
  }

  return (
    <div className="app">
      <header className="top">
        <div>
          <p className="kicker">A 2D board</p>
          <h1>Snake</h1>
        </div>
        <p className="lede">Eat, grow, and keep your head.</p>
      </header>

      <section className="stats" aria-label="Score">
        <div className="stat">
          <span>Score</span>
          <strong key={view.score}>{view.score}</strong>
          <em>{view.pace}</em>
        </div>
        <div className="stat">
          <span>Best</span>
          <strong>{view.best}</strong>
          <em>Saved here</em>
        </div>
        <div className="stat">
          <span>Length</span>
          <strong>{view.length}</strong>
          <em>{view.length === 1 ? 'cell' : 'cells'}</em>
        </div>
      </section>

      <p className="keys">Arrows or WASD to turn · Space pauses · Swipe the board</p>
      <p className="sr-only" aria-live="polite">
        {announce(view.phase, view.score, view.newBest)}
      </p>

      <main className="stage">
        <section
          className="board"
          aria-label="Snake board"
          onPointerDown={game.onPointerDown}
          onPointerUp={game.onPointerUp}
          onPointerCancel={game.onPointerCancel}
          onContextMenu={(event) => event.preventDefault()}
        >
          <canvas ref={game.canvasRef} aria-hidden="true" />
          {game.broken && (
            <div className="veil">
              <div className="card">
                <p className="eyebrow">Can’t draw</p>
                <h2>This browser has no canvas.</h2>
                <p>Snake needs a canvas to put the board on the page.</p>
              </div>
            </div>
          )}
          {showVeil && !game.broken && (
            <div className={`veil ${view.phase === 'ready' ? 'bottom' : ''}`}>
              <div className="card" onPointerDown={(event) => event.stopPropagation()}>
                {view.phase === 'ready' && (
                  <>
                    <p className="eyebrow">The board is open</p>
                    <h2>Whenever you are</h2>
                    <p>A wall or your own body ends the run. Fruit makes you longer, and a little faster.</p>
                  </>
                )}
                {view.phase === 'paused' && (
                  <>
                    <p className="eyebrow">Held</p>
                    <h2>Paused</h2>
                    <p>The fruit will keep. Score {view.score}.</p>
                  </>
                )}
                {view.phase === 'over' && (
                  <>
                    <p className="eyebrow">{view.newBest ? 'New best' : 'Run over'}</p>
                    <h2 className="score-end">{view.score}</h2>
                    <p>
                      {view.newBest
                        ? 'That mark stays on this device.'
                        : view.best === 0
                          ? 'No mark yet. The next run can leave one.'
                          : `Best on this device is ${view.best}.`}
                    </p>
                  </>
                )}
                {view.phase === 'won' && (
                  <>
                    <p className="eyebrow">Full board</p>
                    <h2>Nothing left</h2>
                    <p>Every cell is snake. Score {view.score}.</p>
                  </>
                )}
                <button ref={actionRef} type="button" className="btn" onClick={primary}>
                  {primaryLabel(view.phase)}
                </button>
              </div>
            </div>
          )}
        </section>

        <div className="pad" role="group" aria-label="Touch controls">
          <span />
          <button type="button" aria-label="Turn up" onPointerDown={(event) => steer(event, 'up')} onClick={(event) => keySteer(event, 'up')}>
            <Chevron dir="up" />
          </button>
          <span />
          <button type="button" aria-label="Turn left" onPointerDown={(event) => steer(event, 'left')} onClick={(event) => keySteer(event, 'left')}>
            <Chevron dir="left" />
          </button>
          <button type="button" className="center" aria-label={primaryLabel(view.phase)} onClick={primary}>
            {view.phase === 'playing' ? 'Pause' : primaryLabel(view.phase)}
          </button>
          <button type="button" aria-label="Turn right" onPointerDown={(event) => steer(event, 'right')} onClick={(event) => keySteer(event, 'right')}>
            <Chevron dir="right" />
          </button>
          <span />
          <button type="button" aria-label="Turn down" onPointerDown={(event) => steer(event, 'down')} onClick={(event) => keySteer(event, 'down')}>
            <Chevron dir="down" />
          </button>
          <span />
        </div>

        <aside className="panel">
          {view.phase === 'playing' && (
            <button type="button" className="btn panel-pause" onClick={primary}>
              Pause
            </button>
          )}
          <section>
            <h2>Edges</h2>
            <div className="segment" role="group" aria-label="Edges">
              <button
                type="button"
                aria-pressed={view.walls === 'solid'}
                disabled={locked}
                onClick={() => walls('solid')}
              >
                Solid
              </button>
              <button
                type="button"
                aria-pressed={view.walls === 'wrap'}
                disabled={locked}
                onClick={() => walls('wrap')}
              >
                Wrap
              </button>
            </div>
            <p className="hint">
              {locked
                ? 'The edge rule changes on the next run.'
                : view.walls === 'solid'
                  ? 'Hitting the edge ends the run.'
                  : 'Leaving one side brings you in on the other.'}
            </p>
          </section>

          <section>
            <h2>How to turn</h2>
            <ul className="help">
              <li>Arrows or WASD steer.</li>
              <li>Space or Escape pauses. M mutes.</li>
              <li>Swipe the board, or use the pad. Tap the board to pause.</li>
            </ul>
            <button
              type="button"
              className="btn ghost"
              aria-pressed={view.sound}
              onClick={game.toggleSound}
            >
              {view.sound ? 'Sound on' : 'Sound off'}
            </button>
          </section>
        </aside>
      </main>

      <footer>Best score, sound, and edges stay in this browser.</footer>
    </div>
  )
}
