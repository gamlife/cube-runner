/**
 * Procedural audio using Web Audio API.
 * - SFX: short envelope-shaped tones (jump, hit, coin, level-up, lane-switch).
 * - Music: looping arpeggio whose scale + tempo depend on the current level.
 *
 * Browsers require a user gesture before audio can play. Call `unlock()` on the
 * first pointerdown/keydown/touchstart to create + resume the AudioContext.
 */

interface SfxSpec {
  type: OscillatorType
  freq: number
  freqEnd?: number
  duration: number
  attack: number
  release: number
  volume: number
}

const SFX: Record<string, SfxSpec> = {
  jump: { type: 'sine', freq: 320, freqEnd: 720, duration: 0.16, attack: 0.005, release: 0.14, volume: 0.22 },
  land: { type: 'triangle', freq: 180, freqEnd: 90, duration: 0.08, attack: 0.001, release: 0.07, volume: 0.15 },
  coin: { type: 'square', freq: 880, freqEnd: 1320, duration: 0.1, attack: 0.002, release: 0.09, volume: 0.16 },
  hit: { type: 'sawtooth', freq: 220, freqEnd: 60, duration: 0.4, attack: 0.002, release: 0.35, volume: 0.32 },
  lane: { type: 'sine', freq: 540, duration: 0.05, attack: 0.001, release: 0.05, volume: 0.1 },
  levelup: { type: 'triangle', freq: 523, duration: 0.5, attack: 0.01, release: 0.45, volume: 0.22 },
}

export class Audio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicGain: GainNode | null = null
  private sfxGain: GainNode | null = null
  private musicTimer: number | null = null
  private musicStep = 0
  private musicRoot = 261.63
  private musicScale: number[] = [0, 2, 4, 7, 9]
  private musicBpm = 120
  private unlocked = false

  /** Call on the first user gesture to satisfy iOS audio autoplay policy. */
  unlock() {
    if (this.unlocked) return
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0.7
    this.master.connect(ctx.destination)
    this.musicGain = ctx.createGain()
    this.musicGain.gain.value = 0.18
    this.musicGain.connect(this.master)
    this.sfxGain = ctx.createGain()
    this.sfxGain.gain.value = 1.0
    this.sfxGain.connect(this.master)
    this.unlocked = true
  }

  setMusicTheme(root: number, scale: number[], bpm: number) {
    this.musicRoot = root
    this.musicScale = scale
    this.musicBpm = bpm
    this.musicStep = 0
  }

  startMusic() {
    if (this.musicTimer !== null) return
    if (!this.ctx || !this.musicGain) return
    const beat = 60 / this.musicBpm / 2 // eighth-notes
    const tick = () => {
      if (!this.ctx || !this.musicGain) return
      this.playMusicNote()
      this.musicTimer = window.setTimeout(tick, beat * 1000)
    }
    this.musicTimer = window.setTimeout(tick, 0)
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer)
      this.musicTimer = null
    }
  }

  setMusicEnabled(on: boolean) {
    if (this.musicGain) this.musicGain.gain.value = on ? 0.18 : 0
  }

  sfx(name: keyof typeof SFX) {
    if (!this.ctx || !this.sfxGain) return
    const spec = SFX[name]
    if (!spec) return
    const t0 = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = spec.type
    osc.frequency.setValueAtTime(spec.freq, t0)
    if (spec.freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, spec.freqEnd), t0 + spec.duration)
    }
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(spec.volume, t0 + spec.attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.duration)
    osc.connect(g)
    g.connect(this.sfxGain)
    osc.start(t0)
    osc.stop(t0 + spec.duration + 0.05)
  }

  /** Arpeggiator: plays notes from the current scale. */
  private playMusicNote() {
    if (!this.ctx || !this.musicGain) return
    const scaleLen = this.musicScale.length
    // 8-step pattern: 1-3-5-3-6-4-5-1 (root-third-fifth-...-root) with octaves
    const pattern = [0, 2, 4, 2, 0 + 7, 3, 4, 0]
    const semitones = pattern[this.musicStep % pattern.length] ?? 0
    this.musicStep++
    const oct = Math.floor(this.musicStep / 16) % 2 // drift up an octave every 8 beats
    const base = this.musicScale[semitones % scaleLen] ?? 0
    const freq = this.musicRoot * Math.pow(2, (base + (oct ? 12 : 0)) / 12)
    const t0 = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    const filt = this.ctx.createBiquadFilter()
    filt.type = 'lowpass'
    filt.frequency.value = 2200
    osc.type = 'triangle'
    osc.frequency.value = freq
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28)
    osc.connect(filt)
    filt.connect(g)
    g.connect(this.musicGain)
    osc.start(t0)
    osc.stop(t0 + 0.3)
    // Sub bass on every 4th step for groove
    if (this.musicStep % 4 === 0) {
      const sub = this.ctx.createOscillator()
      const sg = this.ctx.createGain()
      sub.type = 'sine'
      sub.frequency.value = freq / 4
      sg.gain.setValueAtTime(0.0001, t0)
      sg.gain.exponentialRampToValueAtTime(0.35, t0 + 0.005)
      sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22)
      sub.connect(sg)
      sg.connect(this.musicGain)
      sub.start(t0)
      sub.stop(t0 + 0.25)
    }
  }
}
