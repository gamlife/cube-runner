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
