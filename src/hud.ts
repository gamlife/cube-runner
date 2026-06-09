export class Hud {
  private readonly scoreEl: HTMLElement
  private readonly speedEl: HTMLElement
  private readonly overlay: HTMLElement
  private readonly panel: HTMLElement
  private gameOverShown = false

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

  showStart() {
    this.gameOverShown = false
    this.panel.innerHTML = `
      <h1>Cube Runner</h1>
      <p class="start-hint">Press <kbd>&larr;</kbd> <kbd>&rarr;</kbd> or <kbd>A</kbd> <kbd>D</kbd> to start</p>
    `
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
      <p class="start-hint">Press <kbd>R</kbd> to restart</p>
    `
    this.overlay.classList.add('visible')
  }
}
