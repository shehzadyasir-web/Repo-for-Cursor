let ctx: AudioContext | null = null

function context(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null
  if (!ctx) ctx = new window.AudioContext()
  return ctx
}

export function unlockAudio() {
  const audio = context()
  if (audio && audio.state === 'suspended') void audio.resume()
}

function tone(freq: number, duration: number, type: OscillatorType, gain: number, slideTo?: number, when = 0) {
  const audio = context()
  if (!audio) return
  if (audio.state === 'suspended') void audio.resume()
  const start = audio.currentTime + when
  const osc = audio.createOscillator()
  const amp = audio.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), start + duration)
  amp.gain.setValueAtTime(gain, start)
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(amp)
  amp.connect(audio.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

export function playStart() {
  tone(392, 0.09, 'sine', 0.03)
  tone(523, 0.12, 'sine', 0.028, undefined, 0.07)
}

export function playEat() {
  tone(620, 0.07, 'sine', 0.035)
  tone(830, 0.1, 'sine', 0.03, undefined, 0.06)
}

export function playDie() {
  tone(196, 0.28, 'triangle', 0.04, 70)
}

export function playWin() {
  tone(523, 0.1, 'sine', 0.03)
  tone(659, 0.1, 'sine', 0.03, undefined, 0.09)
  tone(784, 0.16, 'sine', 0.032, undefined, 0.18)
}
