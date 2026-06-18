// Synthesized typewriter sounds (no audio asset bundled). Off by default; played
// only when settings.typewriterSound is on. A keystroke is a percussive
// mechanical "thock" — a filtered noise strike (typebar) plus a short low body
// thump — and Enter rings the carriage-return bell.
let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null

function audio(): AudioContext | null {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = ctx ?? new AC()
    if (!noise) {
      // ~80ms of white noise, reused for every strike.
      const len = Math.floor(ctx.sampleRate * 0.08)
      noise = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = noise.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    }
    return ctx
  } catch {
    return null
  }
}

/** A single mechanical keystroke. */
export function playKeyClick(): void {
  const c = audio()
  if (!c || !noise) return
  const t = c.currentTime
  const out = c.createGain()
  out.gain.value = 0.6
  out.connect(c.destination)

  // Typebar strike: a short, bright noise transient with a fast attack.
  const src = c.createBufferSource()
  src.buffer = noise
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1700 + Math.random() * 700
  bp.Q.value = 0.9
  const ng = c.createGain()
  ng.gain.setValueAtTime(0.0001, t)
  ng.gain.exponentialRampToValueAtTime(0.25, t + 0.002)
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
  src.connect(bp).connect(ng).connect(out)
  src.start(t)
  src.stop(t + 0.08)

  // Body: a quick low thump for the key bottoming out.
  const osc = c.createOscillator()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(180 + Math.random() * 40, t)
  osc.frequency.exponentialRampToValueAtTime(90, t + 0.04)
  const og = c.createGain()
  og.gain.setValueAtTime(0.16, t)
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.055)
  osc.connect(og).connect(out)
  osc.start(t)
  osc.stop(t + 0.07)
}

/** Carriage-return bell, on Enter. */
export function playReturn(): void {
  const c = audio()
  if (!c) return
  const t = c.currentTime
  const out = c.createGain()
  out.gain.value = 0.32
  out.connect(c.destination)
  const partials: Array<[number, number]> = [
    [1380, 0.13],
    [2080, 0.05]
  ]
  for (const [f, g] of partials) {
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    const gg = c.createGain()
    gg.gain.setValueAtTime(g, t)
    gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
    o.connect(gg).connect(out)
    o.start(t)
    o.stop(t + 0.4)
  }
}
