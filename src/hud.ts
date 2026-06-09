export class Hud {
  private readonly scoreEl: HTMLElement
  private readonly speedEl: HTMLElement
  private readonly overlay: HTMLElement
  private readonly panel: HTMLElement
  private gameOverShown = false
  private restartHandler: (() => void) | null = null

  constructor() {
    this.scoreEl = document.getElementById('score-value') as HTMLElement
    this.speedEl = document.getElementById('speed-value') as HTMLElement
    this.overlay = document.getElementById('overlay') as HTMLElement
    this.panel = document.getElementById('panel') as HTMLElement
  }

  setScore(n: number) {
    this.scoreEl.textContent = String(n)
  }

  setSpeed(s: number) {
    this.speedEl.textContent = s.toFixed(0)
  }

  /** Register a callback invoked when the user taps the visible Restart / Start button. */
  onRestartClick(handler: () => void) {
    this.restartHandler = handler
  }

  showStart() {
    this.gameOverShown = false
    this.panel.innerHTML = `
      <h1>Cube Runner</h1>
      <p class="start-hint kbd">Press <kbd>&larr;</kbd> <kbd>&rarr;</kbd> or <kbd>A</kbd> <kbd>D</kbd> to start</p>
      <p class="start-hint touch">Tap left / right to start, or tap center to jump</p>
      <button class="btn" data-no-input type="button">Start</button>
    `
    this.bindButton()
    this.overlay.classList.add('visible')
  }

  hide() {
    this.overlay.classList.remove('visible')
    this.gameOverShown = false
  }

  showGameOver(finalScore: number) {
    if (this.gameOverShown) return
    this.gameOverShown = true
    this.panel.innerHTML = `
      <h1>Cube Runner</h1>
      <h2>Game Over</h2>
      <p>Final score</p>
      <div class="final">${finalScore}</div>
      <p class="start-hint kbd">Press <kbd>R</kbd> to restart</p>
      <p class="start-hint touch">Tap below or swipe up to restart</p>
      <button class="btn" data-no-input type="button">Restart</button>
    `
    this.bindButton()
    this.overlay.classList.add('visible')
  }

  private bindButton() {
    const btn = this.panel.querySelector<HTMLButtonElement>('button.btn')
    if (btn) {
      // Prevent the global touch/click handler in input.ts from also firing
      // (data-no-input is checked there) and avoid double-trigger.
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        e.preventDefault()
        this.restartHandler?.()
      })
    }
  }
}
