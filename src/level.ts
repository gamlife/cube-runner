import { THEMES, LEVEL_THRESHOLDS, type Theme, lerpTheme } from './theme'

/**
 * Manages level progression: detects when the score crosses a threshold,
 * triggers a short "transition" state (no obstacle spawning, banner shown,
 * theme crossfade), then resumes gameplay.
 */
export class Levels {
  private currentIndex = 0
  private nextIndex = 0
  private transitionT = 0 // 0..1
  private transitioning = false
  private readonly transitionDuration = 1.6 // seconds for the crossfade
  private readonly fromTheme: Theme = { ...THEMES[0]! }
  private readonly toTheme: Theme = { ...THEMES[0]! }
  private readonly tmpTheme: Theme = { ...THEMES[0]! }
  private lastSeenLevel = 0
  private readonly onLevelChange: (newIndex: number, theme: Theme) => void
  private readonly onTransitionStart: () => void
  private readonly onTransitionEnd: () => void

  constructor(opts: {
    onLevelChange: (newIndex: number, theme: Theme) => void
    onTransitionStart: () => void
    onTransitionEnd: () => void
  }) {
    this.onLevelChange = opts.onLevelChange
    this.onTransitionStart = opts.onTransitionStart
    this.onTransitionEnd = opts.onTransitionEnd
  }

  reset() {
    this.currentIndex = 0
    this.lastSeenLevel = 0
    this.transitioning = false
    this.transitionT = 0
    Object.assign(this.fromTheme, THEMES[0])
    Object.assign(this.toTheme, THEMES[0])
  }

  /** Returns true if obstacles should spawn (false during a level transition). */
  isPaused(): boolean {
    return this.transitioning
  }

  /** Returns the current theme (interpolated mid-transition). */
  getTheme(): Theme {
    if (!this.transitioning) return this.toTheme
    return lerpTheme(this.fromTheme, this.toTheme, this.transitionT, this.tmpTheme)
  }

  getLevelIndex(): number {
    return this.currentIndex
  }

  /** Check score, possibly trigger a level transition. Call every frame. */
  check(score: number, dt: number) {
    if (this.transitioning) {
      this.transitionT += dt / this.transitionDuration
      if (this.transitionT >= 1) {
        this.transitionT = 1
        this.transitioning = false
        this.currentIndex = this.nextIndex
        this.onTransitionEnd()
      }
      return
    }

    // Find the level the player *should* be on based on score
    let target = 0
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
      if (score >= LEVEL_THRESHOLDS[i]!) target = i
    }
    target = Math.min(target, THEMES.length - 1)
    if (target !== this.lastSeenLevel && target > this.lastSeenLevel) {
      this.lastSeenLevel = target
      this.beginTransitionTo(target)
    }
  }

  private beginTransitionTo(newIndex: number) {
    Object.assign(this.fromTheme, this.getTheme())
    Object.assign(this.toTheme, THEMES[newIndex]!)
    this.nextIndex = newIndex
    this.transitioning = true
    this.transitionT = 0
    this.onTransitionStart()
    this.onLevelChange(newIndex, this.toTheme)
  }
}
