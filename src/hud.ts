export class Hud {
  private readonly scoreEl: HTMLElement
  private readonly speedEl: HTMLElement
  private readonly overlay: HTMLElement
  private readonly panel: HTMLElement
  private readonly levelBanner: HTMLElement
  private readonly levelName: HTMLElement
  private readonly popupLayer: HTMLElement
  private readonly coinEl: HTMLElement
  private readonly coinValue: HTMLElement
  private readonly comboEl: HTMLElement
  private readonly powerEl: HTMLElement
  private readonly powerName: HTMLElement
  private readonly powerTime: HTMLElement
  private readonly flashEl: HTMLElement
  private readonly milestoneEl: HTMLElement
  private gameOverShown = false
  private restartHandler: (() => void) | null = null
  private comboCount = 0
  private comboTimer: number | null = null
  private currentPower: string | null = null

  constructor() {
    this.scoreEl = document.getElementById('score-value') as HTMLElement
    this.speedEl = document.getElementById('speed-value') as HTMLElement
    this.overlay = document.getElementById('overlay') as HTMLElement
    this.panel = document.getElementById('panel') as HTMLElement
    this.levelBanner = document.getElementById('level-banner') as HTMLElement
    this.levelName = document.getElementById('level-name') as HTMLElement
    this.popupLayer = document.getElementById('popup-layer') as HTMLElement
    this.coinEl = document.getElementById('coin-counter') as HTMLElement
    this.coinValue = document.getElementById('coin-value') as HTMLElement
    this.comboEl = document.getElementById('combo') as HTMLElement
    this.powerEl = document.getElementById('power-indicator') as HTMLElement
    this.powerName = document.getElementById('power-name') as HTMLElement
    this.powerTime = document.getElementById('power-time') as HTMLElement
    this.flashEl = document.getElementById('hit-flash') as HTMLElement
    this.milestoneEl = document.getElementById('milestone') as HTMLElement
  }

  setScore(n: number) {
    this.scoreEl.textContent = String(n)
  }

  setSpeed(s: number) {
    this.speedEl.textContent = s.toFixed(0)
  }

  setCoins(n: number) {
    this.coinValue.textContent = String(n)
    this.coinEl.classList.add('bump')
    window.setTimeout(() => this.coinEl.classList.remove('bump'), 200)
  }

  /** Increment combo counter; auto-resets after a short idle. */
  bumpCombo() {
    this.comboCount++
    if (this.comboTimer !== null) window.clearTimeout(this.comboTimer)
    this.comboTimer = window.setTimeout(() => this.resetCombo(), 1500)
    if (this.comboCount >= 2) {
      this.comboEl.textContent = `×${this.comboCount} combo`
      this.comboEl.classList.add('visible')
    }
  }

  resetCombo() {
    this.comboCount = 0
    this.comboEl.textContent = ''
    this.comboEl.classList.remove('visible')
    if (this.comboTimer !== null) {
      window.clearTimeout(this.comboTimer)
      this.comboTimer = null
    }
  }

  getCombo(): number {
    return this.comboCount
  }

  setPower(kind: 'shield' | 'magnet' | 'boost', duration: number, ticking = false) {
    const label = kind.toUpperCase()
    if (this.currentPower !== kind) {
      this.currentPower = kind
      this.powerName.textContent = label
      this.powerEl.className = `visible power-${kind}`
    }
    this.powerTime.textContent = ticking ? `${duration.toFixed(1)}s` : `${duration.toFixed(0)}s`
  }

  clearPower() {
    if (this.currentPower === null) return
    this.currentPower = null
    this.powerEl.className = ''
    this.powerName.textContent = ''
    this.powerTime.textContent = ''
  }

  flashHit() {
    this.flashEl.classList.remove('show')
    void this.flashEl.offsetWidth
    this.flashEl.classList.add('show')
    window.setTimeout(() => this.flashEl.classList.remove('show'), 400)
  }

  showMilestone(score: number) {
    this.milestoneEl.textContent = `MILESTONE · ${score}`
    this.milestoneEl.classList.remove('show')
    void this.milestoneEl.offsetWidth
    this.milestoneEl.classList.add('show')
    window.setTimeout(() => this.milestoneEl.classList.remove('show'), 1200)
  }

  /** Show a floating "+N" popup at the given screen coordinates (0..1, 0..1). */
  showPopup(x: number, y: number, text: string, color: string) {
    const el = document.createElement('div')
    el.className = 'popup'
    el.textContent = text
    el.style.left = `${x * 100}%`
    el.style.top = `${y * 100}%`
    el.style.color = color
    this.popupLayer.appendChild(el)
    window.setTimeout(() => el.remove(), 1100)
  }

  showLevelBanner(name: string) {
    this.levelName.textContent = name
    this.levelBanner.classList.remove('show')
    // Force reflow so the animation can restart
    void this.levelBanner.offsetWidth
    this.levelBanner.classList.add('show')
  }

  onRestartClick(handler: () => void) {
    this.restartHandler = handler
  }

  showStart() {
    this.gameOverShown = false
    this.panel.innerHTML = `
      <h1>Cube Runner</h1>
      <p class="subtitle">Endless 3D runner</p>
      <p class="start-hint kbd">Press <kbd>&larr;</kbd> <kbd>&rarr;</kbd> or <kbd>A</kbd> <kbd>D</kbd> to start</p>
      <p class="start-hint touch">Tap <strong>◀</strong> <strong>JUMP</strong> <strong>▶</strong> to start</p>
      <button class="btn" data-no-input type="button">Start</button>
    `
    this.bindButton()
    this.overlay.classList.add('visible')
  }

  hide() {
    this.overlay.classList.remove('visible')
    this.gameOverShown = false
    this.resetCombo()
  }

  showGameOver(finalScore: number, coins: number) {
    if (this.gameOverShown) return
    this.gameOverShown = true
    this.panel.innerHTML = `
      <h1>Cube Runner</h1>
      <h2>Game Over</h2>
      <p>Final score</p>
      <div class="final">${finalScore}</div>
      <p class="stat">Coins: <strong>${coins}</strong></p>
      <p class="start-hint kbd">Press <kbd>R</kbd> to restart</p>
      <p class="start-hint touch">Tap the button or swipe up to restart</p>
      <button class="btn" data-no-input type="button">Restart</button>
    `
    this.bindButton()
    this.overlay.classList.add('visible')
  }

  private bindButton() {
    const btn = this.panel.querySelector<HTMLButtonElement>('button.btn')
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        e.preventDefault()
        this.restartHandler?.()
      })
    }
  }
}
