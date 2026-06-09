import { Game } from './game'

const game = new Game()
game.start().catch((err) => {
  console.error('Failed to start game:', err)
  const overlay = document.getElementById('overlay')
  const panel = document.getElementById('panel')
  if (overlay && panel) {
    panel.innerHTML = `<h1>Error</h1><p style="color:#f72585">${(err as Error).message}</p>`
    overlay.classList.add('visible')
  }
})

// Audio toggle button
const audioBtn = document.getElementById('audio-toggle')
if (audioBtn) {
  let muted = false
  try {
    muted = window.localStorage.getItem('cube-runner-muted') === '1'
  } catch {}
  const refresh = () => {
    audioBtn.textContent = muted ? '🔇' : '🔊'
    audioBtn.classList.toggle('muted', muted)
  }
  refresh()
  audioBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    e.preventDefault()
    muted = !muted
    refresh()
    try {
      window.localStorage.setItem('cube-runner-muted', muted ? '1' : '0')
    } catch {}
    game.setMuted(muted)
  })
}
